All agents are back. Final consolidated verdict.

# VERDICT: FAIL

Four MUST FIX, and the entire runtime-verification row is a hole — not a pass.

## Per-item table (final)

| # | Item | Result |
|---|---|---|
| 1 | Owner decides — 4 fields × 2 levels | **PASS** — `types.ts:126-133`, `service.ts:219-221`, constructor `:156-173, 254-345, 722-745`. Empty draft, explicit «Не настроено»/«Настроить», partial fill throws (`:171`). |
| 1b | Independent literal hunt | **FAIL** — clean inside `apps/webapp`, but the worker never searched `apps/integrator`. MUST FIX 4. |
| 2 | Ladder semantics + non-destructive | **PASS** — proven structurally: `OrgEntitlementsPort` (`ports.ts:19-48`) exposes only five read methods; `pgOrgEntitlements.ts` has zero `.insert/.update/.delete`; the patient function is `STABLE`, which Postgres itself forbids writing from. Grep over *added* lines returns 8 destructive-verb hits, all benign (4 = 0276 DDL, 1 = in-memory form state, 2 = test doubles, 1 = comment). |
| 3 | Read gate closed | **PASS** — early `return {ok:true}` gone; `checkEntitlement:44-64` denies only `disabled`/`unconfigured`; `grace` and `read_only` reads stay open. |
| 4 | Critical mechanics unlatchable | **PASS** — two structurally (three independent blocks), five by having no registry key at all, which makes gating them unrepresentable (`assertMechanic:20-22`) and a guard on them a compile error. |
| 5 | Migration + deploy contract | **FAIL** — MUST FIX 1. Seed-removal sub-question is a clean PASS (`organization_id IS NULL` can only match the global platform row; no org row can match). No new `SECURITY DEFINER`; overlay `e1-current-patient-organization-entitlements.sql:10-26` updated in lockstep. |
| 6 | Scope untouched | **PASS** — verified. 23 files, all under `apps/webapp/**` and `deploy/postgres/**`. `SAAS_BILLING_PLAN.md`, `TARIFFS_PAYMENTS_ADMIN_PLAN.md`, `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md`: none touched. No mock/payment route. The single `billing` hit is the substring in `0259_saas_billing_foundation.sql`. Commit body concurs: "item 2.6c, billing and mock-payment routes remain untouched" — **2.6c correctly not implemented.** |
| 7 | Test sensitivity | **3 blind spots** (unchanged, see prior message) |
| — | `typecheck` / `lint` / `vitest` | **DEFERRED — blocked on permissions.** Not a pass. |

## The verification hole

Three separate agents were denied shell access; the one that had `git` was denied `pnpm`. Verbatim, identical across three invocations: `Permission to use Monitor has been denied.` No workaround was attempted, and I'd recommend against granting one — the clean fix is running the commands directly or allowlisting `pnpm --filter webapp typecheck|lint|exec vitest run`.

So: **no `Test Files` line, no `Tests` line, no error count, no pass/fail was observed by anyone in this audit.** The report's «3 файла, 20/20» and the commit body's «18/18» are author claims inside their own artifacts, not evidence — and they disagree with each other. Per `ORCHESTRATION_BINDINGS.md` (the 2026-07-22 lesson: code/test/runtime evidence or an explicit deferred reason), this line is `deferred — blocked`, and it blocks any `done`/`PASS` on 2.1–2.7 regardless of the four defects below.

The three changed test files are `service.test.ts`, `CommercialConstructorClient.ui.test.tsx`, and `doctorNavLinks.unit.test.ts`.

## MUST FIX

1. **`0276:37-44` writes to `integrator.system_settings`, dropped 29.07 by `20260729_0001_drop_integrator_system_settings_mirror.sql:21`.** `pnpm migrate` aborts with `relation ... does not exist`, so the ladder columns are never created either. Confirmed independently by two agents; also a direct violation of `system-settings-single-source.mdc` §1/§5 (alwaysApply). Delete the block.
2. **`clinic-seats/service.ts:41` throws for every legacy compatibility org.** The `clinic_team` read gate passes (`source === 'compatibility'` → included), then `resolveClinicSeatLimit` returns `null` → unhandled throw at `settings/page.tsx:261` and 500 at `api/clinic/members/route.ts:16`. Canon §5.6 requires a visible refusal; growth already refuses cleanly (`pgOrganizationInvites.ts:169`). No test file exists for this module.
3. **`accept_org_invite` reads a map key the constructor no longer writes.** `normalizeTariffInput:112-116` strips `clinic_team`; `organization-member-invites-rls.sql:281-294` still gates on `(t.mechanics ->> 'clinic_team')::boolean` → `NULL` → `false` → `entitlement_disabled`. **Both files are in this stage's 23** — the worker edited that SQL file and left the stale read. The concurrency proof (`check-c4a-843-clinic-invite-concurrency.mjs`, also edited here) cannot catch it: it seeds `tariff_id NULL` plus an override, exercising only the first COALESCE arm.
4. **`[redacted-token].ts` bypasses the ladder entirely.** `:207-212` has a `access_source <> 'no_trial'` fallback — the exact default-enabled semantics 2.6a ordered removed; `:226-231` hardcodes `read_only`/`blocked` and never reads `system_access_policy`. Plan 2.6 and 2.3 are repo-wide, not webapp-only. The fix may be deferred to 3.1/4; the claim must be withdrawn now.

## Что осталось за лидом на живом DEV

1. Run `typecheck`, `lint`, and `vitest run` on the three test files. Nothing here substitutes for that.
2. Apply MUST FIX 1 **before** any DEV migration — as written it aborts. Then assign final numbers to `0275`/`0276`.
3. **Sign off explicitly on the retroactive edit to `0259`.** One hunk, 5 deletions, 0 insertions, nothing else changed — the `lifecyclePolicy` seed removed from an already-applied migration rather than superseded forward. Data-safe in combination with `0276`, but it is a rewrite of migration history and needs a decision, not a shrug.
4. **No plan or canon file was updated by these commits.** That matches this brief ("must be untouched") but collides with the AGENTS.md rule that the checkbox lands in the same commit as the code. 2.1–2.7 / 3.1a / 3.1b are still `[ ]`. Resolve which rule wins so the next audit isn't reading an unticked plan against shipped code.
5. Owner questions, not agent calls: (a) `unconfigured` hides every section and denies every read — fail-closed is defensible but canon §4a doesn't say it; (b) **экспорт своих данных does not exist at all** — no export route or `Content-Disposition` writer anywhere, while §5.1/§5.8 promise it is always available; (c) §1 says emergency help needs no switch of its own while §4 lists it as never-limited — turning off `patient_home_today` or `cms_pages` hides its entry point though the direct URL stays open.
6. Non-blocking cleanups: `types.ts:3` and `saasEntitlements.ts:47-51` now document the *opposite* of the code, on exactly the two rules the owner overturned; `saas-billing/settings.ts:86-95` is dead; ten structurally-dead `patient_card` guards at `protectedActionRegistry.ts:369-468` would start 403-ing the patient card if its class ever changed — pin `MECHANIC_REGISTRY.patient_card.class === 'никогда'` with a test.

**Clone tree: clean.** Re-confirmed at the end: exactly the ten pre-existing `.env.example` / `deploy/env/*` modifications, no untracked files, nothing staged. No file was written, edited or deleted; no database was touched; `pnpm run ci` was never run.