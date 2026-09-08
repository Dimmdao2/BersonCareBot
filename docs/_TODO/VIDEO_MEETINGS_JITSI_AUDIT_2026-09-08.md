# Independent auditor-live — #1100 video core

Candidate: `e0bac698bcdfab28e551c27c1b30f6a75e8bce11` on `wt/video-core-20260908`; reviewed against base `3249e88b5d012d66f5817d8aafbecfc93e284250`.

## Verdict: FAIL

### Findings

1. **GATE-04 — configured Jitsi is treated as healthy without any health probe.**
   `apps/webapp/src/infra/video/jitsiVideoMeetingProvider.ts` returns `{ ok: true }` whenever four settings parse, and never contacts or otherwise verifies Jitsi. If DNS/TLS/config remain valid while Jitsi is down, create and both join paths mint a JWT and return success; the caller then reaches a failed call instead of the required fail-closed refusal. This is a reachable provider outage, not a UI concern.

2. **ACC-02 — an issued guest link cannot be revoked or rotated through any application API.**
   `createVideoMeetingsService` exposes `rotateInvite` and `revokeInvite`, but exact call search (`rg -n "rotateInvite\\(|revokeInvite\\(" apps/webapp/src --glob '*.ts'`) finds their definitions and repository implementations only; the candidate has no staff route calling either. A leaked unexpired fragment remains usable until expiry, so the promised revocation/rotation lifecycle is unreachable.

3. **VM-07 — the application boundary is Jitsi-shaped.**
   `modules/video-meetings/ports.ts` exports `provider: 'jitsi'`, `conferenceUrl`, and `capability`; `jitsiVideoMeetingProvider.ts` returns a Jitsi JWT in that shape, and every route returns it as `join`. Replacing Jitsi therefore changes module and route contracts rather than only an adapter/renderer, contrary to VM-07's provider-neutral boundary.

4. **GATE-03 — no developer-tariff enablement reaches the candidate.**
   The complete candidate diff only adds `video_meetings` to `MECHANIC_REGISTRY` and the protected-action inventory. `createPlatformEntitlementsService` writes each capability as `input.mechanics[mechanic] === true`; an existing developer tariff without an explicit `video_meetings: true` stays disabled. Search of the candidate's changed paths and `deploy/postgres`, `apps/webapp/src`, and `apps/webapp/db` found no seed/reconcile/admin write that enables the existing developer tariff. Adding it to the registry permits configuration but does not satisfy the required enabled developer tariff.

5. **Candidate does not typecheck or initialize the dependency graph.**
   `apps/webapp/src/app-layer/di/buildAppDeps.ts:775` constructs `videoMeetingsService` with `systemSettingsService` before that `const` is declared. `pnpm webapp:typecheck` fails with TS2448/TS2454. In emitted JavaScript this is a temporal-dead-zone reference during composition-root initialization, so video routes cannot be served. This violates the required webapp typecheck gate.

## Kill-set outcome

| Class | Result | Evidence |
| --- | --- | --- |
| 1 ACC-01 tenant/relationship/role | Reviewed | Doctor route uses workspace guard, scoped client identity and doctor principal; no contrary path in this candidate. |
| 2 GATE-01/02 entitlement | Caught | New real guest route acceptance test, including red fault injection. |
| 3 ACC-02/03/06 secret lifecycle | FAIL | Revocation/rotation route is absent (finding 2). Hash-only persistence and generic guest refusal were otherwise reviewed. |
| 4 ACC-03/04 guest/patient boundary | Reviewed | Guest route returns only join material; authenticated patient route binds both enrollment organization and patient user ID. |
| 5 ACC-02/03 race/rotation | Reviewed | Active partial unique indexes plus row-locked transaction prevent duplicate active meeting/invite in the shown store implementation; lifecycle endpoint remains missing. |
| 6 GATE-04 provider health | FAIL | Composition root currently cannot initialize (finding 5); independently, config-only health is fail-open for a real provider outage (finding 1). |
| 7 VM-07 adapter boundary | FAIL | Jitsi-specific contract crosses module and route boundary (finding 3). |
| 8 GATE-02/03 mechanic path | FAIL | Registry and three action mappings exist; developer tariff is not enabled (finding 4). |
| 9 migration/rights | PASS for preflight/declaration | One migration has owner markers, verify probes, indexes, no access-changing SQL; declaration and generated artifacts cover both relations and the definer function. Runtime RLS execution cannot be proven without applying the candidate, which this audit is forbidden to do. |

## Rights analysis — `20260908T120000_video_meeting_core.sql`

1. **Objects:** `public.video_meetings`, `public.video_meeting_invites`, their active/lookup indexes, and `app.exchange_video_meeting_invite(text)`.
2. **Owners/runtime roles:** table/index statements run as `app_object_owner`; the `SECURITY DEFINER` exchange function runs as `app_seam_patient_invite_owner`; direct runtime is `app_staff` and scoped `app_patient`, with only `app_patient` executing the seam.
3. **Required access:** `app_staff` needs the declared table SELECT/INSERT/UPDATE surfaces for create, lookup, rotate and revoke. The function owner needs SELECT over invite `meeting_id/secret_hash/status/expires_at` and meeting `id/organization_id/patient_user_id/specialist_id/provider_room_ref/status/expires_at`; `app_patient` needs only EXECUTE plus its scoped meeting read.
4. **Declaration:** `deploy/postgres/privileges/declaration.ts` declares both direct relations and the definer relation surfaces. `node deploy/postgres/privileges/generate-cli.mjs --check` confirmed all four generated target artifacts match. No undeclared function-body access was reported by the rollback-only owner-aware preflight.

## Commands and fault evidence

- `git diff --check 3249e88b5..e0bac698bcdfab28e551c27c1b30f6a75e8bce11` — clean; full diff: 20 files, 1,979 additions, 1,116 deletions.
- `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` — PASS; 1 pending migration, 143 total, rollback-only.
- `node deploy/postgres/privileges/generate-cli.mjs --check` — PASS; 4/4 generated privilege/allowlist artifacts match.
- `pnpm webapp:typecheck` after building the five workspace declaration packages — FAIL only on candidate-local `buildAppDeps.ts:775` (TS2448 and TS2454).
- Scoped ESLint, `check-webapp-infra-import-boundary` (and self-test), `check-no-new-raw-sql`, `check-migration-privileges` (144 files), `check-drizzle-migration-order`, and `git diff --check` — PASS.
- Focused tests: the two added acceptance tests (2/2) and `protectedActionRegistryCoverage.unit.test.ts` (8/8) — PASS.
- Fault injection A: temporarily remove the guest entitlement refusal in the real handler → `guest/exchange.route.route.test.ts` red at `expected 200 to be 404`; restored.
- Fault injection B: temporarily make the service ignore a provider-health failure → `service.test.ts` red because it returned successful create instead of `provider_unhealthy`; restored.

Fault injections performed: 2; caught: 2; uncaught: 0. The final tree retains only the two acceptance tests and this audit artifact; no product fault is retained.
