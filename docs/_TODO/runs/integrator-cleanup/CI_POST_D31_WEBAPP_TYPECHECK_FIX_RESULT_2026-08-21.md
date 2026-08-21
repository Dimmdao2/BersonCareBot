# CI post-D31: bounded webapp typecheck repair — result

Worker result for `CI_POST_D31_WEBAPP_TYPECHECK_FIX_BRIEF_2026-08-21.md`. Worktree
`wt/ci-post-d31-20260821`, based on `feat/doctor-ui-rebuild` at `a368c4617` (includes landed
integration `887e959f5`).

## 1. `.next/types/validator.ts` / removed `dev-bypass` route — classified as stale `.next` state

Fresh worktree had no `node_modules` and no `.next` at all. After `pnpm install` (workaround below)
and building the workspace packages, `pnpm --dir apps/webapp typecheck` was run on a clean tree and
produced **no** error referencing `.next/types/validator.ts` or `dev-bypass`.

Corroborating checks:

- `apps/webapp/.next` does not exist in this worktree — nothing to generate the stale reference from.
- `find apps/webapp/src -iname '*dev-bypass*'` — no matches; the route source is gone.
- `git show 887e959f5:apps/webapp/src/app/api/auth/dev-bypass/route.js` — `fatal: path ... does not
  exist in '887e959f5'`; the route was already removed before this SHA (by `12ca8b0ed`, "retire live
  fixture auth and zap paths").

Conclusion: the failure was generated `.next/types/validator.ts` left over in the integration
checkout from before the route removal, not a real source/type problem. No route restored, no
product workaround added, per brief.

## 2. VK channel typing — real fix

`materializePatientReminderDeliveries.ts:197` passes `channel === 'vk'` into `append()`, typed as
`PatientReminderReadyOutgoingDelivery['channel']`
(`apps/webapp/src/modules/messaging/outgoingDeliveryQueuePort.ts`). That type had a stale
four-channel union (`'telegram' | 'max' | 'email' | 'web_push'`) missing `'vk'`, while the sibling
`SpecialistTaskReadyOutgoingDelivery['channel']` in the same file already carries the canonical
five-channel union including `'vk'`.

Fix: extended `PatientReminderReadyOutgoingDelivery['channel']` to match the existing canonical
five-channel union (`'telegram' | 'max' | 'vk' | 'email' | 'web_push'`) instead of introducing a
second channel list.

Downstream: `materializePatientReminderDeliveries.unit.test.ts` derives its recipient-key lookup
from `delivery.channel`, so the widened union surfaced a `TS2339`/`TS2538` on that map missing a
`vk` entry. Added `vk: 'userId'` to the test's lookup, matching the `recipient: { userId: ... }`
shape the source already builds for the `vk` branch.

## 3. Environment note (not a repo defect)

This worktree had no `node_modules` and `pnpm install --frozen-lockfile` failed with `EROFS`
registering the project under the shared global pnpm store
(`~/.local/share/pnpm/store/v10/projects/...`) — this host mounts everything read-only except the
active worktree directory. Installed instead with a store-dir local to the worktree:
`pnpm install --frozen-lockfile --store-dir ./.pnpm-store`. Then built the workspace packages the
root `typecheck` script builds first (`operator-db-schema`, `db-principal`, `platform-merge`,
`error-tracking`) before running `pnpm --dir apps/webapp typecheck` — required for the
`@bersoncare/*` workspace package types to resolve at all.

## Evidence

```
$ pnpm --dir apps/webapp typecheck
> @bersoncare/webapp@0.1.0 typecheck
> tsc --noEmit
(clean — exit 0)

$ pnpm --dir apps/webapp exec vitest run src/modules/reminders/materializePatientReminderDeliveries.unit.test.ts
Test Files  1 passed (1)
     Tests  6 passed (6)

$ pnpm --dir apps/webapp exec vitest run src/infra/repos/pgOperatorQueueHealthRoot.unit.test.ts
Test Files  1 passed (1)
     Tests  3 passed (3)

$ git diff --check -- apps/webapp/src/modules/messaging/outgoingDeliveryQueuePort.ts apps/webapp/src/modules/reminders/materializePatientReminderDeliveries.unit.test.ts
(clean)
```

## Files changed

- `apps/webapp/src/modules/messaging/outgoingDeliveryQueuePort.ts` — added `'vk'` to
  `PatientReminderReadyOutgoingDelivery['channel']`.
- `apps/webapp/src/modules/reminders/materializePatientReminderDeliveries.unit.test.ts` — added
  `vk: 'userId'` to the test's recipient-key lookup.
- This result artifact.

Out of scope, untouched: the pre-existing modified `.env.example` files shown in worktree `git
status` at task start (these were already turned into device-node placeholders by the host sandbox
before this task began, unrelated to D31/typecheck).
