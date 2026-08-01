# Тариф 2.13 — независимый аудит migration 0305 (#1069)

**Тест или взгляд:** пункты 1–5 — качество разового migration fix; проверять итоговый diff, SQL и уже
существующие статические команды. Новый test, DB harness или product fix не создавать.

Прочитать `AGENTS.md` §1b/§5/§10/§24. Authority:
`docs/_TODO/runs/briefs/TARIFF_SNAPSHOT_MECHANIC_REGRESSION_FIX_BRIEF.md`, candidate `b3df61d01` и красный DEV
oracle `saasBillingTariffSnapshot.devDbProof.test.ts` на `0f184d521`.

PASS только если:

1. Migration `0305` пересоздаёт ровно три названные access-функции и не меняет исторические migrations.
2. Все три tariff reads идут через `LEFT JOIN LATERAL app.saas_billing_effective_tariff(...)`; прямого
   `public.saas_tariffs` join в этих функциях не осталось.
3. Post-0297 semantics сохранены: четыре legacy access states не вернулись, signatures/owners/grants совпадают,
   quota/policy ветви не расширены за пределы требуемого frozen/live switch.
4. Journal согласован, первая строка migration — `-- TEMPORARY LOCAL MIGRATION NUMBER 0305`, номер остаётся
   забронирован за этой веткой на общей доске.
5. Лично запущены и зелёные journal sync, `drizzle-kit check`, существующий access-ladder proof, scoped lint и
   webapp typecheck; DB/DEV/TEST/PROD не трогать — живой DEV oracle выполняет лид после PASS.

Записать короткий audit report с exact commands и бинарным PASS/FAIL по пяти пунктам; коммитить только report.
Не исправлять product, не трогать plan checkbox/taskdb/DB/deploy и не пушить.
