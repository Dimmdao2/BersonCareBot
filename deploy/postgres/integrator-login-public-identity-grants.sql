-- Integrator login role: minimal identity/notification grant closure for bootstrap access.
--
-- UPDATE (A7 live re-verify, TEST): the original public.*-only scope below got the
-- `telegram-webhook:pre-routing` platform_users read working, but A7 re-verify against a genuinely
-- NEW telegram id then hit a SECOND, deeper layer of the SAME defect: (1) every RLS-protected table
-- the bootstrap pre-routing/D1 path touches calls `app.*` SECURITY DEFINER helper functions
-- (`current_org_id()`, `is_staff()`, `current_integrator_user_id()`, `current_patient_user_id()`) in
-- its USING/WITH CHECK qual, and Postgres permission-checks every function referenced by an
-- applicable RLS policy at parse time (even when the boolean result is later false/short-circuited) --
-- so a bare `SELECT`/`INSERT` grant on an RLS-FORCE table is not enough without matching `EXECUTE`
-- grants on the exact functions its policies call; and (2) `writeIdentityAndPreferencesDirect`'s
-- retained channel-anchor step (`upsertUser` / `resolveCanonicalIntegratorUserId`) writes/reads the
-- integrator's OWN schema (`identities`, `telegram_state`, `users`) INSIDE the same D1 transaction as
-- the `public.*` writes, in the SAME bare-bootstrap-role context -- so the "integrator.* is out of
-- this overlay's blast radius" carve-out below no longer holds for the tables actually reached by a
-- brand-new user's first inbound message. Both gaps are now closed (see the two new sections after
-- the original public.* scope). Evidence: `/tmp/.../scratchpad/d1-a7-live-proof.md` in the session
-- that iterated this live against TEST via repeated `POST /webhook/telegram` + postgres log tracing.
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
--   platform-merge cascade tables (patient_bookings, etc., reached only via
--                             `mergeCandidateIdsViaPlatformMerge` -> `mergePlatformUsersInTransaction`
--                             on the rare 2+-ambiguous-candidate path) -- out of scope for this minimal
--                             fix; that path already fails closed today (writePort.ts logs + swallows
--                             `MergeConflictError`/`ambiguous_platform_user_candidates`, no write, no throw).
--   integrator.system_settings -- NOT read by the bootstrap pre-routing/D1 path (that path reads
--                             `public.system_settings` via `fetchPublicSystemSettingValueJson`, see
--                             above). `integrator.system_settings` is only written by the admin
--                             `settingsSyncRoute.ts` sync route (a staff-authenticated, non-bootstrap
--                             path) -- confirmed by grep, not exercised in the A7 live re-verify.
--   integration_webhook_last_status / integration_webhook_error_events / operator_incidents --
--                             touched by `recordIntegrationWebhookOutcome` under a SEPARATE `infra`
--                             principal (source `telegram-webhook:record-outcome`), fire-and-forgot
--                             (`void runWithInfraPrincipal(...)`, never awaited by the webhook
--                             response). Confirmed still 42501-ing after every grant in this file; it
--                             does not block the webhook response or the D1 write, and is a distinct,
--                             differently-scoped gap (operator-incident/alerting infra, not identity)
--                             -- explicitly out of THIS overlay's bounded scope, flagged for the
--                             orchestrator rather than folded in here.
--
-- ============================================================================================
-- A7 live re-verify addendum #1: `app.*` RLS-helper EXECUTE grants.
--
-- Every table below has RLS ENABLED + FORCE and at least one policy that calls one or more of these
-- functions. Because Postgres checks EXECUTE privilege on every function an applicable policy
-- references (at parse time, regardless of short-circuit outcome), the bare login role 42501s on
-- ANY read/write to these tables without the grant -- even though, for a bootstrap principal with no
-- `app.principal_context` row installed, `current_org_id()`/`current_patient_user_id()`/
-- `current_integrator_user_id()` all evaluate to NULL and `is_staff()` evaluates true (the role IS a
-- member of app_staff/app_patient) but every policy branch still requires org/patient/integrator-id
-- match, so granting EXECUTE does not widen visible ROWS -- RLS still limits every one of these
-- tables to zero rows for this principal, exactly the "row scope is enforced by RLS, not by this
-- grant" property the original system_settings grant above already relies on:
--   app.current_org_id()             -- public.system_settings, public.org_enrollments,
--                                        public.be_organizations, integrator.contacts (all below).
--   app.is_staff()                   -- public.org_enrollments, public.be_organizations,
--                                        integrator.contacts, integrator.message_drafts,
--                                        integrator.conversations, integrator.conversation_messages.
--   app.current_patient_user_id()    -- public.org_enrollments (saas_org_dormant_p0_8_3 second branch).
--   app.current_integrator_user_id() -- integrator.contacts, integrator.message_drafts,
--                                        integrator.conversations, integrator.conversation_messages
--                                        (all via `saas_org_dormant_p0_8_5`-family policies,
--                                        deploy/postgres/phase4-locked-helper-rls-policies.sql).
--
-- A7 live re-verify addendum #2: `public.org_enrollments` / `public.be_organizations` SELECT.
--
-- The original header above argued these two grants would be "functionally inert" (RLS reduces
-- visible rows to zero for a bootstrap principal) and skipped them. That reasoning conflated "RLS
-- filters rows" with "no grant needed" -- they are independent: `org_enrollments` is read inside a
-- `UNION` with `be_organization_members` (`resolveActiveOrganizationIdForMessengerIdentity` /
-- `resolveActiveOrganizationIdForIntegratorUserId`, channelUsers.ts) and WITHOUT a SELECT grant the
-- whole UNION statement 42501s (permission is checked per-table, not "does this table end up
-- contributing rows"). Same for `be_organizations` (`resolveDeploymentSingleActiveOrganizationId`,
-- the T0.4 single-org fallback) -- flat missing-grant 42501, confirmed live. Both callers already
-- try/catch and fail open (return null), so this was non-fatal to the webhook response, but it meant
-- org resolution could NEVER succeed for first-contact TEST traffic. RLS still limits both tables to
-- zero rows for this principal (same safety property as system_settings above) -- the grant only
-- lets the query RUN, it does not widen what it returns.
--
-- A7 live re-verify addendum #3: integrator's OWN schema (identities/telegram_state/users/contacts/
-- idempotency_keys/message_drafts/conversations/conversation_messages) -- narrowly, ONLY the tables
-- and columns the bootstrap pre-routing + D1 write path actually touches for a brand-new user's
-- first inbound message (traced live via repeated POST /webhook/telegram + postgres log SQLSTATE/
-- STATEMENT tracing, not guessed):
--   integrator.contacts             SELECT (whole table) -- `getLinkDataByIdentity` /
--                                    `getActiveDraftByIdentity` / `getOpenConversationByIdentity`
--                                    LATERAL joins (legacy messenger-labeled phone lookup).
--   integrator.identities           SELECT (whole table; id/user_id/resource/external_id all read
--                                    across multiple joins) + column-scoped INSERT (user_id, resource,
--                                    external_id, created_at, updated_at) + UPDATE (updated_at) --
--                                    `upsertUser`'s `upsert_identity` CTE ON CONFLICT (resource,
--                                    external_id) DO UPDATE.
--   integrator.identities_id_seq    USAGE -- `id bigint DEFAULT nextval(...)`; the INSERT above omits
--                                    `id` from its column list, so Postgres applies the DEFAULT, which
--                                    needs sequence USAGE independently of the table INSERT grant.
--   integrator.telegram_state       SELECT (whole table) + column-scoped INSERT (identity_id,
--                                    username, first_name, last_name, state, last_start_at,
--                                    last_update_id, created_at, updated_at) + UPDATE (username,
--                                    first_name, last_name, state, last_start_at, last_update_id,
--                                    updated_at) -- union of `upsertUser`'s `upsert_state` CTE,
--                                    `tryConsumeStart`'s debounce UPDATE (last_start_at), and
--                                    `setUserState`'s upsert (state) -- all reachable for a plain
--                                    `/start` from a brand-new user, confirmed live (each was its own
--                                    42501 iteration before this grant).
--   integrator.users                column-scoped INSERT (created_at, updated_at) + SELECT (id,
--                                    merged_into_user_id) -- `upsertUser`'s `new_user` CTE (INSERT ...
--                                    RETURNING id -- RETURNING needs SELECT on the returned column,
--                                    independent of INSERT) + `resolveCanonicalIntegratorUserId`'s
--                                    merge-chain walk (`SELECT merged_into_user_id FROM users WHERE
--                                    id = ...`, canonicalUserId.ts), called from `writeChannelAnchor`
--                                    inside the SAME D1 transaction as the public.* writes.
--   integrator.users_id_seq         USAGE -- same DEFAULT-nextval reasoning as identities_id_seq.
--   integrator.idempotency_keys     SELECT + column-scoped INSERT (key, request_hash, status,
--                                    response_body, expires_at) + UPDATE (expires_at, request_hash,
--                                    status, response_body) + DELETE -- the event gateway's dedup gate
--                                    (`createPostgresIdempotencyPort`, idempotencyKeys.ts) runs for
--                                    EVERY inbound event before any handler (including D1's write)
--                                    fires; SELECT is required because its `ON CONFLICT DO UPDATE ...
--                                    WHERE target.expires_at < now()` reads the table's own column.
--                                    RLS is OFF on this table (`relrowsecurity=false`, confirmed).
--   integrator.message_drafts       SELECT (whole table; RLS FORCE, `saas_org_dormant_p0_8_5`-family
--                                    policy) -- `getActiveDraftByIdentity` (messageThreads.ts), part of
--                                    `loadUserContext`'s 3-way parallel read in handleIncomingEvent.ts.
--   integrator.conversations        SELECT (whole table; RLS FORCE, same policy family) --
--                                    `getOpenConversationByIdentity`, same `loadUserContext` read.
--   integrator.conversation_messages SELECT (whole table; RLS FORCE, same policy family) -- read via
--                                    a correlated subquery inside `getOpenConversationByIdentity`.
--
-- ============================================================================================
-- D2 addendum: symptom diary + LFK direct-public writes.
--
-- Scope (evidence-based, mirrors writeDiaryLfkDirect.ts exactly):
--   public.symptom_trackings  SELECT (whole table -- ownership-check SELECT by id+platform_user_id in
--                              addSymptomEntryDirect) + INSERT (user_id, platform_user_id,
--                              organization_id, symptom_key, symptom_title, is_active, updated_at) --
--                              createSymptomTrackingDirect. No UPDATE/DELETE: D2 only creates.
--   public.symptom_entries    INSERT (user_id, platform_user_id, tracking_id, value_0_10, entry_type,
--                              recorded_at, source, notes, organization_id) -- addSymptomEntryDirect.
--                              No SELECT needed: the INSERT has no RETURNING-independent read and no
--                              ON CONFLICT clause referencing the table's own columns.
--   public.lfk_complexes      SELECT (whole table -- ownership-check SELECT by id+platform_user_id in
--                              addLfkSessionDirect) + INSERT (user_id, platform_user_id,
--                              organization_id, title, origin, is_active, updated_at) --
--                              createLfkComplexDirect.
--   public.lfk_sessions       INSERT (user_id, complex_id, completed_at, source, recorded_at,
--                              organization_id) -- addLfkSessionDirect. `user_id` here IS the
--                              `platform_users.id` UUID directly (no separate platform_user_id column
--                              on this table -- see migration 059_lfk_sessions_user_id_to_uuid.sql).
--
-- RLS: all four tables have RLS ENABLED (NO FORCE — 0177_phase4_no_force_rls_compat.sql) with a
-- `saas_org_dormant_*` policy. LIVE re-verify on TEST (2026-07-24) found this policy now reads
-- `(app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())
-- OR (app.current_patient_user_id() IS NOT NULL AND platform_user_id = app.current_patient_user_id())`
-- — the `app.*()` SECURITY DEFINER accessor form (superseding the raw `current_setting('app.org', …)`
-- GUC form still visible in the older migration files this comment originally cited) — both
-- `app.current_org_id()` and `app.current_patient_user_id()` are already EXECUTE-granted below (A7
-- addendum #1, shared with D1), so NO new function grant is needed. `app.current_org_id()` resolves
-- from `app.principal_context`, populated only when the caller ran under `applySignedDbPrincipal`
-- ("locked"/"shadow" mode, `@bersoncare/db-principal`) — i.e. this direct write only succeeds when
-- `db.tx()` runs inside `runWithOrganizationPrincipal(organizationId, …)` (webhook.ts, resolved during
-- pre-routing for an already-onboarded user — the only case D2 writes for). LIVE-VERIFIED end-to-end
-- on TEST: installed a real HMAC-signed organization-principal context (same shape
-- `installSignedDbPrincipalContext` produces) for `a0000000-0000-4000-8000-000000000001`, then ran the
-- EXACT INSERT/SELECT statements `writeDiaryLfkDirect.ts` issues against all four tables under
-- `bcb_test_integrator_login` + `SET ROLE app_staff` with ONLY the grants below — all four writes and
-- both ownership-check reads passed RLS; rolled back, zero residue. A bootstrap/bare-role principal
-- (no `app.principal_context` row) was independently confirmed BLOCKED by RLS, matching the D1
-- overlay's "row scope is enforced by RLS, not by this grant" property.
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
-- D2 addendum (symptom diary + LFK) -- revoked first, independent of the D1 tables below.
REVOKE INSERT ("user_id", "complex_id", "completed_at", "source", "recorded_at", "organization_id")
  ON TABLE public.lfk_sessions FROM :"integrator_login_public_identity_grants_role";
REVOKE SELECT,
  INSERT ("user_id", "platform_user_id", "organization_id", "title", "origin", "is_active", "updated_at")
  ON TABLE public.lfk_complexes FROM :"integrator_login_public_identity_grants_role";
REVOKE INSERT ("user_id", "platform_user_id", "tracking_id", "value_0_10", "entry_type", "recorded_at", "source", "notes", "organization_id")
  ON TABLE public.symptom_entries FROM :"integrator_login_public_identity_grants_role";
REVOKE SELECT,
  INSERT ("user_id", "platform_user_id", "organization_id", "symptom_key", "symptom_title", "is_active", "updated_at")
  ON TABLE public.symptom_trackings FROM :"integrator_login_public_identity_grants_role";

-- A7 addendum #3 (integrator's own schema) -- revoke before the app.* functions/public.* tables
-- below so a partial-DOWN run never leaves a write grant without its matching RLS-function EXECUTE.
REVOKE SELECT, DELETE,
  INSERT ("key", "request_hash", "status", "response_body", "expires_at"),
  UPDATE ("expires_at", "request_hash", "status", "response_body")
  ON TABLE integrator.idempotency_keys FROM :"integrator_login_public_identity_grants_role";
REVOKE SELECT ON TABLE integrator.message_drafts FROM :"integrator_login_public_identity_grants_role";
REVOKE SELECT ON TABLE integrator.conversations FROM :"integrator_login_public_identity_grants_role";
REVOKE SELECT ON TABLE integrator.conversation_messages FROM :"integrator_login_public_identity_grants_role";
REVOKE SELECT ON TABLE integrator.contacts FROM :"integrator_login_public_identity_grants_role";
REVOKE SELECT,
  INSERT ("user_id", "resource", "external_id", "created_at", "updated_at"),
  UPDATE ("updated_at")
  ON TABLE integrator.identities FROM :"integrator_login_public_identity_grants_role";
REVOKE USAGE ON SEQUENCE integrator.identities_id_seq FROM :"integrator_login_public_identity_grants_role";
REVOKE SELECT,
  INSERT ("identity_id", "username", "first_name", "last_name", "state", "last_start_at", "last_update_id", "created_at", "updated_at"),
  UPDATE ("username", "first_name", "last_name", "state", "last_start_at", "last_update_id", "updated_at")
  ON TABLE integrator.telegram_state FROM :"integrator_login_public_identity_grants_role";
REVOKE INSERT ("created_at", "updated_at"), SELECT ("id", "merged_into_user_id")
  ON TABLE integrator.users FROM :"integrator_login_public_identity_grants_role";
REVOKE USAGE ON SEQUENCE integrator.users_id_seq FROM :"integrator_login_public_identity_grants_role";

-- A7 addendum #2 (org resolution).
REVOKE SELECT ON TABLE public.org_enrollments FROM :"integrator_login_public_identity_grants_role";
REVOKE SELECT ON TABLE public.be_organizations FROM :"integrator_login_public_identity_grants_role";

-- A7 addendum #1 (RLS-helper EXECUTE). Revoked last: nothing above should still need these once the
-- table grants that depend on them are gone, but ordering here is defensive, not load-bearing (a
-- REVOKE EXECUTE with dangling table grants still active would only re-manifest the original 42501,
-- never a privilege escalation).
REVOKE EXECUTE ON FUNCTION app.current_org_id() FROM :"integrator_login_public_identity_grants_role";
REVOKE EXECUTE ON FUNCTION app.is_staff() FROM :"integrator_login_public_identity_grants_role";
REVOKE EXECUTE ON FUNCTION app.current_integrator_user_id() FROM :"integrator_login_public_identity_grants_role";
REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM :"integrator_login_public_identity_grants_role";

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
-- REMOVED 2026-07-24: direct SELECT on public.system_settings VIOLATES the deploy assertion
-- assert_integrator_server_runtime_config_ready (deploy-test-saas.sh ~line 715), which requires the api
-- runtime role to read settings ONLY through the SECURITY DEFINER accessors
-- (app.read_global_server_runtime_setting / app.read_integrator_smtp_outbound_setting) and to have NO
-- direct table SELECT on public.system_settings / public.app_runtime_settings. Granting it took TEST down
-- on the recovery deploy. The bootstrap admin-id read that used it fails-open in code instead.
-- (intentionally no GRANT here)

-- A7 addendum #1 — REMOVED 2026-07-24. Granting the api login role EXECUTE on
-- app.current_org_id()/is_staff()/current_integrator_user_id()/current_patient_user_id() VIOLATES the
-- deploy's designed security assertion `assert_api_runtime_can_release_principal_context`
-- (deploy/host/deploy-test-saas.sh:483-488), which requires the api runtime role to have
-- release_principal_context but NOT these principal-context accessors directly — they are reachable
-- only through the signed-principal (SET ROLE) mechanism, never the bare bootstrap login role. Granting
-- them made the closure assertion FATAL, aborting the operational-role grant chain (c4) and taking TEST
-- down. The correct fix for the bootstrap pre-routing reads that hit these functions (system_settings /
-- org_enrollments admin+org resolution) is FAIL-OPEN in code (like resolveMessengerStaffAdmin already
-- does), NOT a grant. Those reads 42501 on the function under bootstrap and must degrade gracefully.
-- (The SELECT table grants below stay — harmless; the read simply fails-open at the function check.)

-- A7 addendum #2: public.org_enrollments / public.be_organizations SELECT. RLS still reduces both to
-- zero rows for a bootstrap principal (see header) -- these grants only stop the UNION'd/plain SELECT
-- from 42501ing before RLS gets a chance to filter.
GRANT SELECT ON TABLE public.org_enrollments TO :"integrator_login_public_identity_grants_role";
GRANT SELECT ON TABLE public.be_organizations TO :"integrator_login_public_identity_grants_role";

-- A7 addendum #3: integrator's own schema, narrowly scoped to the tables/columns the bootstrap
-- pre-routing + D1 write path actually touches for a brand-new user (see header for the full
-- per-table trace to source).
GRANT SELECT ON TABLE integrator.contacts TO :"integrator_login_public_identity_grants_role";

GRANT SELECT ON TABLE integrator.identities TO :"integrator_login_public_identity_grants_role";
GRANT INSERT ("user_id", "resource", "external_id", "created_at", "updated_at")
  ON TABLE integrator.identities TO :"integrator_login_public_identity_grants_role";
GRANT UPDATE ("updated_at") ON TABLE integrator.identities TO :"integrator_login_public_identity_grants_role";
GRANT USAGE ON SEQUENCE integrator.identities_id_seq TO :"integrator_login_public_identity_grants_role";

GRANT SELECT ON TABLE integrator.telegram_state TO :"integrator_login_public_identity_grants_role";
GRANT INSERT ("identity_id", "username", "first_name", "last_name", "state", "last_start_at", "last_update_id", "created_at", "updated_at")
  ON TABLE integrator.telegram_state TO :"integrator_login_public_identity_grants_role";
GRANT UPDATE ("username", "first_name", "last_name", "state", "last_start_at", "last_update_id", "updated_at")
  ON TABLE integrator.telegram_state TO :"integrator_login_public_identity_grants_role";

GRANT INSERT ("created_at", "updated_at") ON TABLE integrator.users TO :"integrator_login_public_identity_grants_role";
GRANT SELECT ("id", "merged_into_user_id") ON TABLE integrator.users TO :"integrator_login_public_identity_grants_role";
GRANT USAGE ON SEQUENCE integrator.users_id_seq TO :"integrator_login_public_identity_grants_role";

GRANT SELECT, INSERT ("key", "request_hash", "status", "response_body", "expires_at"),
  UPDATE ("expires_at", "request_hash", "status", "response_body"), DELETE
  ON TABLE integrator.idempotency_keys TO :"integrator_login_public_identity_grants_role";

GRANT SELECT ON TABLE integrator.message_drafts TO :"integrator_login_public_identity_grants_role";
GRANT SELECT ON TABLE integrator.conversations TO :"integrator_login_public_identity_grants_role";
GRANT SELECT ON TABLE integrator.conversation_messages TO :"integrator_login_public_identity_grants_role";

-- D2 addendum: symptom diary + LFK direct-public writes (writeDiaryLfkDirect.ts). See the D2 addendum
-- header comment above for the full per-table trace to source; no NEW app.* EXECUTE grant is required
-- (these tables' RLS policies key off session GUCs, not the app.*() accessor functions).
GRANT SELECT ON TABLE public.symptom_trackings TO :"integrator_login_public_identity_grants_role";
GRANT INSERT ("user_id", "platform_user_id", "organization_id", "symptom_key", "symptom_title", "is_active", "updated_at")
  ON TABLE public.symptom_trackings TO :"integrator_login_public_identity_grants_role";

GRANT INSERT ("user_id", "platform_user_id", "tracking_id", "value_0_10", "entry_type", "recorded_at", "source", "notes", "organization_id")
  ON TABLE public.symptom_entries TO :"integrator_login_public_identity_grants_role";

GRANT SELECT ON TABLE public.lfk_complexes TO :"integrator_login_public_identity_grants_role";
GRANT INSERT ("user_id", "platform_user_id", "organization_id", "title", "origin", "is_active", "updated_at")
  ON TABLE public.lfk_complexes TO :"integrator_login_public_identity_grants_role";

GRANT INSERT ("user_id", "complex_id", "completed_at", "source", "recorded_at", "organization_id")
  ON TABLE public.lfk_sessions TO :"integrator_login_public_identity_grants_role";

\echo 'Integrator login public identity grants UP complete.'
\endif
