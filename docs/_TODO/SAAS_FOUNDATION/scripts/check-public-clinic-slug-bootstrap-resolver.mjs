#!/usr/bin/env node

import { readFileSync } from "node:fs";

const paths = {
  sql: "deploy/postgres/public-clinic-slug-bootstrap-resolver.sql",
  deploy: "deploy/host/deploy-test-saas.sh",
  repo: "apps/webapp/src/infra/repos/pgClinicDirectory.ts",
  page: "apps/webapp/src/app/book/[slug]/page.tsx",
  rsc: "apps/webapp/src/app/book/publicOrganizationBooking.ts",
};

function requireFragments(label, text, fragments) {
  const missing = fragments.filter((fragment) => !text.includes(fragment));
  if (missing.length > 0) {
    throw new Error(`${label} missing required fragment(s):\n- ${missing.join("\n- ")}`);
  }
}

function forbidFragments(label, text, fragments) {
  const present = fragments.filter((fragment) => text.includes(fragment));
  if (present.length > 0) {
    throw new Error(`${label} contains forbidden fragment(s):\n- ${present.join("\n- ")}`);
  }
}

function load(overrides = {}) {
  return Object.fromEntries(
    Object.entries(paths).map(([key, path]) => [key, overrides[key] ?? readFileSync(path, "utf8")]),
  );
}

function runChecks(overrides = {}) {
  const files = load(overrides);

  requireFragments(paths.sql, files.sql, [
    "SECURITY DEFINER",
    "SET search_path = pg_catalog",
    "ALTER FUNCTION app.resolve_public_organization_by_slug(text) OWNER TO app_owner",
    "REVOKE ALL ON FUNCTION app.resolve_public_organization_by_slug(text) FROM PUBLIC",
    "GRANT EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) TO app_patient",
    "NOT has_table_privilege('app_patient', 'public.clinic_public_directory_entries', 'SELECT')",
    "NOT has_table_privilege('app_patient', 'public.be_organizations', 'SELECT')",
    "d.is_published = true",
    "o.is_active = true",
    "v_normalized := lower(btrim(p_slug))",
  ]);
  forbidFragments(paths.sql, files.sql, [
    "GRANT SELECT ON TABLE public.clinic_public_directory_entries TO app_patient",
    "GRANT SELECT ON TABLE public.be_organizations TO app_patient",
  ]);

  requireFragments(paths.repo, files.repo, [
    "async resolveOrganizationIdBySlug(slug)",
    "SELECT app.resolve_public_organization_by_slug(",
  ]);

  requireFragments(paths.rsc, files.rsc, [
    "stampBootstrapPrincipal(",
    "deps.clinicDirectory.resolveOrganizationIdBySlug(slugRaw)",
  ]);

  requireFragments(paths.page, files.page, [
    "resolvePublicOrganizationBySlugRsc(slug)",
    "if (!resolved) notFound();",
  ]);

  requireFragments(paths.deploy, files.deploy, [
    "PUBLIC_CLINIC_SLUG_BOOTSTRAP_RESOLVER=deploy/postgres/public-clinic-slug-bootstrap-resolver.sql",
    'psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$PUBLIC_CLINIC_SLUG_BOOTSTRAP_RESOLVER"',
  ]);

  return true;
}

function selfTest() {
  const files = load();

  const cases = [
    {
      sql: files.sql.replace(
        "REVOKE ALL ON FUNCTION app.resolve_public_organization_by_slug(text) FROM PUBLIC",
        "",
      ),
    },
    {
      sql: `${files.sql}\nGRANT SELECT ON TABLE public.be_organizations TO app_patient;`,
    },
    {
      repo: files.repo.replace(
        "SELECT app.resolve_public_organization_by_slug(",
        "SELECT app.resolve_public_organization_by_slug_missing(",
      ),
    },
    {
      page: files.page.replace("if (!resolved) notFound();", "// missing fail-closed 404"),
    },
    {
      deploy: files.deploy.replace(
        'psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$PUBLIC_CLINIC_SLUG_BOOTSTRAP_RESOLVER"',
        "-- missing deploy invocation",
      ),
    },
  ];

  const missed = [];
  for (const [index, testCase] of cases.entries()) {
    try {
      runChecks(testCase);
      missed.push(index);
    } catch {
      // expected
    }
  }
  if (missed.length > 0) throw new Error(`self-test missed mutations: ${missed.join(", ")}`);
  console.log("check-public-clinic-slug-bootstrap-resolver: self-test OK");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  runChecks();
  console.log("check-public-clinic-slug-bootstrap-resolver: OK");
}
