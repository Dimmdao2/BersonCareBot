#!/usr/bin/env node

import { readFileSync } from "node:fs";

const paths = {
  sql: "deploy/postgres/public-booking-bootstrap-resolver.sql",
  deploy: "deploy/host/deploy-test-saas.sh",
  route: "apps/webapp/src/app/api/booking/public/slots/route.ts",
  repo: "apps/webapp/src/infra/repos/pgBookingScheduling.ts",
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
    "ALTER FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) OWNER TO app_owner",
    "REVOKE ALL ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) FROM PUBLIC",
    "GRANT EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) TO app_patient",
    "NOT has_table_privilege('app_patient', 'public.be_branches', 'SELECT')",
    "NOT has_table_privilege('app_patient', 'public.be_clinic_services', 'SELECT')",
    "NOT has_table_privilege('app_patient', 'public.be_specialist_service_availability', 'SELECT')",
    "NOT has_table_privilege('app_patient', 'public.be_external_entity_mappings', 'SELECT')",
    "IF (p_branch_id IS NULL) <> (p_service_id IS NULL) THEN",
    "IF p_branch_id IS NOT NULL AND p_service_id IS NOT NULL THEN",
    "cardinality(v_organization_ids) = 1",
    "s.public_widget_visible = true",
    "s.admin_manual_only = false",
  ]);
  forbidFragments(paths.sql, files.sql, [
    "GRANT SELECT ON TABLE public.be_branches TO app_patient",
    "GRANT SELECT ON TABLE public.be_clinic_services TO app_patient",
    "GRANT SELECT ON TABLE public.be_specialist_service_availability TO app_patient",
    "GRANT SELECT ON TABLE public.be_external_entity_mappings TO app_patient",
  ]);

  requireFragments(paths.repo, files.repo, [
    "async resolvePublicBookingOrganization({ branchId, serviceId, branchServiceId })",
    "SELECT app.resolve_public_booking_organization(",
  ]);
  requireFragments(paths.d34, files.d34, [
    "to_regprocedure('app.resolve_public_booking_organization(uuid,uuid,uuid)') IS NOT NULL",
    "REVOKE ALL PRIVILEGES ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid)",
    "FROM :\"d3_4_bootstrap_base_role\" CASCADE;",
    "REVOKE ALL PRIVILEGES ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid)\n  FROM PUBLIC;",
    "GRANT EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) TO :\"d3_4_bootstrap_base_role\";",
    "REVOKE EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) FROM :\"d3_4_bootstrap_base_role\";",
    "'app.resolve_public_booking_organization(uuid,uuid,uuid)'::regprocedure",
    "AND privilege.grantee = bootstrap_role.oid",
    "AND NOT privilege.is_grantable",
    "AND 3 = (",
    "procedure.oid = 'app.resolve_public_booking_organization(uuid,uuid,uuid)'::regprocedure",
    "privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'app_patient')",
  ]);
  forbidFragments(paths.d34, files.d34, [
    'GRANT SELECT ON TABLE public.system_settings TO :"d3_4_bootstrap_base_role"',
    "GRANT EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) TO PUBLIC",
  ]);
  requireFragments(paths.route, files.route, [
    "const publicContext = await resolvePublicInPersonBookingOrganization(deps, parsed.data)",
    "{ organizationId: publicContext.organizationId, source: \"api/booking/public/slots:GET\" }",
    "const ctx = await resolveInPersonBookingContext(deps, publicContext.keys)",
    "ctx.organizationId !== publicContext.organizationId",
  ]);

  requireFragments(paths.deploy, files.deploy, [
    "PUBLIC_BOOKING_BOOTSTRAP_RESOLVER=deploy/postgres/public-booking-bootstrap-resolver.sql",
    'psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$PUBLIC_BOOKING_BOOTSTRAP_RESOLVER"',
    '"$PATIENT_VAPID_ACCESSOR" "$PUBLIC_BOOKING_BOOTSTRAP_RESOLVER" "$PUBLIC_CLINIC_SLUG_BOOTSTRAP_RESOLVER"',
    '"$D3_4_BOOTSTRAP_GRANTS" "$TEST_STRICT_RLS_FINALIZER"',
    '[ -r "$SRC_REPO/$PUBLIC_BOOKING_BOOTSTRAP_RESOLVER" ]',
  ]);
}

if (process.argv.includes("--self-test")) {
  const cases = [
    {
      sql: readFileSync(paths.sql, "utf8").replace(
        "REVOKE ALL ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) FROM PUBLIC",
        "",
      ),
    },
    {
      d34: readFileSync(paths.d34, "utf8").replace(
        "GRANT EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) TO :\"d3_4_bootstrap_base_role\";",
        "-- missing direct bootstrap grant",
      ),
    },
    {
      d34: readFileSync(paths.d34, "utf8").replace("AND 3 = (", "AND 2 = ("),
    },
    {
      route: readFileSync(paths.route, "utf8").replace(
        "const publicContext = await resolvePublicInPersonBookingOrganization(deps, parsed.data)",
        "const publicContext = await resolvePublicInPersonBookingOrganizationMissing(deps, parsed.data)",
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
  console.log("public booking bootstrap resolver checker self-test: OK");
} else {
  runChecks();
  console.log("public booking bootstrap resolver checker: OK");
}
