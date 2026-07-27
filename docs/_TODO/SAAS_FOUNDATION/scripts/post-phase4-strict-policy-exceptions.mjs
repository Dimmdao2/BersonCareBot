// Public organization-scoped tables introduced after the historical Phase 0
// taxonomy and protected by reviewed exact-organization FORCE-RLS artifacts.
// Keep policy evidence here so coverage and taxonomy guards share one source.
export const postPhase4StrictPolicyExceptions = new Map([
  ...[
    "saas_billing_accounts",
    "saas_billing_subscriptions",
    "saas_billing_invoices",
    "saas_billing_provider_events",
  ].map((table) => [
    `public.${table}`,
    {
      reason:
        "Post-Phase-4 SaaS billing data is organization-owned, FORCE RLS, staff exact-org read-only, and globally mutable only through the platform principal.",
      policyPath: "apps/webapp/db/drizzle-migrations/0259_saas_billing_foundation.sql",
      policyTokens: [
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
        `CREATE POLICY ${table}_staff_select`,
        "AND organization_id = app.current_org_id()",
        `CREATE POLICY ${table}_platform_select`,
        `CREATE POLICY ${table}_platform_insert`,
        `CREATE POLICY ${table}_platform_update`,
      ],
    },
  ]),
  [
    "public.organization_slug_claims",
    {
      reason:
        "Post-Phase-4 U6B slug ownership is created with exact-org FORCE RLS in its own migration.",
      policyPath: "apps/webapp/db/drizzle-migrations/0218_u6b_organization_slug_claims.sql",
      policyTokens: [
        "ALTER TABLE public.organization_slug_claims ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE public.organization_slug_claims FORCE ROW LEVEL SECURITY;",
        "CREATE POLICY organization_slug_claims_exact_org_staff",
        "USING (organization_id = app.current_org_id())",
        "WITH CHECK (organization_id = app.current_org_id())",
      ],
    },
  ],
  [
    "public.organization_slug_rename_events",
    {
      reason:
        "Post-Phase-4 U6B append-only rename audit is created with exact-org FORCE RLS in its own migration.",
      policyPath: "apps/webapp/db/drizzle-migrations/0218_u6b_organization_slug_claims.sql",
      policyTokens: [
        "ALTER TABLE public.organization_slug_rename_events ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE public.organization_slug_rename_events FORCE ROW LEVEL SECURITY;",
        "CREATE POLICY organization_slug_rename_events_select_org_staff",
        "CREATE POLICY organization_slug_rename_events_insert_org_staff",
        "USING (organization_id = app.current_org_id())",
        "WITH CHECK (organization_id = app.current_org_id())",
      ],
    },
  ],
  [
    "public.org_brand_revisions",
    {
      reason:
        "Post-Phase-4 UX-05 B1 organization brand publication is created with exact-org FORCE RLS plus a published-only enrolled-patient read policy in its own migration.",
      policyPath: "apps/webapp/db/drizzle-migrations/0238_org_brand_publication.sql",
      policyTokens: [
        "ALTER TABLE public.org_brand_revisions ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE public.org_brand_revisions FORCE ROW LEVEL SECURITY;",
        "CREATE POLICY org_brand_revisions_exact_org_staff ON public.org_brand_revisions",
        "app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()",
        "CREATE POLICY org_brand_revisions_enrolled_patient_published_read ON public.org_brand_revisions",
        "AND app.current_patient_user_id() IS NOT NULL",
        "GRANT SELECT, INSERT, UPDATE ON TABLE public.org_brand_revisions TO app_staff;",
        "GRANT SELECT ON TABLE public.org_brand_revisions TO app_patient;",
      ],
    },
  ],
  [
    "public.manual_patient_commands",
    {
      reason:
        "Post-Phase-4 U3B exact-organization staff-only command table is protected by the mandatory patient-invite runtime overlay.",
      policyPath: "deploy/postgres/patient-invites-rls.sql",
      policyTokens: [
        "ALTER TABLE public.manual_patient_commands ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE public.manual_patient_commands FORCE ROW LEVEL SECURITY;",
        "CREATE POLICY manual_patient_commands_exact_staff_org ON public.manual_patient_commands",
        "USING (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())",
        "WITH CHECK (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())",
        "GRANT SELECT, INSERT ON TABLE public.manual_patient_commands TO app_staff;",
        "REVOKE ALL ON TABLE public.manual_patient_commands FROM app_patient;",
      ],
    },
  ],
]);
