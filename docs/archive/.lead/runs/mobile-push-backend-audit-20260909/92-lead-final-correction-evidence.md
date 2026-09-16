# Lead correction evidence — native push backend

Date: 2026-09-09 (MSK)  
Workstream: #915, `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M6/M7 backend surface

## Why this correction exists

The initial native-push candidate and its first audit left two reachable integration defects: native delivery could
infer the wrong application surface from an insufficiently constrained URL, and an authenticated mobile client had
no narrow way to obtain the public RuStore project id without reaching the restricted settings envelope. The final
lead correction closes those two surfaces and gives video-call invitations an explicit `therapygo` delivery surface.

## Required four-point rights analysis

1. **Objects and operations introduced.** Migration
   `apps/webapp/db/drizzle-migrations/20260909T120000_native_push_targets.sql` creates
   `public.native_push_targets`, its active-user lookup index, and the narrow
   `app.get_native_push_project_id(text)` function. The migration contains no `GRANT`, `REVOKE` or policy DDL.
2. **Object owners and runtime callers.** The table and index are created as `app_object_owner`. The function is
   created as `app_seam_settings_preauth_owner`, is `SECURITY DEFINER`, `STABLE`, returns one nullable `text`, and
   fixes `search_path=pg_catalog`. Only `app_patient` receives runtime `EXECUTE`; the webapp calls it through the
   declared `runWebappNamedRoot` port capability. Direct native-target access remains limited to the declared
   patient/staff application roles and the existing attested tenant-service path, all under forced RLS.
3. **Exact body and row/column surface.** The function can `SELECT` only `key`, `scope`, `value_json` and
   `organization_id` from `public.system_settings`; it accepts only `therapygo` or `therapysto`, selects only the
   matching global `scope='admin'` row, and returns only trimmed `{value,projectId}`. It cannot return the surrounding
   provider configuration or any auth token. `native_push_targets` self-service is `SELECT/INSERT/UPDATE` on the
   current actor's rows; staff access is restricted to current-clinic active members/enrolled patients, with archived
   patients read-only. The delivery adapter additionally validates the closed app/provider values before dispatch.
4. **Declarative and generated coverage.** `deploy/postgres/privileges/declaration.ts` declares the table access,
   self/current-clinic walls, function owner/body surface, exact `app_patient` execute role and named port-context
   capability. Both DEV/TEST privilege and port-context generated artifacts were regenerated from that declaration.
   The table remains covered by the declaration's forced-RLS generation and no broad bypass/direct public grant was
   added.

## Queue and routing proof

`createPgOutboundMessageQueue` serializes the complete typed `context.content` with `JSON.stringify` and passes that
single JSON value to `app.enqueue_outbound_message(...)`; therefore the new `pushExtras.pushSurface` field survives
the durable queue without a second serializer. The video-call invitation producer explicitly emits
`pushSurface: 'therapygo'`. The delivery adapter accepts explicit closed values, rejects a present-but-invalid value,
and uses legacy URL fallback only for relative internal patient/doctor/settings/account paths; protocol-bearing,
protocol-relative, malformed, cross-surface and admin routes fail closed.

## Executed evidence

- `pnpm --dir apps/integrator typecheck && pnpm --dir apps/webapp typecheck && pnpm --dir apps/integrator exec vitest run src/integrations/web-push/deliveryAdapter.nativeFanOut.contract.test.ts` — exit 0.
- `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgOutboundMessageQueue.unit.test.ts src/modules/patient-notifications/videoMeetingInvitationNotification.unit.test.ts` — 2 files, 6 tests passed.
- `./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges` — exit 0.
- `pnpm run test:db-privileges` — 340 tests discovered; 183 passed, 157 intentionally skipped without live opt-in,
  0 failed.
- `node scripts/check-migration-privileges.mjs` — 151 migration files accepted.
- `node scripts/check-migration-privileges.mjs --self-test` — 7 red-path and 1 green-path checks accepted.
- `bash apps/webapp/scripts/check-drizzle-migration-order.sh` — migration order accepted.
- `pnpm run check:db-privileges-generated` and `pnpm run check:db-privileges-census` — generated parity and census
  accepted.
- `node apps/webapp/scripts/check-system-settings-accessors.mjs` — exit 0.
- `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` — exact
  candidate migration applied owner-by-owner to named `bcb_webapp_dev` inside a transaction and rolled back;
  `pending=1 total=150`, preflight PASS.
- `git diff --check` — exit 0 before this evidence file was added.

## Remaining gate

This record is lead evidence, not self-acceptance. The corrected project-id accessor, explicit surface producer,
closed routing and production port contract still require the targeted independent audit before landing. Provider
credentials, real delivery, store publication and physical-device behavior remain later/external M7 gates.
