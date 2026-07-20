#!/usr/bin/env node

import { readFileSync } from "node:fs";

const paths = {
  sql: "deploy/postgres/public-clinic-slug-bootstrap-resolver.sql",
  deploy: "deploy/host/deploy-test-saas.sh",
  repo: "apps/webapp/src/infra/repos/pgClinicDirectory.ts",
  page: "apps/webapp/src/app/book/[slug]/page.tsx",
  rsc: "apps/webapp/src/app/book/publicOrganizationBooking.ts",
  runtimeOverlayLib: "deploy/host/runtime-overlay-rehydrate-lib.sh",
  d34: "deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql",
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

function requireOrderedFragments(label, text, fragments) {
  let cursor = 0;
  for (const fragment of fragments) {
    const index = text.indexOf(fragment, cursor);
    if (index < 0) throw new Error(`${label} missing ordered fragment: ${fragment}`);
    cursor = index + fragment.length;
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
    "CREATE OR REPLACE FUNCTION app.resolve_public_organization_slug(p_slug text)",
    "ALTER FUNCTION app.resolve_public_organization_slug(text) OWNER TO app_owner",
    "REVOKE ALL ON FUNCTION app.resolve_public_organization_slug(text) FROM PUBLIC",
    "GRANT EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) TO app_patient",
    "ALTER FUNCTION app.resolve_public_organization_by_slug(text) OWNER TO app_owner",
    "REVOKE ALL ON FUNCTION app.resolve_public_organization_by_slug(text) FROM PUBLIC",
    "GRANT EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) TO app_patient",
    "NOT has_table_privilege('app_patient', 'public.clinic_public_directory_entries', 'SELECT')",
    "NOT has_table_privilege('app_patient', 'public.be_organizations', 'SELECT')",
    "directory.is_published = true",
    "organization.is_active = true",
    "requested.slug = lower(btrim(p_slug))",
    "requested.kind IN ('current', 'alias')",
    "current_claim.kind = 'current'",
    "NOT has_table_privilege('app_patient', 'public.organization_slug_claims', 'SELECT')",
  ]);
  forbidFragments(paths.sql, files.sql, [
    "GRANT SELECT ON TABLE public.organization_slug_claims TO app_patient",
    "GRANT SELECT ON TABLE public.clinic_public_directory_entries TO app_patient",
    "GRANT SELECT ON TABLE public.be_organizations TO app_patient",
  ]);

  requireFragments(paths.repo, files.repo, [
    "async resolveOrganizationIdBySlug(slug)",
    "SELECT app.resolve_public_organization_by_slug(",
    "async resolveCanonicalSlug(slug)",
    "SELECT * FROM app.resolve_public_organization_slug(",
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
    'RUNTIME_OVERLAY_LIB="$DEPLOY_TEST_SAAS_SCRIPT_DIR/runtime-overlay-rehydrate-lib.sh"',
    'source "$RUNTIME_OVERLAY_LIB"',
    "rehydrate_post_restore_runtime_overlays(){",
    "runtime_overlay_apply_post_migration_chain",
    '[ -r "$SRC_REPO/$PUBLIC_CLINIC_SLUG_BOOTSTRAP_RESOLVER" ]',
  ]);
  requireOrderedFragments(`${paths.deploy} shared overlay composition`, files.deploy, [
    'source "$RUNTIME_OVERLAY_LIB"',
    "rehydrate_post_restore_runtime_overlays(){",
    "runtime_overlay_apply_post_migration_chain",
    'log "strict closure: reviewed runtime overlays"',
    "rehydrate_post_restore_runtime_overlays",
  ]);
  forbidFragments(paths.deploy, files.deploy, [
    'psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$PUBLIC_CLINIC_SLUG_BOOTSTRAP_RESOLVER"',
  ]);
  requireOrderedFragments(`${paths.runtimeOverlayLib} protected resolver order`, files.runtimeOverlayLib, [
    "deploy/postgres/public-booking-bootstrap-resolver.sql",
    "deploy/postgres/public-clinic-slug-bootstrap-resolver.sql",
    "deploy/postgres/e1-webapp-runtime-config.sql",
  ]);

  requireFragments(`${paths.d34} locked base-login closure`, files.d34, [
    "to_regprocedure('app.resolve_public_organization_slug(text)') IS NOT NULL",
    "to_regprocedure('app.resolve_public_organization_by_slug(text)') IS NOT NULL",
    "REVOKE EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) FROM :\"d3_4_bootstrap_base_role\";",
    "REVOKE EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) FROM :\"d3_4_bootstrap_base_role\";",
    "REVOKE ALL PRIVILEGES ON FUNCTION app.resolve_public_organization_slug(text)",
    "REVOKE ALL PRIVILEGES ON FUNCTION app.resolve_public_organization_by_slug(text)",
    "GRANT EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) TO :\"d3_4_bootstrap_base_role\";",
    "GRANT EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) TO :\"d3_4_bootstrap_base_role\";",
    "'app.resolve_public_organization_slug(text)'::regprocedure",
    "'app.resolve_public_organization_by_slug(text)'::regprocedure",
    "'app.resolve_public_organization_by_slug(text)',\n    'EXECUTE'",
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
      sql: files.sql.replace(
        "REVOKE ALL ON FUNCTION app.resolve_public_organization_slug(text) FROM PUBLIC",
        "",
      ),
    },
    {
      sql: `${files.sql}\nGRANT SELECT ON TABLE public.be_organizations TO app_patient;`,
    },
    {
      sql: `${files.sql}\nGRANT SELECT ON TABLE public.organization_slug_claims TO app_patient;`,
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
      runtimeOverlayLib: files.runtimeOverlayLib.replace(
        "    deploy/postgres/public-clinic-slug-bootstrap-resolver.sql\n",
        "",
      ),
    },
    {
      runtimeOverlayLib: files.runtimeOverlayLib.replace(
        "    deploy/postgres/public-booking-bootstrap-resolver.sql\n    deploy/postgres/public-clinic-slug-bootstrap-resolver.sql",
        "    deploy/postgres/public-clinic-slug-bootstrap-resolver.sql\n    deploy/postgres/public-booking-bootstrap-resolver.sql",
      ),
    },
    {
      deploy: files.deploy.replace(
        '  log "strict closure: reviewed runtime overlays"\n  rehydrate_post_restore_runtime_overlays',
        "  # missing shared runtime overlay invocation",
      ),
    },
    {
      d34: files.d34.replace(
        "GRANT EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) TO :\"d3_4_bootstrap_base_role\";",
        "-- missing locked base-login canonical slug resolver grant",
      ),
    },
    {
      d34: files.d34.replace(
        "GRANT EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) TO :\"d3_4_bootstrap_base_role\";",
        "-- missing locked base-login slug resolver grant",
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
