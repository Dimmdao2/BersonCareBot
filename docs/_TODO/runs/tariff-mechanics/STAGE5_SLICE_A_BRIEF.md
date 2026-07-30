# MISSION: stage 5, slice A — three toggles on the patient side and the external calendar

Keys are already registered by step 4.0 (`4d299dc4f`). You add the guards and the visible refusal, nothing else.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a` — items **5.1**, **5.2**, **5.9** only,
  plus scope §1 and verification policy §2.
- **Canon:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §1 (owner rulings), §5.1 (a disabled
  mechanic blocks creating and changing; everything already created stays visible and exportable), §5.6 (a refusal is
  always visible), §8 (owner mechanics enabled through the existing organization exception).

## Your three items

- **5.1 `external_calendar`** — the mechanic is «external calendar in general», not Google. Which providers exist at all
  is a platform-level decision (#1071); the tariff decides whether the clinic may connect one. Guard the paths that
  connect, change or disconnect an external calendar. Do not touch the platform provider registry.
- **5.2 `patient_diaries`** — guard creating and changing diary entries (symptoms, mood, exercise diary). Reading
  existing entries and exporting them must keep working.
- **5.9 `patient_home_today`, `warmups`, `promo`** — already default-off. Two things here: the write paths are guarded,
  and — this is the owner's explicit wording — with «Сегодня» disabled **the administrator does not see the block for
  configuring the patient page at all**: not greyed out, absent. The patient side of that question is deliberately out
  of scope: the owner said he will think it through separately. Do not invent patient-side behaviour.

## Rules that decide whether this is accepted

1. **Guard creating and changing only. Never guard reading.** Gating a read path would hide content already assigned to
   a patient — that is a defect, not caution.
2. **A refusal is visible.** A blocked action must tell the user what became impossible and how to lift it (canon §7
   wording rule: name the action, no invented numbers). A silent 403 that the interface swallows is exactly the defect
   an earlier round of this plan already produced — do not repeat it.
3. **Behaviour proves the gate, not the registry.** `check-s4-entitlement-coverage` deliberately does not verify the
   guard call, so a green coverage run proves nothing. For each of the three items: a test that calls the real handler
   with the mechanic off and expects a refusal. Then prove it — remove the guard by hand, watch the test go red,
   restore it, and report what you saw.
4. Add the protected-action rows for the paths you actually guarded. If a row you need is already there from step 4.0,
   check it points at the handler you guarded; a row pointing at the wrong handler is worse than a missing one.
5. Follow `.cursor/rules/webapp-tests-lean-no-bloat.mdc`: extend the existing test file of the area, no new file per
   single `it`, warm lazy chunks in `beforeAll` instead of raising timeouts.

## Constraints

- Do not touch: the registry file beyond adding nothing (keys exist), migration `0275`, the seat chokepoint, the write
  port for files, billing, the support system, treatment-program or LFK templates, patient messaging, cancellation
  rules, the patient card, the patient app.
- Targeted runs only: `pnpm --filter webapp typecheck`, `lint`, affected tests. **No full CI** — the lead runs it once
  at stage 7 under the shared lock.
- Never `git add -A`. Commit in this clone; no push, no merge.
- DEV runtime probes are the lead's job in the canonical tree — do not fight the migration path guard.

## Report

Per item: `what you guarded (file:line) → what the refusal says to the user → the test that proves it → what you saw
when you removed the guard by hand → protected-action rows added or corrected`. One line for anything left open, no
softening.
