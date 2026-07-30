# MISSION: correction round 3 — a refusal the user cannot see (escalated executor)

You are the escalated fixer: the previous two rounds were done by a cheaper tier, each closed real defects, and the
third audit found a defect of a different kind — the backend now refuses correctly, but the person never learns why.
Scope is deliberately narrow. Do exactly this and nothing more.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a` — stage 2, item **2.6**, scope §1,
  verification policy §2.
- **Canon:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §5.6 («отказ всегда видимый.
  Никогда молчаливый дроп») and §7 (the wording rule: name the concrete impossible action and how to lift it).
- **Verdict you are fixing:** `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_R3_RESULT.md`, MUST FIX 1 only.

## The defect

A doctor uploads a file when the tariff has no configured volume or the configured volume is exhausted. The API
correctly answers 403. `uploadSingleFile` sets an error state — and then both `handleFileChange` and the drag-and-drop
handler call `onClose()` unconditionally, so the panel unmounts together with the message
(`PatientTabFiles.tsx:249`, `:301`). The doctor sees only that no file appeared: no reason, no way to fix it.

## What is required

1. A refused upload leaves a **visible** message that says what happened and what to do — per canon §7: name the
   action that became impossible and how to lift the limit. Do not invent a number; if the limit is not configured at
   all, the message must point at the clinic's tariff rather than pretend a ceiling exists.
2. A successful upload keeps closing the panel as before. Do not change the happy path.
3. Do not build a file delete path, do not touch the write port, the resolver, the migration or the seat chokepoint —
   freeing capacity is now a separate plan item (4.10) and belongs to stage 4.

## MUST FIX 2 of that audit is NOT yours

The audit also found that a clinic cannot free occupied volume because patient files have no delete path. The lead
moved it to plan item **4.10** and forbade rolling the volume limit out to any clinic until it exists. Do not implement
it here, do not mention it as done, do not extend scope.

## Acceptance — behaviour

- A test that renders the panel (or exercises the same handler path) with the upload refused, and asserts the message
  is present afterwards. It must go red if `onClose()` is restored to unconditional. Prove it: make the refusal path
  close the panel again by hand, watch the test fail, restore the fix, report what you saw.
- The existing tariff-mechanics route test and the patient-files service test stay green.
- Follow `.cursor/rules/webapp-tests-lean-no-bloat.mdc`: extend the existing test file of this area, warm lazy chunks
  in `beforeAll` rather than raising timeouts, do not import a page just to reach a component.

## Constraints

- Targeted runs only: `pnpm --filter webapp typecheck`, `lint`, the affected test files. **No full CI** — the lead runs
  it once at stage 7 under the shared lock.
- Never `git add -A`. Commit in this clone; do not push, do not merge. Keep migration `0275` untouched.
- Assertions about source text, line order or import presence are forbidden.

## Report

`what was wrong → what you changed (file:line) → the test that guards it → what you saw when you re-broke it by hand`.
One line for anything left open.
