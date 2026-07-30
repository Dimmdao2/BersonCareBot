# MISSION: correction of stage 5 slice A — every toggle is still bypassable (escalated executor)

The audit of `6143c7082` found that all three mechanics hold on the paths you guarded and leak on the paths you did not.
This round is about **closing the write surface completely**, not about adding more code.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a` — items 5.1, 5.2, 5.9; scope §1; policy §2.
- **Verdict you are fixing:** `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_AUDIT_RESULT.md` — MUST FIX 1–5 and the
  protected-action registry section.
- **Canon:** `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §1, §5.1 (block creating and changing, never reading), §5.6
  (a refusal is always visible), §7 (wording: name the action, no invented numbers), §8.

## What is broken

1. **Diaries bypassable:** the bot/integrator path still creates symptom and exercise diary data; a doctor can create
   tracking; patient server actions rename and archive tracking without a check.
2. **«Сегодня» not «absent»:** the page refuses, but the navigation link is still visible, and Today settings can be
   changed through the shared `PATCH /api/admin/settings`.
3. **Warmups bypassable:** CMS actions can create, edit and move content into the warmups cluster, and the shared
   settings endpoint changes rotation/cooldown keys without checking the mechanic.
4. **Promo bypassable:** the shared settings endpoint selects a promo template; patient treatment/reminder/go flows
   materialise new promo instances; the patient action mutates them — all unchecked. So a template configured earlier
   keeps producing promo instances after the toggle is off.
5. **Refusals swallowed by the interface** in five places named in the verdict (mood check-in, warmup feeling, warmup
   schedule panel, promo save/refresh, Today panels ignoring the returned error).
6. **Two exemptions in the protected-action registry are wrong:** `renameSymptomTracking` and `archiveSymptomTracking`
   are labelled metadata/lifecycle, but both change a diary. That makes the coverage run green over an open surface —
   the worst possible state. Remove the false exemptions and guard those actions.

## How to do it

- **The shared settings endpoint is a known pattern here:** it already applies a targeted entitlement check for the
  payment keys only, inside the existing handler, without gating the whole endpoint. Copy that shape for the Today,
  warmups and promo keys. Do not gate `/api/admin/settings` as a whole.
- **The bot/integrator path** writes on behalf of a patient. Guard the write, and make sure the refusal is a message the
  patient can see in that flow — never a silent drop (canon §5.6). If the flow has no way to surface a message, say so in
  the report instead of inventing one.
- **«Сегодня» absent** means the navigation entry is filtered out the same way other entitlement-driven items are, not
  only that the page refuses. Keep the page refusal too — a direct URL must not reach it.
- **Promo instances:** the toggle must stop new instances from being materialised. Already existing instances stay
  visible and exportable (canon §5.1) — do not delete or hide them.
- **The five swallowed refusals:** surface the message the backend already returns. Do not invent new wording, do not add
  a number.

## Acceptance

For each of the six items: a test that exercises the real path with the mechanic off and expects a refusal (or, for
navigation, that the entry is absent). Then prove it — remove the guard by hand, watch the test go red, restore it, and
report what you saw. Coverage runs prove nothing here (`check-s4-entitlement-coverage.ts:64-68` does not verify the guard
call).

## Constraints

- Never gate reading. Existing diary entries, promo instances and Today content stay visible and exportable.
- Do not touch: the registry file's key list, migration `0275`, the seat chokepoint, the file write port, billing, the
  support system, the patient card, the patient app, treatment-program or LFK templates.
- Targeted runs only (`typecheck`, `lint`, affected tests). **No full CI.** Never `git add -A`. Commit in this clone; no
  push, no merge.
- Follow `.cursor/rules/webapp-tests-lean-no-bloat.mdc`.

## Report

Per item: `path closed (file:line) → what the user sees → test → what you saw when you re-broke it`. Then one section:
«write paths I enumerated for each of the three mechanics» — the full list, so the next audit can check completeness
rather than rediscover it.
