# MISSION: mark every open item of the old S4 tariff/store plan — in place, line by line

Owner 30.07: «главное всё что "часть пунктов уже сделана, часть отменена вашими решениями сегодня" надо корректно там
отметить в каждом таком пункте». So this is not a summary job: every open checkbox gets its own verdict written next to
it, in the file itself.

## Authority

- **File to mark:** `docs/_TODO/SAAS_FOUNDATION/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` — 83 open checkboxes. Its header
  already carries the priority warning; keep it.
- **Plan item you are executing:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a, item **6a.4**.
- **The current truth you compare against:** the same plan's §5a (stages 1–7, including what is already ticked with
  evidence) and the canon `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §1 (owner rulings
  verbatim), §3, §4, §4a.
- **Evidence of what is really done:** audit verdicts in `docs/_TODO/runs/tariff-mechanics/` (`STAGE12_*`, `STAGE40_*`,
  `STAGE5_SLICE_A_*`) and the audit queue `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`. Code may be read to confirm.

## The only four verdicts you may write

Next to each open checkbox, append one of these, on its own indented line, in Russian:

1. `✅ СДЕЛАНО` — plus the concrete evidence: commit SHA and/or file:line, and which audit confirmed it. **No evidence =
   not this verdict.** A green claim in someone's report is not evidence; the audit verdict or the code is.
2. `⛔ ОТМЕНЕНО РЕШЕНИЕМ ВЛАДЕЛЬЦА 30.07` — plus his quote (short) and where it is recorded (canon §1 / §4a). Use this
   only for things his rulings actually kill, for example: числовые квоты у курсов, CMS и рассылок; ограничение карточки
   пациента и приложения пациента; резка шаблонов программ лечения и комплексов ЛФК; журнал событий расхода и якорь
   периода; выбор агентом длительностей и конечных состояний.
3. `⏳ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 30.07 (магазин)` — «магазин пока отложен. как сделаем сам магазин, так и сделаем в тарифах
   настройку». For everything about the store itself: платформенные пакеты, витрина, покупка, курирование библиотек.
   Not work, not lost — deferred with a traceable ruling.
4. `➡️ ЖИВО — переезжает в §5a` — plus exactly which item of §5a covers it. If nothing in §5a covers it, say so
   explicitly: `➡️ ЖИВО — в §5a пункта НЕТ, нужен` — that is the most valuable output of this job, do not hide it.

Nothing else. No fifth category, no «частично» without splitting the item into the parts that got verdicts 1–4.

## Hard rules

- **Never mark `СДЕЛАНО` to make the file look clean.** An unproven item is `ЖИВО`. Silently closing a live requirement is
  the worst possible outcome of this task; the audit that follows will look for exactly that.
- **Do not delete any checkbox and do not rewrite its text.** You append a verdict line under it. The owner must be able
  to read the original wording and the verdict side by side.
- **Do not archive the file** and do not add a tombstone — that is the lead's step after the audit.
- Do not touch any other file except the one you are marking. Do not edit the plan or the canon.
- Never `git add -A`. One commit in this clone, no push, no merge.

## Report

1. Counts: how many got each of the four verdicts (must sum to 83).
2. The full list of `➡️ ЖИВО — в §5a пункта НЕТ, нужен` items — verbatim text plus your one-line reason why it is still
   required. This is what the lead will add to the plan.
3. Any item you could not classify, with the reason. «Не понял» is an acceptable answer; a wrong verdict is not.
