# CI after D31: bounded webapp typecheck repair

Role: worker. Read `AGENTS.md` headings first, then §5, §10 and §24. Authority is the exact full-CI failure on landed integration `887e959f5ff6fd394a580f420d93d619739eba24`:

1. `.next/types/validator.ts` referenced removed `src/app/api/auth/dev-bypass/route.js`;
2. `materializePatientReminderDeliveries.ts:197` rejected channel `"vk"` against a stale four-channel local type.

This is a bounded fix, not a new Track D design stage. Current owner decisions remain: persistent authenticated DEV/TEST fixture/bypass machinery is removed, and D31 makes VK a real messenger channel.

Источник оракула: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — «D31 (часть 2/2) — VK как настоящий канал.»

## Scope

- Start from the clean isolated worktree created from current `feat/doctor-ui-rebuild`.
- Reproduce `pnpm --dir apps/webapp typecheck` before changing source.
- If the removed-route error is absent in the fresh worktree, classify it as stale ignored `.next` state in the integration checkout. Do not restore the route and do not add a product workaround. Record the exact clean-worktree result.
- Fix only the real stale channel typing by extending/reusing the existing canonical channel type or inference. Do not introduce a second channel list if an existing type can be reused.
- Run the smallest relevant reminder tests plus `pnpm --dir apps/webapp typecheck` and `git diff --check`.
- Add a concise result artifact next to this brief, stage only explicit paths, and commit before finishing.

Forbidden: DB access, migration, fixture/account/data creation, TEST/PROD, deploy, push, full CI, restoring dev-bypass, broad refactor, edits outside the exact typecheck failure and result artifact.

Done means: fresh-worktree evidence classifies the `.next` failure honestly, the VK type failure is fixed minimally, relevant tests and webapp typecheck are green, tree is clean, commit SHA is reported.
