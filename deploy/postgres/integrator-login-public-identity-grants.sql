-- Integrator login role: minimal public.* identity/notification grant closure.
--
-- Defect (root-caused before this overlay was written):
--   `bcb_test_integrator_login` (the integrator API's DB login role on TEST) is NOINHERIT and holds
--   USAGE on schema public + the narrow 20260413_0002/0003 SELECT/UPDATE grants, but ZERO other
--   table privileges on public.*. Its bootstrap/infra technical principals (see the allowlist in
--   apps/integrator/src/infra/db/withClient.ts: `allowedLockedBootstrapSources`, e.g.
--   'telegram-webhook:pre-routing', 'telegram-webhook:unresolved-org', 'max-webhook:pre-routing')
--   do NOT `SET ROLE` -- @bersoncare/db-principal's applySignedDbPrincipal() explicitly returns early
--   for principal.kind IN ('bootstrap', 'infra') without a `SET ROLE` (packages/db-principal/src/index.ts,
--   applySignedDbPrincipal, ~line 863). So every bootstrap-classified DB access runs as the BARE login
--   role. The very first pre-routing read (`SELECT ... FROM public.platform_users` via
--   `getLinkDataByIdentity`, apps/integrator/src/infra/db/repos/channelUsers.ts) fails 42501
--   (permission denied), breaking ALL inbound Telegram/Max on TEST, and the same bare-role gap blocks
--   Track D1's direct writes (apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts)
--   for brand-new/unresolved users, whose whole event-processing pipeline also runs bootstrap
--   (webhook.ts: `runWithBootstrapPrincipal({ source: 'telegram-webhook:unresolved-org' }, handleEvent)`
--   when neither organizationId nor integratorUserId resolve during pre-routing).
--
--   apps/integrator/.../migrations/core/20260413_0002_integrator_grants_public_messenger_canon.sql
--   GRANTs `TO CURRENT_USER` (the migration RUNNER at migrate time, e.g. the deploy/migrator role),
--   NOT the login role that actually serves traffic -- and its own header comment says a follow-up
--   `GRANT ... TO <integrator_application_role>` was needed "so the app role matches production
--   connections". That follow-up was never applied on TEST. On PROD the integrator connection role
--   reportedly has this access via TABLE OWNERSHIP (it ran/owns the D1 scaffold's migrations there);
--   TEST diverges because TEST's login role is a separate, unprivileged runtime identity. See the
--   accompanying prep report for the full table x operation census and the prod-vs-test recommendation.
--
-- Scope of THIS overlay (evidence-based, traced end-to-end, NOT copy-pasted from the webapp D3.4/D2
-- bootstrap overlays which grant an UNRELATED webapp-side login role):
--   public.platform_users            SELECT (whole table) + INSERT/UPDATE (named columns only --
--                                     exactly the columns `insertPlatformUser` / `enrichPlatformUser`
--                                     in writeIdentityAndPreferencesDirect.ts write; mirrors the
--                                     column-scoped-UPDATE idiom p0-5b-grants.sql already uses for this
--                                     same shared table, e.g. app_patient's
--                                     `calendar_timezone`/`reminder_muted_until` UPDATE grant).
--   public.user_channel_bindings     SELECT (whole table) + INSERT (user_id, channel_code, external_id)
--                                     -- `upsertChannelBinding` / candidate-lookup JOIN.
--   public.user_channel_preferences  SELECT + INSERT/UPDATE (named columns) -- `seedChannelPreferencesDefaults`;
--                                     its UPDATE SET clause reads the table's OWN `platform_user_id`
--                                     column via a qualified reference (COALESCE(public.user_channel_
--                                     preferences.platform_user_id, EXCLUDED.platform_user_id)), which
--                                     per Postgres ON CONFLICT semantics requires SELECT, not just INSERT/UPDATE.
--   public.user_notification_topics  INSERT (user_id, topic_code, is_enabled) + UPDATE (is_enabled,
--                                     updated_at) -- `upsertNotificationTopics`.
--   public.be_organization_members   SELECT (whole table; RLS is OFF on this table) --
--                                     `resolveActiveOrganizationIdForMessengerIdentity` /
--                                     `resolveActiveOrganizationIdForIntegratorUserId` /
--                                     `organizationIdForIntegratorUserSql` (apps/integrator/src/infra/db/
--                                     repos/channelUsers.ts).
--   public.system_settings           SELECT (whole table) -- `fetchPublicSystemSettingValueJson`
--                                     (apps/integrator/src/infra/db/publicSystemSettings.ts), read
--                                     directly with raw SQL (not via an `app.*` SECURITY DEFINER
--                                     accessor) by `createMessengerStaffIdsResolver` for the
--                                     admin_telegram_ids/doctor_telegram_ids/admin_max_ids/doctor_max_ids
--                                     lookups inside `buildAdminFacts`, called UNGUARDED (no try/catch)
--                                     from the SAME `runWithBootstrapPrincipal({source:'*-webhook:pre-
--                                     routing'})` block as the platform_users read -- a 42501 here would
--                                     ALSO break every inbound message once platform_users is fixed.
--                                     Table has RLS ENABLED + FORCE with policy
--                                     `organization_id IS NULL OR (app.current_org_id() IS NOT NULL AND
--                                     organization_id = app.current_org_id())` (deploy/postgres/
--                                     phase4-locked-helper-rls-policies.sql); a bootstrap principal has
--                                     no org context, so the policy reduces to `organization_id IS NULL`
--                                     -- i.e. RLS still limits this role to GLOBAL settings rows only,
--                                     same safety property the mark-read/D2/D3 overlays rely on
--                                     ("row scope is enforced by RLS, not by this grant").
--
-- Deliberately NOT granted here (traced, but a plain GRANT would be functionally inert or is out of
-- this overlay's blast radius -- see the prep report for the full reasoning):
--   public.org_enrollments   -- read by the SAME org-resolution queries above. RLS is ENABLED + FORCE
--                             (phase4-force-rls-cutover.sql) with policy `(app.is_staff() AND org
--                             match) OR (app.current_patient_user_id() = platform_user_id)` -- a
--                             bootstrap principal (no staff, no patient id) satisfies NEITHER clause,
--                             so it would see ZERO rows no matter what is granted. Needs a permissive
--                             RLS policy or a SECURITY DEFINER accessor (the pattern already used for
--                             `app.resolve_public_organization_slug` etc.), not a table grant.
--   public.be_organizations  -- read by `resolveDeploymentSingleActiveOrganizationId` (T0.4 single-org
--                             fallback). RLS ENABLED + FORCE (deploy/postgres/c5a-platform-operations-
--                             runtime.sql) with policies ONLY for `app_platform_settings` (full) and
--                             `app_staff` (current-org only) -- same "grant would be inert" situation.
--   platform-merge cascade tables (patient_bookings, etc., reached only via
--                             `mergeCandidateIdsViaPlatformMerge` -> `mergePlatformUsersInTransaction`
--                             on the rare 2+-ambiguous-candidate path) -- out of scope for this minimal
--                             fix; that path already fails closed today (writePort.ts logs + swallows
--                             `MergeConflictError`/`ambiguous_platform_user_candidates`, no write, no throw).
--   `integrator.*` tables (identities, telegram_state, contacts, users) -- these are the integrator's
--                             OWN schema (search_path-qualified, see `FROM integrator.identities` vs
--                             bare `identities` in channelUsers.ts) and outside this overlay's
--                             public.* blast radius by design/instruction.
--
-- Idempotent (repeated GRANT/REVOKE is safe). Invoke with the required psql variable:
--   psql '<database-url>' -v integrator_login_public_identity_grants_role=bcb_test_integrator_login \
--     -f deploy/postgres/integrator-login-public-identity-grants.sql
--
-- Rollback:
--   Re-run with -v integrator_login_public_identity_grants_down=1 (in addition to the role variable).

\set ON_ERROR_STOP on
\pset pager off

\if :{?integrator_login_public_identity_grants_role}
\else
\echo 'FATAL: missing required psql variable integrator_login_public_identity_grants_role.'
SELECT 1 / 0 AS integrator_login_public_identity_grants_role_missing;
\endif

SELECT 1 / (
  length(:'integrator_login_public_identity_grants_role') > 0
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = :'integrator_login_public_identity_grants_role'
      AND rolcanlogin
      AND NOT rolsuper
  )
)::int AS integrator_login_public_identity_grants_role_exists;

\if :{?integrator_login_public_identity_grants_down}
\echo 'Integrator login public identity grants DOWN: revoking.'
REVOKE SELECT ON TABLE public.system_settings FROM :"integrator_login_public_identity_grants_role";
REVOKE SELECT ON TABLE public.be_organization_members FROM :"integrator_login_public_identity_grants_role";
REVOKE INSERT ("user_id", "topic_code", "is_enabled"), UPDATE ("is_enabled", "updated_at")
  ON TABLE public.user_notification_topics FROM :"integrator_login_public_identity_grants_role";
REVOKE SELECT,
  INSERT ("user_id", "platform_user_id", "channel_code", "is_enabled_for_messages", "is_enabled_for_notifications", "updated_at"),
  UPDATE ("platform_user_id", "is_enabled_for_messages", "is_enabled_for_notifications", "updated_at")
  ON TABLE public.user_channel_preferences FROM :"integrator_login_public_identity_grants_role";
REVOKE SELECT, INSERT ("user_id", "channel_code", "external_id")
  ON TABLE public.user_channel_bindings FROM :"integrator_login_public_identity_grants_role";
REVOKE SELECT,
  INSERT ("integrator_user_id", "phone_normalized", "display_name", "first_name", "last_name", "patient_phone_trust_at"),
  UPDATE ("display_name", "first_name", "last_name", "phone_normalized", "patient_phone_trust_at", "integrator_user_id", "updated_at")
  ON TABLE public.platform_users FROM :"integrator_login_public_identity_grants_role";
\echo 'Integrator login public identity grants DOWN complete.'
\else

-- Defensive; USAGE was already applied by 20260413_0003_integrator_grant_usage_on_public_schema.sql,
-- but re-granting is a no-op and keeps this overlay self-contained.
GRANT USAGE ON SCHEMA public TO :"integrator_login_public_identity_grants_role";

-- public.platform_users: whole-table SELECT (candidate lookups, getLinkDataByIdentity, admin-facts
-- resolution all read multiple columns) + column-scoped INSERT/UPDATE matching
-- writeIdentityAndPreferencesDirect.ts's insertPlatformUser/enrichPlatformUser exactly.
GRANT SELECT ON TABLE public.platform_users TO :"integrator_login_public_identity_grants_role";
GRANT INSERT ("integrator_user_id", "phone_normalized", "display_name", "first_name", "last_name", "patient_phone_trust_at")
  ON TABLE public.platform_users TO :"integrator_login_public_identity_grants_role";
GRANT UPDATE ("display_name", "first_name", "last_name", "phone_normalized", "patient_phone_trust_at", "integrator_user_id", "updated_at")
  ON TABLE public.platform_users TO :"integrator_login_public_identity_grants_role";

-- public.user_channel_bindings: whole-table SELECT (candidate JOIN, getLinkDataByIdentity) +
-- column-scoped INSERT matching upsertChannelBinding's INSERT list.
GRANT SELECT ON TABLE public.user_channel_bindings TO :"integrator_login_public_identity_grants_role";
GRANT INSERT ("user_id", "channel_code", "external_id")
  ON TABLE public.user_channel_bindings TO :"integrator_login_public_identity_grants_role";

-- public.user_channel_preferences: SELECT is required because seedChannelPreferencesDefaults'
-- ON CONFLICT DO UPDATE SET clause reads the table's own platform_user_id column by qualified name.
GRANT SELECT ON TABLE public.user_channel_preferences TO :"integrator_login_public_identity_grants_role";
GRANT INSERT ("user_id", "platform_user_id", "channel_code", "is_enabled_for_messages", "is_enabled_for_notifications", "updated_at")
  ON TABLE public.user_channel_preferences TO :"integrator_login_public_identity_grants_role";
GRANT UPDATE ("platform_user_id", "is_enabled_for_messages", "is_enabled_for_notifications", "updated_at")
  ON TABLE public.user_channel_preferences TO :"integrator_login_public_identity_grants_role";

-- public.user_notification_topics: upsertNotificationTopics's SET clause only reads EXCLUDED, so no
-- SELECT is required (matches the p0-5b-grants.sql precedent for this exact ON CONFLICT shape).
GRANT INSERT ("user_id", "topic_code", "is_enabled")
  ON TABLE public.user_notification_topics TO :"integrator_login_public_identity_grants_role";
GRANT UPDATE ("is_enabled", "updated_at")
  ON TABLE public.user_notification_topics TO :"integrator_login_public_identity_grants_role";

-- public.be_organization_members: RLS is OFF on this table (unlike org_enrollments/be_organizations
-- below); a plain whole-table SELECT is fully functional. Mirrors the identical grant the webapp's
-- OWN bootstrap login already holds (deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql).
GRANT SELECT ON TABLE public.be_organization_members TO :"integrator_login_public_identity_grants_role";

-- public.system_settings: RLS ENABLED + FORCE with a global-row (organization_id IS NULL) policy that
-- applies regardless of role, so this whole-table SELECT only ever exposes global settings rows to a
-- bootstrap principal -- never per-organization rows. See header comment for the full trace.
GRANT SELECT ON TABLE public.system_settings TO :"integrator_login_public_identity_grants_role";

\echo 'Integrator login public identity grants UP complete.'
\endif
