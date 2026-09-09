# MUST FIX — #915 final native Push backend correction

Candidate audited: `057ea56e2` (`7574e664d..057ea56e2`). Date: 2026-09-09 MSK.

## Verdict

**MUST FIX.** A legacy durable `web_push` row with the relative encoded-slash traversal path
`/app/patient/%2F..%2Fadmin` passes `resolveNativeSurface()` as Therapy Go and reaches the RuStore
provider. A native URI parser may decode the slash/traversal shape after delivery, so this violates
M6-09's allowlisted-internal-route requirement and the final brief's explicit fail-closed rule for
traversal-shaped legacy routes. The candidate must reject encoded path separators/traversal before the
native target lookup/provider fork. No product code was changed by this audit.

The committed acceptance oracle is
`apps/integrator/src/integrations/web-push/deliveryAdapter.finalSurface.contract.test.ts`; on the
untouched candidate its encoded-traversal case fails at `expect(providerFetch).not.toHaveBeenCalled()`
after one request to the injected native provider.

## Targeted tally

| Targeted item | Result | Evidence |
| --- | --- | --- |
| Fixed authenticated project-id projection | PASS | New route oracle: both fixed routes request only their own app id, expose a string/null, and return typed `runtime: unavailable` when unset. |
| Named root / migration / declaration rights | PASS (inspection + static parity) | Four-point record below; no direct patient settings read or migration privilege DDL found. |
| Explicit surface and legacy resolver | **FAIL** | Invalid explicit, absolute, protocol-relative and admin cases fail closed; encoded-slash traversal reaches provider. |
| Video `web_push` producer and durable queue | PASS | New producer and queue-root oracles retain `pushExtras.pushSurface: 'therapygo'`; existing channel/dedup semantics are unchanged. |
| Closed production native access contract | PASS | Runtime adapter revalidates arbitrary app/provider strings before provider dispatch; legacy browser-only `WebPushAccessPort` remains compatible under both app typechecks. |
| Retained original composite fan-out / prior fixes | PASS | Retained integrator oracle: 5/5 green (AAD, target filtering/deactivation, fan-out outcomes, invalid-token semantics). |

## Fault injection → red oracle

All temporary product mutations were restored before final inspection.

| Fault | Oracle that went red |
| --- | --- |
| Return `{ projectId, authToken: 'fault-only' }` from the patient projection | `fixedSurfaceProjectId.route.test.ts` exact public-body assertion. |
| Ignore a present invalid `pushSurface` and fall back to `/app/patient` | `deliveryAdapter.finalSurface.contract.test.ts` provider-not-called assertion. |
| Treat `/app/admin` as Therapy Go | Same adapter provider-not-called assertion. |
| Remove video invitation `pushExtras.pushSurface` | `videoMeetingInvitationNativePush.contract.test.ts` exact durable enqueue payload assertion. |
| Remove app/provider validation before dispatch | Adapter's untrusted-production-access provider-not-called assertion. |
| Candidate as-is: encoded `/app/patient/%2F..%2Fadmin` | Adapter provider-not-called assertion fails; this is the MUST FIX. |

## Checks run

- `pnpm --dir apps/integrator exec vitest run src/integrations/web-push/deliveryAdapter.nativeFanOut.contract.test.ts` → PASS, 1 file / 5 tests.
- `pnpm --dir apps/webapp exec vitest run src/app/api/native-push/fixedSurfaceProjectId.route.test.ts src/modules/patient-notifications/videoMeetingInvitationNativePush.contract.test.ts src/infra/repos/nativePushQueue.contract.test.ts` → PASS, 3 files / 4 tests.
- `pnpm --dir apps/integrator exec vitest run src/integrations/web-push/deliveryAdapter.finalSurface.contract.test.ts` → FAIL only for encoded-slash traversal (5 other cases green).
- `pnpm --dir apps/integrator typecheck` and `pnpm --dir apps/webapp typecheck` → PASS.
- `pnpm --dir apps/integrator build` → PASS.
- Scoped `eslint` commands over every production path changed in `7574e664d..057ea56e2` → PASS.
- `node scripts/check-db-chokepoint.mjs`, `node scripts/check-migration-privileges.mjs`, `pnpm run check:db-privileges-generated`, `pnpm run check:db-privileges-census` → PASS.
- `git diff --check 7574e664d 057ea56e2` and audit-worktree `git diff --check` → PASS.
- `gitleaks detect --source . --log-opts='7574e664d..057ea56e2' --redact=100 --no-banner` → PASS, 1 commit / no leaks.

The lead record's named-DEV rollback-only preflight applies to this exact candidate/migration SHA and
was intentionally reused, not rerun. Its listed
`node apps/webapp/scripts/check-system-settings-accessors.mjs` command cannot be reproduced: the file
is absent in this checkout (`rg --files`, exact filename search, and code-search were checked). This
does not affect the target traversal finding; it is an evidence-record discrepancy, not a claim of a
green rerun.

## Four-point rights inspection

1. The migration creates `public.native_push_targets`, its active-user index, and
   `app.get_native_push_project_id(text)`; it has owner/verify markers and contains no `GRANT`,
   `REVOKE`, role or policy DDL.
2. The table/index owner is `app_object_owner`. The named root is a `SECURITY DEFINER`, `STABLE`
   function owned by `app_seam_settings_preauth_owner`; generated port-context declares only the
   webapp patient capability / `app_patient` execution route.
3. The root accepts only `therapygo`/`therapysto` through its `CASE`, returns nullable project-id text,
   reads only global `scope='admin'` rows and only `key`, `scope`, `organization_id`, `value_json`.
   The production repository invokes it only through `runWebappNamedRoot`; fixed GET routes receive
   only that projection, not the envelope/auth token/endpoint.
4. `deploy/postgres/privileges/declaration.ts` declares the function and relation surface; both DEV and
   TEST generated privilege and port-context artifacts match byte-for-byte. The static migration and
   DB-chokepoint gates passed. No broad patient `system_settings` read was introduced.

## Files changed by this audit

- `.lead/runs/mobile-push-backend-final-audit-20260909/00-targeted-killset.md`
- `.lead/runs/mobile-push-backend-final-audit-20260909/90-final-report.md`
- `apps/integrator/src/integrations/web-push/deliveryAdapter.finalSurface.contract.test.ts`
- `apps/webapp/src/app/api/native-push/fixedSurfaceProjectId.route.test.ts`
- `apps/webapp/src/infra/repos/nativePushQueue.contract.test.ts`
- `apps/webapp/src/modules/patient-notifications/videoMeetingInvitationNativePush.contract.test.ts`

## Residual external gates

KVM/emulator acceptance, physical Android device behavior, real RuStore credentials/delivery, signing,
store publication, TEST/PROD configuration and deployment remain later external M7 gates. They are not
backend findings and were not exercised.
