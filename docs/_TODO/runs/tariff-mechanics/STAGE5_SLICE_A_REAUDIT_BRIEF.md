# MISSION: re-audit of stage 5 slice A after correction — commit `8ecb98f18`. You MAY run tests; you may NOT change files.

The previous audit found all three mechanics bypassable through paths the worker had not looked at. The correction claims
to have closed six items and, importantly, to have enumerated the full write surface. Your job is **completeness**, not
politeness. The clone's git tree must be clean when you finish.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a` — items 5.1, 5.2, 5.9; scope §1; policy §2.
- **Previous verdict:** `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_AUDIT_RESULT.md`.
- **Correction brief:** `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_FIX_BRIEF.md`.
- **Worker's own enumeration and claims (verify, do not trust):**
  `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_CORRECTION_RESULT.md`.
- **Canon:** `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §1, §5.1, §5.6, §7, §8.

Lead's own verification, already done — do not redo: targeted Vitest in this clone, 4 files / 27 tests passed.

## Questions

1. **Is the enumeration complete?** Build your own list of write paths for each of the three mechanics — API routes,
   server actions, the bot/integrator entry points, the shared settings endpoint, CMS actions, patient flows that
   materialise objects — and diff it against the worker's list. Every path you find that he missed is a MUST FIX. This
   is the whole point of this round.
2. **Are the six previously-broken items actually closed?** Diaries via bot/integrator, rename/archive tracking, Today
   navigation entry and shared-settings keys, warmups via CMS actions and settings keys, promo template selection and
   instance materialisation, and the five swallowed refusals in the interface.
3. **The false exemptions are gone.** `renameSymptomTracking` and `archiveSymptomTracking` must be guarded, not
   exempted. Check every other exemption the commit touched for the same lie: a wrong exemption makes a coverage run
   green over an open surface.
4. **Reads still not gated** — existing diary entries, promo instances and Today content stay visible and exportable.
   The correction touched patient pages; verify it did not start refusing reads there.
5. **Refusals reach the user** in each of the five interface places, with wording that names the action (canon §7). No
   invented numbers, no generic «что-то пошло не так».
6. **Nothing out of scope:** `git diff --stat` against canonical `feat`. The registry key list, migration `0275`, the
   seat chokepoint, the file write port, billing, the support system, the patient card and the patient app must be
   untouched. The plan file was reformatted by the worker — confirm no requirement was lost (the lead will restore the
   markup); a lost requirement is a MUST FIX.
7. **Test sensitivity:** name the two changes that would silently reopen the biggest holes and say whether a test
   catches them.

## Rules

MUST FIX only for a reachable break with named impact. No style, no theory, no alternative architecture. Do not re-break
guards by hand this round — reason instead; the tree must stay clean. Never run the full CI.

## Output

`VERDICT: PASS | PASS WITH FIXES | FAIL`, the completeness diff per mechanic (his list vs yours), numbered MUST FIX
(empty is valid), «что верно», «что осталось непроверенным», commands you ran with results, and confirmation the tree is
clean.
