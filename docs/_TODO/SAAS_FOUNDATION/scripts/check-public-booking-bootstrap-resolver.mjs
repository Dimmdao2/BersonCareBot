#!/usr/bin/env node

import { readFileSync } from "node:fs";

const paths = {
  sql: "deploy/postgres/public-booking-bootstrap-resolver.sql",
  deploy: "deploy/host/deploy-test-saas.sh",
  route: "apps/webapp/src/app/api/booking/public/slots/route.ts",
  repo: "apps/webapp/src/infra/repos/pgBookingScheduling.ts",
  d34: "deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql",
  runtimeOverlayLib: "deploy/host/runtime-overlay-rehydrate-lib.sh",
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
    "AND 6 = (",
    "AND 4 = (",
    "accessor.oid IN (",
    "'app.resolve_public_booking_organization(uuid,uuid,uuid)'::regprocedure",
    "'app.resolve_public_organization_by_slug(text)'::regprocedure",
    "privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'app_patient')",
  ]);
  forbidFragments(paths.d34, files.d34, [
    'GRANT SELECT ON TABLE public.system_settings TO :"d3_4_bootstrap_base_role"',
    "GRANT EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) TO PUBLIC",
  ]);
  requireFragments(paths.route, files.route, [
    "const publicContext = await resolveSlugBoundPublicInPersonBookingOrganization(deps, parsed.data)",
    "{ organizationId: publicContext.organizationId, source: \"api/booking/public/slots:GET\" }",
    "const ctx = await resolveInPersonBookingContext(deps, publicContext.keys)",
    "ctx.organizationId !== publicContext.organizationId",
  ]);

  requireFragments(paths.deploy, files.deploy, [
    "PUBLIC_BOOKING_BOOTSTRAP_RESOLVER=deploy/postgres/public-booking-bootstrap-resolver.sql",
    'RUNTIME_OVERLAY_LIB="$DEPLOY_TEST_SAAS_SCRIPT_DIR/runtime-overlay-rehydrate-lib.sh"',
    'source "$RUNTIME_OVERLAY_LIB"',
    "rehydrate_post_restore_runtime_overlays(){",
    "runtime_overlay_apply_post_migration_chain",
    '"$PATIENT_VAPID_ACCESSOR" "$PUBLIC_BOOKING_BOOTSTRAP_RESOLVER" "$PUBLIC_CLINIC_SLUG_BOOTSTRAP_RESOLVER"',
    '"$D3_4_BOOTSTRAP_GRANTS" "$TEST_STRICT_RLS_FINALIZER"',
    '[ -r "$SRC_REPO/$PUBLIC_BOOKING_BOOTSTRAP_RESOLVER" ]',
  ]);
  requireOrderedFragments(`${paths.deploy} shared overlay composition`, files.deploy, [
    'source "$RUNTIME_OVERLAY_LIB"',
    "rehydrate_post_restore_runtime_overlays(){",
    "runtime_overlay_apply_post_migration_chain",
    'log "strict closure: reviewed runtime overlays"',
    "rehydrate_post_restore_runtime_overlays",
  ]);
  forbidFragments(paths.deploy, files.deploy, [
    'psql -d "$DB" -X -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$PUBLIC_BOOKING_BOOTSTRAP_RESOLVER"',
  ]);
  requireOrderedFragments(`${paths.runtimeOverlayLib} protected resolver order`, files.runtimeOverlayLib, [
    "deploy/postgres/patient-web-push-vapid-public-key-accessor.sql",
    "deploy/postgres/public-booking-bootstrap-resolver.sql",
    "deploy/postgres/public-clinic-slug-bootstrap-resolver.sql",
    "deploy/postgres/e1-webapp-runtime-config.sql",
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
      d34: readFileSync(paths.d34, "utf8").replace("AND 6 = (", "AND 5 = ("),
    },
    {
      d34: readFileSync(paths.d34, "utf8").replace("AND 4 = (", "AND 3 = ("),
    },
    {
      route: readFileSync(paths.route, "utf8").replace(
        "const publicContext = await resolveSlugBoundPublicInPersonBookingOrganization(deps, parsed.data)",
        "const publicContext = await resolveSlugBoundPublicInPersonBookingOrganizationMissing(deps, parsed.data)",
      ),
    },
    {
      runtimeOverlayLib: readFileSync(paths.runtimeOverlayLib, "utf8").replace(
        "    deploy/postgres/public-booking-bootstrap-resolver.sql\n",
        "",
      ),
    },
    {
      runtimeOverlayLib: readFileSync(paths.runtimeOverlayLib, "utf8").replace(
        "    deploy/postgres/public-booking-bootstrap-resolver.sql\n    deploy/postgres/public-clinic-slug-bootstrap-resolver.sql",
        "    deploy/postgres/public-clinic-slug-bootstrap-resolver.sql\n    deploy/postgres/public-booking-bootstrap-resolver.sql",
      ),
    },
    {
      deploy: readFileSync(paths.deploy, "utf8").replace(
        '  log "strict closure: reviewed runtime overlays"\n  rehydrate_post_restore_runtime_overlays',
        "  # missing shared runtime overlay invocation",
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
