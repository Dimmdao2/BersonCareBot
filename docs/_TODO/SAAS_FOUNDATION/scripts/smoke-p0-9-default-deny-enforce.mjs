#!/usr/bin/env node

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const scratchUrl = process.env.SCRATCH_DATABASE_URL;
const psqlAsPostgres = process.env.P0_9_1_PSQL_AS_POSTGRES === "1";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertSafeScratchUrl(url) {
  if (!url) {
    fail("SCRATCH_DATABASE_URL is required for P0.9.1 scratch smoke.");
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    fail(`Invalid SCRATCH_DATABASE_URL: ${error.message}`);
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    fail("SCRATCH_DATABASE_URL must use postgres/postgresql protocol.");
  }

  const dbName = parsed.pathname.replace(/^\//, "");

  if (!dbName || (!dbName.startsWith("bcb_saas_") && !dbName.includes("scratch"))) {
    fail("Scratch database name must start with bcb_saas_ or contain scratch.");
  }

  if (/bcb_webapp_(dev|prod|test)/.test(dbName)) {
    fail("P0.9.1 scratch smoke refuses dev/prod/test application databases.");
  }
}

const orgA = "00000000-0000-4000-8000-000000000001";
const orgB = "00000000-0000-4000-8000-000000000002";

const sql = String.raw`
\set ON_ERROR_STOP on

SELECT (
  current_database() LIKE 'bcb_saas_%'
  OR current_database() ~ '(^|[_-])scratch([_-]|$)'
)::int AS p0_9_1_scratch_db_ok \gset

\if :p0_9_1_scratch_db_ok
\else
\echo 'FATAL: P0.9.1 scratch smoke must run only on a scratch/SaaS proof database.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT (current_database() ~ 'bcb_webapp_(dev|prod|test)')::int AS p0_9_1_runtime_db \gset
\if :p0_9_1_runtime_db
\echo 'FATAL: P0.9.1 scratch smoke refuses dev/prod/test application databases.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

DROP SCHEMA IF EXISTS p0_9_1 CASCADE;
DROP ROLE IF EXISTS p0_9_1_app;
DROP ROLE IF EXISTS p0_9_1_owner;

CREATE ROLE p0_9_1_owner NOLOGIN NOBYPASSRLS;
CREATE ROLE p0_9_1_app NOLOGIN NOBYPASSRLS;

CREATE SCHEMA p0_9_1 AUTHORIZATION p0_9_1_owner;
GRANT USAGE ON SCHEMA p0_9_1 TO p0_9_1_app;

CREATE TABLE p0_9_1.scoped_rows (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  payload text NOT NULL
);

CREATE TABLE p0_9_1.bootstrap_hybrid_rows (
  id uuid PRIMARY KEY,
  organization_id uuid,
  payload text NOT NULL
);

CREATE TABLE p0_9_1.bootstrap_global_rows (
  id uuid PRIMARY KEY,
  payload text NOT NULL
);

CREATE TABLE p0_9_1.explicit_infra_rows (
  id uuid PRIMARY KEY,
  payload text NOT NULL
);

CREATE TABLE p0_9_1.explicit_legacy_rows (
  id uuid PRIMARY KEY,
  payload text NOT NULL
);

CREATE TABLE p0_9_1.explicit_telemetry_rows (
  id uuid PRIMARY KEY,
  payload text NOT NULL
);

CREATE TABLE p0_9_1.unknown_rows (
  id uuid PRIMARY KEY,
  payload text NOT NULL
);

ALTER TABLE p0_9_1.scoped_rows OWNER TO p0_9_1_owner;
ALTER TABLE p0_9_1.bootstrap_hybrid_rows OWNER TO p0_9_1_owner;
ALTER TABLE p0_9_1.bootstrap_global_rows OWNER TO p0_9_1_owner;
ALTER TABLE p0_9_1.explicit_infra_rows OWNER TO p0_9_1_owner;
ALTER TABLE p0_9_1.explicit_legacy_rows OWNER TO p0_9_1_owner;
ALTER TABLE p0_9_1.explicit_telemetry_rows OWNER TO p0_9_1_owner;
ALTER TABLE p0_9_1.unknown_rows OWNER TO p0_9_1_owner;

GRANT SELECT ON ALL TABLES IN SCHEMA p0_9_1 TO p0_9_1_app;

INSERT INTO p0_9_1.scoped_rows (id, organization_id, payload)
VALUES
  (md5('p0.9.1 scoped org a')::uuid, '${orgA}', 'org-a'),
  (md5('p0.9.1 scoped org b')::uuid, '${orgB}', 'org-b');

INSERT INTO p0_9_1.bootstrap_hybrid_rows (id, organization_id, payload)
VALUES
  (md5('p0.9.1 bootstrap global')::uuid, NULL, 'global'),
  (md5('p0.9.1 bootstrap org a')::uuid, '${orgA}', 'org-a'),
  (md5('p0.9.1 bootstrap org b')::uuid, '${orgB}', 'org-b');

INSERT INTO p0_9_1.bootstrap_global_rows (id, payload)
VALUES (md5('p0.9.1 bootstrap global row')::uuid, 'bootstrap-global');

INSERT INTO p0_9_1.explicit_infra_rows (id, payload)
VALUES (md5('p0.9.1 infra')::uuid, 'infra');

INSERT INTO p0_9_1.explicit_legacy_rows (id, payload)
VALUES (md5('p0.9.1 legacy')::uuid, 'legacy');

INSERT INTO p0_9_1.explicit_telemetry_rows (id, payload)
VALUES (md5('p0.9.1 telemetry')::uuid, 'telemetry');

INSERT INTO p0_9_1.unknown_rows (id, payload)
VALUES (md5('p0.9.1 unknown')::uuid, 'unknown');

ALTER TABLE p0_9_1.scoped_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE p0_9_1.scoped_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_9_1_scoped_enforce ON p0_9_1.scoped_rows
  FOR SELECT
  USING (
    NULLIF(current_setting('app.org', true), '') IS NOT NULL
    AND organization_id = NULLIF(current_setting('app.org', true), '')::uuid
  );

ALTER TABLE p0_9_1.bootstrap_hybrid_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE p0_9_1.bootstrap_hybrid_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_9_1_bootstrap_hybrid ON p0_9_1.bootstrap_hybrid_rows
  FOR SELECT
  USING (
    organization_id IS NULL
    OR (
      NULLIF(current_setting('app.org', true), '') IS NOT NULL
      AND organization_id = NULLIF(current_setting('app.org', true), '')::uuid
    )
  );

ALTER TABLE p0_9_1.bootstrap_global_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE p0_9_1.bootstrap_global_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_9_1_bootstrap_global ON p0_9_1.bootstrap_global_rows FOR SELECT USING (true);

ALTER TABLE p0_9_1.explicit_infra_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE p0_9_1.explicit_infra_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_9_1_explicit_infra ON p0_9_1.explicit_infra_rows FOR SELECT USING (true);

ALTER TABLE p0_9_1.explicit_legacy_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE p0_9_1.explicit_legacy_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_9_1_explicit_legacy ON p0_9_1.explicit_legacy_rows FOR SELECT USING (false);

ALTER TABLE p0_9_1.explicit_telemetry_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE p0_9_1.explicit_telemetry_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY p0_9_1_explicit_telemetry ON p0_9_1.explicit_telemetry_rows FOR SELECT USING (true);

ALTER TABLE p0_9_1.unknown_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE p0_9_1.unknown_rows FORCE ROW LEVEL SECURITY;

SET ROLE p0_9_1_app;
SET row_security = on;

RESET app.org;
SELECT count(*)::int AS scoped_unset_count FROM p0_9_1.scoped_rows \gset
\if :scoped_unset_count
\echo 'FATAL: missing app.org must deny SCOPED rows in enforce mode.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.org = '${orgB}';
SELECT count(*)::int AS scoped_wrong_count FROM p0_9_1.scoped_rows WHERE payload = 'org-a' \gset
\if :scoped_wrong_count
\echo 'FATAL: wrong app.org must deny non-matching SCOPED rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.org = '${orgA}';
SELECT count(*)::int AS scoped_correct_count FROM p0_9_1.scoped_rows \gset
\if :scoped_correct_count
\else
\echo 'FATAL: correct app.org must permit matching SCOPED rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT count(*)::int AS scoped_correct_exact_count FROM p0_9_1.scoped_rows WHERE payload = 'org-a' \gset
\if :scoped_correct_exact_count
\else
\echo 'FATAL: correct app.org must expose the org A SCOPED row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT count(*)::int AS scoped_wrong_org_visible_count FROM p0_9_1.scoped_rows WHERE payload = 'org-b' \gset
\if :scoped_wrong_org_visible_count
\echo 'FATAL: correct app.org must not expose other org SCOPED rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

RESET app.org;
SELECT count(*)::int AS bootstrap_unset_count FROM p0_9_1.bootstrap_hybrid_rows \gset
\if :bootstrap_unset_count
\else
\echo 'FATAL: BOOTSTRAP hybrid must keep global rows readable before org context.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT count(*)::int AS bootstrap_unset_org_count FROM p0_9_1.bootstrap_hybrid_rows WHERE organization_id IS NOT NULL \gset
\if :bootstrap_unset_org_count
\echo 'FATAL: BOOTSTRAP hybrid must not expose org rows before org context.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT count(*)::int AS bootstrap_global_count FROM p0_9_1.bootstrap_global_rows \gset
\if :bootstrap_global_count
\else
\echo 'FATAL: BOOTSTRAP global descriptor must be readable before org context.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT count(*)::int AS infra_count FROM p0_9_1.explicit_infra_rows \gset
SELECT count(*)::int AS legacy_count FROM p0_9_1.explicit_legacy_rows \gset
SELECT count(*)::int AS telemetry_count FROM p0_9_1.explicit_telemetry_rows \gset
\if :infra_count
\else
\echo 'FATAL: explicit INFRA descriptor behavior must be readable.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
\if :legacy_count
\echo 'FATAL: LEGACY frozen descriptor behavior must deny rows in enforce mode.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
\if :telemetry_count
\else
\echo 'FATAL: explicit TELEMETRY descriptor behavior must be readable.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT count(*)::int AS unknown_count FROM p0_9_1.unknown_rows \gset
\if :unknown_count
\echo 'FATAL: unknown/missing descriptor must fail closed under RLS default deny.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

\echo 'P0.9.1 default-deny enforce scratch smoke OK: SCOPED fail-closed, BOOTSTRAP pre-context readable, INFRA/TELEMETRY explicit readable, LEGACY frozen denied, unknown descriptor denied.'
`;

assertSafeScratchUrl(scratchUrl);

const tempDir = mkdtempSync(join(tmpdir(), "p0-9-1-smoke-"));
const sqlFile = join(tempDir, "smoke.sql");

try {
  chmodSync(tempDir, 0o755);
  writeFileSync(sqlFile, sql);
  chmodSync(sqlFile, 0o644);

  const command = psqlAsPostgres ? "sudo" : "psql";
  const args = psqlAsPostgres
    ? ["-n", "-u", "postgres", "psql", "-f", sqlFile, scratchUrl]
    : ["-f", sqlFile, scratchUrl];

  const result = spawnSync(command, args, {
    stdio: "inherit",
  });

  if (result.error) {
    fail(`Failed to start ${command}: ${result.error.message}`);
  }

  process.exit(result.status ?? 1);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
