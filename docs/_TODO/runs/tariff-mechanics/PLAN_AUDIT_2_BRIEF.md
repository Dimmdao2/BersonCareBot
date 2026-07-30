# MISSION: audit the tariff-mechanics plan against the owner's own words (read-only, no file changes)

You audit documents, not code behaviour. Two auditors run this same brief independently (one Sol, one Opus) — do not
assume the other one covers anything.

## Authority

1. **The plan under audit:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` — **section §5a** «МЕХАНИКИ И
   ЛИМИТЫ ТАРИФОВ». Read the whole file, but judge §5a.
2. **The canon it must obey:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` — §1 (owner
   rulings, verbatim), §4a (the access lifecycle mechanism), §3–§7.
3. **Reference only:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_RESEARCH_2026-07-28.md`, `docs/_TODO/runs/tariff-mechanics/`.
4. **Rules the plan must satisfy:** `.cursor/rules/plan-authoring-execution-standard.mdc`,
   `.cursor/rules/tests-check-behaviour-not-circumstances.mdc`, `docs/ORCHESTRATOR_CHECKLIST.md`.
5. **Reality of the code** (to judge whether the plan is technically thought through, not to review the code itself):
   `apps/webapp/src/modules/org-entitlements/**`, `apps/webapp/src/app-layer/entitlements/**`,
   `apps/webapp/src/app-layer/guards/**`, `apps/webapp/db/schema/saasEntitlements.ts`.

## The four questions the owner asked, in his order

**A. Does the plan match the owner's own words?** His quotes are reproduced verbatim at the top of §5a and in canon §1.
Build a matrix: `owner quote → where the plan implements it → present / distorted / MISSING`. Quote both sides. A
distortion is worse than a gap: it looks like his decision but is not. Pay attention to these, they are the load-bearing
ones:

- «ты вообще не должен решать что ограничивать а что нет. ты должен дать мне механизм. В настройках тарифа — я указываю
  ЧТО делать доступом к системе вообще и к конкретной функции в частности — какой период терпения с полным доступом до
  отключения, какой период read-only»;
- «мы не ограничиваем часть критичных механик. но большинство мы ограничиваем конечно. если у специалиста нет в тарифе
  разминок и cms — то ни он не видит в кабинете этого раздела, ни его клиенты не увидят у себя разминок и статей его»;
- «как настрою то и входит, ты мне главное дай выключатели корректные» · «сами цифры — тебя не касаются»;
- «главное — не переусложнить. Делать НЕОБХОДИМО И ДОСТАТОЧНО (код должен работать, а не быть написан ради кода, как и
  тесты)».

**B. Where does the plan still hardcode tariff behaviour or decide for the owner instead of preparing controls?** This
is the question that caused the rewrite, so hunt for it aggressively. Report every place where the plan (or the canon it
points at) fixes a duration, a threshold, a terminal state, a packaging decision, or «what happens when X is off» as a
constant of the design rather than as a field the owner sets. Include leftovers of earlier agent inventions: the
withdrawn rule «чтение не ограничиваем никогда», the seat grace «14 дней и два предупреждения», warning thresholds like
80/100%, «первый срез», any «рекомендация лида» that survived. For each: quote it, say who decided it, and say what the
field-based form would be.

**C. Is it correct and complete?** Every mechanic named in canon §4 must have a plan item; every plan item must trace to
an owner ruling or to a mechanical necessity of one (invented scope is a defect); nothing may be silently dropped —
including items the previous rounds left open (file-volume freeing, the support toggle, the clinic-owned mailing
channels, the diaries/warmups/promo write-surface problem). Check the Definition of Done actually closes the plan.

**D. Is it technically thought through?** Judge the engineering, not the prose: does one resolver plus one write port
actually remove the class of defect where a mechanic leaks through an unguarded path (routes, server actions, the
integrator, CMS actions, the shared settings endpoint, lazy materialisation on read, push subscription)? Is the
lifecycle state derivable from data that exists (tariff, organization override, commercial state) without inventing a
local flag? Are the numeric limits still atomic under concurrency, and is the FORCE-RLS principal requirement present?
Does the order of stages hold — mechanism, then chokepoint, then mechanics — or is there a hidden dependency that breaks
it? Name any step that cannot work as written.

**E. Documentation set.** The owner also demanded one set of documents without duplicates or stale claims. Say whether
the plan, the canon and the research file now overlap or contradict each other, and whether any stale statement survives
in them. `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` is known to be pending a line-by-line reconciliation (plan item 6a.4) —
judge whether that is handled honestly rather than hidden.

## Rules

- Findings must be actionable: quote, location, why it violates the owner's words or breaks technically. No style
  preferences, no alternative architecture proposals, no «could be better».
- Do not rewrite the plan. Do not create or modify files. Your report is your stdout.
- If you cannot verify something, list it under «не смог проверить» with the reason.

## Output

1. `VERDICT: PASS | PASS WITH FIXES | FAIL`.
2. Matrix A (owner quote → implementation → present/distorted/missing).
3. Numbered list for B — every remaining hardcode or decision made for the owner.
4. Numbered MUST FIX for C and D.
5. Short «что в плане верно» so the lead does not break it.
6. «Не смог проверить» with reasons.
