# Reality audit: trunk typecheck repair — 2026-08-20

Audited branch: `wt/trunk-typecheck-red-20260820`

Audited commit: `d6b1addddfb12300bc672ddf6140dea6a843c8cd`

Merge-base with `feat/doctor-ui-rebuild`: `ecaabd49f90df3a92debbb2bc515dd5c468de9a8`

Authority: `docs/_TODO/MERGE_AUDIT_LEDGER_2026-08-19.md` §0

Overall verdict: **PASS**

## 1. Webapp typecheck — PASS

Command:

```bash
pnpm --dir apps/webapp run typecheck
```

Exit: `0`.

Tail:

```text
> @bersoncare/webapp@0.1.0 typecheck /home/dev/dev-projects/bcb-wt-appowner-20260820/apps/webapp
> tsc --noEmit
```

## 2. Cluster A source contract — PASS

The contract is present in package source, not only in `dist`:

- `packages/platform-merge/src/pgPlatformUserMerge.ts:38` defines `MergePlatformUsersContext`;
- `packages/platform-merge/src/pgPlatformUserMerge.ts:44` defines `MergePlatformUsersOptions`;
- `packages/platform-merge/src/pgPlatformUserMerge.ts:48` defines `mergeContext?: MergePlatformUsersContext`;
- `packages/platform-merge/src/pgPlatformUserMerge.ts:349` uses `options?: MergePlatformUsersOptions` in the public merge function;
- `packages/platform-merge/src/index.ts:14-15` exports both types from the package entry point.

Independent history commands:

```bash
git log --all --reverse --format='%H %ad %an %s' --date=iso-strict -S'MergePlatformUsersContext' -- packages/platform-merge/src
git log --all --reverse --format='%H %ad %an %s' --date=iso-strict -S'mergeContext' -- packages/platform-merge/src
git blame -L 38,49 -- packages/platform-merge/src/pgPlatformUserMerge.ts
git blame -L 10,18 -- packages/platform-merge/src/index.ts
```

All additions resolve to `19501de2f5eacab9e5fb180da61d66ce08476e9f` (`feat(merge): log merge initiator context`, 2026-08-20 15:21:55 +03:00). This commit predates the audited branch base:

```text
git merge-base --is-ancestor 19501de2f5eacab9e5fb180da61d66ce08476e9f ecaabd49f90df3a92debbb2bc515dd5c468de9a8
SOURCE_INTRO_COMMIT_ANCESTOR_OF_BASE_EXIT=0
```

The audited commit does not alter the package contract or generated output:

```text
git diff --exit-code ecaabd49f90df3a92debbb2bc515dd5c468de9a8...d6b1addddfb12300bc672ddf6140dea6a843c8cd -- packages/platform-merge
PLATFORM_MERGE_SOURCE_DIFF_EXIT=0

git diff --name-only ecaabd49f90df3a92debbb2bc515dd5c468de9a8...d6b1addddfb12300bc672ddf6140dea6a843c8cd | rg '(^|/)(dist|build|generated)(/|$)'
GENERATED_PATH_DIFF_RG_EXIT=1
```

Therefore Cluster A was stale/missing build output in the original worktree, not a missing source type and not a contract change in `d6b1adddd`.

## 3. No hidden compiler errors — PASS

The zero-context added lines were searched for `any`, `as unknown as`, `@ts-expect-error`, `@ts-ignore`, optional/widened null/unknown types, and bang operators.

```text
FORBIDDEN_ADDITION_RG_EXIT=1
WIDENING_ADDITION_RG_EXIT=1
```

There are no introduced hits. The only added bang is `if (!platformUserId)` at `route.ts:26`; it is boolean negation, not a non-null assertion. `patientAcquiring.route.test.ts:134` contains `as unknown as AppDeps`, but `git show ecaabd49f:.../patientAcquiring.route.test.ts` finds the same cast at the former line 132, so it is pre-existing context and not part of this diff. No type declaration was widened or made optional.

## 4. The two `string | null` route fixes preserve behavior — PASS

Both GET and POST still execute the same guard before constructing payment dependencies or calling the payment service. The change copies `appointment.platformUserId` into `platformUserId`, guards that local value, and returns the narrowed local value in the success object.

When the value is `null` (also when it is the empty string), both before and after the change the route returns HTTP `409` with `{ ok: false, error: 'patient_required' }`. `service.getPaymentState` / `service.createPayment` is not called, so no payment row is written. For a non-null string, the exact same string read from the appointment is passed to the service. Consequently this narrowing change cannot select or write a different database row than before.

## 5. Targeted Vitest files — PASS

Command:

```bash
pnpm --dir apps/webapp exec vitest run src/modules/patient-payments/service.unit.test.ts src/app/api/payments/patientAcquiring.route.test.ts
```

Result:

```text
Test Files  2 passed (2)
Tests       20 passed (20)
VITEST_EXIT=0
```

Vitest also emitted the pre-existing Vite warning about `__dirname` and future native config loading; it did not affect the exit code.

## 6. Scope — PASS

Command:

```bash
git diff --stat $(git merge-base HEAD feat/doctor-ui-rebuild)...HEAD
```

Run while `HEAD=d6b1addddfb12300bc672ddf6140dea6a843c8cd`:

```text
 .../booking-engine/appointments/[id]/payment/route.ts       | 13 +++++++------
 .../src/app/api/payments/patientAcquiring.route.test.ts     |  2 ++
 apps/webapp/src/infra/repos/pgPatientPayments.ts            |  8 +++++---
 .../src/modules/patient-payments/service.unit.test.ts       |  3 +++
 4 files changed, 17 insertions(+), 9 deletions(-)
```

`git diff --name-status` lists exactly those four named files. There is no out-of-scope worker change.

## 7. Fresh checkout / CI behavior — PASS, with command distinction

A fresh detached clone at the audited SHA was installed with `pnpm install --frozen-lockfile`. `packages/platform-merge/dist` was absent both before and after install.

Running the app-only command before building any shared workspace package fails (`FRESH_DIRECT_WEBAPP_TYPECHECK_EXIT=2`) because all shared package `dist` declarations are absent, including `@bersoncare/db-principal`, `@bersoncare/operator-db-schema`, and `@bersoncare/platform-merge`. This is the expected limitation of the app-only command, not a Cluster A source-contract defect.

The actual GitHub typecheck job runs `pnpm typecheck` (`.github/workflows/ci.yml:28`). The root script (`package.json:37`) first builds all shared packages, including `packages/platform-merge`, and then typechecks all workspaces. The same fresh clone produced:

```text
packages/db-principal typecheck: Done
packages/error-tracking typecheck: Done
packages/platform-merge typecheck: Done
apps/media-worker typecheck: Done
apps/integrator typecheck: Done
apps/webapp typecheck: Done
FRESH_ROOT_TYPECHECK_EXIT=0
```

After that source build, generated declarations contain both exported types and `mergeContext`. Thus a fresh CI checkout with no pre-existing build artifacts typechecks green; it does not rely on artifacts from the audited worktree.

## НЕ ПРОВЕРЕНО:

- Full `pnpm run ci` was explicitly forbidden and was not run.
- No PROD, DEV/TEST database, payment provider, or live runtime was touched.
- No tests beyond the two named Vitest files and the requested compiler checks were run.
- The GitHub-hosted job itself was not dispatched; its checked-in command was reproduced in a fresh local clone.
