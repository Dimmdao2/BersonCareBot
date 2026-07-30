# MISSION: stage 5, slice B — clinical tests, online intake, specialist tasks

Keys are already registered (step 4.0). You add the guards, the visible refusal, and the proof. Slice A burned three
audit rounds on one thing: **the enumeration of write paths was incomplete**. Do not repeat it — enumerate mechanically
before you write a line of code.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFF_MECHANICS_PLAN_2026-07-30.md` — items **5.3**, **5.4**, **5.7**; scope §1;
  policy §2.
- **Canon:** `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §1 (owner rulings), §5.1 (block creating and changing, never
  reading), §5.6 (a refusal is always visible), §7 (wording).
- **Read this first — the lessons that cost slice A three rounds:**
  `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_AUDIT_R3_RESULT.md` and `STAGE5_SLICE_A_REAUDIT_RESULT.md`.

## Your three items

- **5.3 `clinical_tests`** — clinical tests and test sets. Owner's explicit addition: with the mechanic off, the
  platform's system test groups must disappear **also from the treatment programme**, not only from their own pages.
  Do NOT touch treatment-programme templates or LFK complex templates — they get no mechanic at all.
- **5.4 `online_intake`** — the pre-visit questionnaire.
- **5.7 `specialist_tasks`** — specialist tasks. Toggle only, no number (owner: «задачи — не числом, рубильник»).

## Enumerate first — this is the part that decides the verdict

For each mechanic: start from the tables its data lives in → find every repository method that writes them → find every
caller. Include all of these, because slice A leaked through exactly these: API routes, server actions, the
bot/integrator entry points, the shared `PATCH /api/admin/settings` endpoint, CMS/content actions, page-level loaders
that lazily materialise rows (a read that writes), and push-subscription side effects. Write the list into your report
before the diff, marked guarded / not-needed / left-open-with-reason.

## Rules that decide acceptance

1. **A disabled mechanic HIDES its section — for the specialist and for his patients.** Owner 30.07, verbatim: «если у
   специалиста нет в тарифе разминок и cms — то ни он не видит в кабинете этого раздела, ни его клиенты не увидят у
   себя разминок и статей его». So: the navigation entry disappears, the pages refuse a direct URL, and the patient-facing
   surface of that mechanic disappears too. What is guaranteed instead: **data is not deleted**, it returns unchanged when
   the mechanic is switched back on, and the clinic's export of its own data always works. Never limited at all (do not
   touch): patient card, patient app, reminders and notifications, two-factor authentication, the operations log, export,
   emergency help.
   ⚠️ The earlier rule «guard creating and changing only, never guard reading» was the lead's own invention, not the
   owner's decision. It is withdrawn. Do not follow it.
2. **A read that writes is still a write.** Since the section is hidden anyway, such a path is no longer reachable from
   the interface — but a direct API call must still be refused, and the helper must create nothing when the mechanic is
   off. Guard the handler, do not rely on the interface hiding it.
3. **A refusal is visible** and names the action plus how to lift it (canon §7). No invented numbers, no generic error.
   Check the interface actually shows the backend message — slice A had five places that swallowed it.
4. **Behaviour proves the gate.** `check-s4-entitlement-coverage.ts:64-68` does not verify the guard call, so a green
   coverage run proves nothing. Per item: a test calling the real handler with the mechanic off, expecting a refusal.
   Then remove the guard by hand, watch it go red, restore it, and report the exact failure you saw.
5. **No false exemptions.** If you exempt a path, prove it does not mutate your mechanic's data. Slice A produced three
   wrong exemptions; each made the coverage run green over an open door.
6. Protected-action rows must point at the handlers you actually guarded.

## Constraints

- Do not touch: the registry key list, migration `0275`, the seat chokepoint, the file write port, billing, the support
  system, the patient card, the patient app, treatment-programme and LFK templates, and anything belonging to slice A
  (diaries, warmups, promo, external calendar).
- Targeted runs only: `pnpm --filter webapp typecheck`, `lint`, affected tests. **No full CI.** Use exact
  `vitest run <file>` — the package script forwards a whole project and runs dozens of files.
- Never `git add -A`. Commit in this clone; no push, no merge. Do not edit the plan file — the lead owns it.
- **Commit before you run out of time.** Slice A lost a pass because 49 files sat uncommitted when the run ended. Commit
  working increments, then continue.

## Report

The enumeration table first, then per item: `what you guarded (file:line) → what the user sees → test → what you saw
when you removed the guard by hand → protected-action rows`. State plainly anything left open.
