# MISSION: delete the in-bot diary and LFK flow from the integrator, completely

Owner ruling 30.07, verbatim: «вырезай. просто полностью удаляй». Context he established: the in-bot diary/LFK is a
pre-webapp remnant; the real diary and LFK live in the webapp (`infra/repos/pgLfkDiary.ts`, `pgPatientDiarySnapshots.ts`,
`pgLfkExercises.ts`, `pgLfkTemplates.ts`, `pgLfkAssignments.ts`, `pgDiaryPurge.ts`), and the bot already tells the user to
finish in the app («Оценку от 0 до 10 можно добавить в приложении», «Добавить запись в дневнике можно в приложении»).

## Authority

- Owner ruling above; research that established the facts: `docs/_TODO/runs/integrator-role/SYNTHESIS.md` and the three
  reports beside it.
- Architecture: `apps/webapp/ARCHITECTURE.md:40-44`, `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`.
- Rule that must hold for anything you leave behind: `.cursor/rules/clean-architecture-module-isolation.mdc` (top
  section — database access only through the app's own drizzle layer, raw SQL banned for new code).

## What to delete

Everything that lets the BOT create or change diary/LFK data:

1. The four write operations in `apps/integrator/src/infra/db/directPublic/writeDiaryLfkDirect.ts`:
   `createSymptomTrackingDirect`, `addSymptomEntryDirect`, `createLfkComplexDirect`, `addLfkSessionDirect`.
2. Their scenario actions and executor wiring: `diary.symptom.tracking.create`, the symptom-entry action, the LFK
   complex/session actions — in `writePort.ts`, `executeAction.ts` and anywhere else they are dispatched.
3. The in-bot scenario steps and content that drive them: the symptom/LFK creation branches in
   `apps/integrator/src/content/telegram/user/scripts.json` and `.../max/user/scripts.json`, plus the now-unused
   templates in the corresponding `templates.json`.
4. Any tests that exist only to cover the deleted paths.
5. The lifecycle-door call for `patient_diaries` in that file becomes dead with it — remove it too. The door itself
   (`app.resolve_organization_mechanic_access`) and its drizzle port stay: they are used by other work.

## What to KEEP — read carefully, this is the part that is easy to get wrong

- **The «Дневник» menu entry stays, pointing at the app.** MAX already behaves this way («Дневник — в приложении»,
  button «Открыть дневник»). Telegram must end up the same: the user presses «Дневник» and gets the deep link into the
  webapp diary. Do not remove the person's way to reach the diary — remove only the bot's ability to write it.
- **Shared helpers stay.** `resolvePlatformUserIdForActor`, `resolveExactActiveOrganizationId` and the actor/deps types
  are imported by `writeReminderRulesDirect.ts` and `writeSupportConversationsDirect.ts`. Move them to a neutral module
  in the same layer rather than deleting them with the file, and update those two importers. Do not change their logic.
- Everything else in the integrator: untouched.

## Acceptance

- No path in the integrator can create or modify diary/LFK data any more: show the search proving zero remaining callers
  of the four deleted functions and of the deleted action names.
- The «Дневник» entry still works in both channels and leads to the app (state how you verified: content/scenario level
  is enough, no live bot run required).
- The two neighbouring direct writers still compile and their tests pass — the helper move changed nothing for them.
- `pnpm --dir apps/integrator run typecheck` and `lint` clean; the integrator test files affected run green via exact
  `vitest run <file>`. **No full CI.**
- Report the line count removed.

## Constraints

- Do not touch the webapp's diary/LFK code — it is the surviving implementation.
- Do not touch other `directPublic` writers beyond the helper import fix.
- Never `git add -A`. Commit in this clone; no push, no merge.

## Report

`what you deleted (files, functions, actions, content keys, tests) → what you kept and why → the search output proving no
callers remain → how «Дневник» now behaves in Telegram and MAX → typecheck/lint/test results → lines removed`.
