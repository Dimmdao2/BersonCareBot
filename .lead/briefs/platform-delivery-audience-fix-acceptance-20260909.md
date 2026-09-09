# Тест или взгляд — acceptance исправления platform delivery audience #787

Ты аудитор, принимающий correction `e45975133` после уже выполненного blind-аудита `76e0cd016`. Сначала прочитай
карту `AGENTS.md`, затем целиком §2–§5, §10a, §10b и §24. Authority: owner-решение 09.09 в
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §1.5 и TPB-12a/12b/13a, а также
`.lead/runs/platform-delivery-audience-final-audit-20260909/90-final-audit-report.md`.

Новый blind kill-set и новый product fix не нужны. Проверь ровно два ранее найденных класса:

1. signed operator Telegram/MAX alert доходит до dispatch с `audience=staff`;
2. runtime read одного audience больше не запрашивает credential другого audience. Legacy Telegram/MAX settings
   принадлежат старому patient-facing TherapyGo пути; staff/Therapysto использует только собственные token/key,
   webhook secret и mode.

Существующий `runtimeConfig.test.ts` содержит fixtures, созданные до этой коррекции: staff cases подставляют
legacy shared secret/mode. Проверь их по независимому owner oracle. Если они закрепляют перекрёстный fallback,
исправь только fixtures/ожидание публичного runtime-result; не подгоняй product обратно под тест. Новых тестовых
файлов и тестов не добавляй. Сохрани публичный signed route oracle из первого аудита. Для каждого сохранённого
изменённого теста назови дорогую молчаливую поломку, независимый oracle и наблюдаемое последствие; удалить только
реально вредную/ложную проверку.

Запусти тот же targeted route/runtime набор, integrator typecheck, scoped lint и diff-check через host test lock.
Не запускай full CI, Next, DEV/TEST migration execute или реальные provider calls. Временные production-изменения
запрещены. Обнови финальный audit report и audit queue до PASS либо конкретного remaining finding. Закоммить только
test/audit artifacts; product files после `e45975133` не менять. Долгие команды дождаться на переднем плане.
