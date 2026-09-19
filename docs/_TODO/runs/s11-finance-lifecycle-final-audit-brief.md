# PAY-REL-05 — final finance lifecycle audit brief

Начни с классификации каждого пункта как «тест или взгляд». Канон: `AGENTS.md`, обязательно прочитай §§1 (миграции и privilege analysis), 5, 10a, 10b и 24 полностью в применимой части. Authority: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, S11 `PAY-REL-01`–`05`, `PAT-NOTIF-01`–`03`, и owner-решения в `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`. Проверяй exact candidate `c133fee8473fc3421d3999b9206e21593405563a`, не вливай свежий `feat` и не исправляй production-код.

Это второй из двух непересекающихся финальных проходов PAY-REL-05. Твой scope — надёжность после денежного факта:

- settlement + durable outbox атомарны; HTTP 200 только после durable commit;
- немедленный consumer, backoff/reclaim, идемпотентность шагов, terminal dead + operator incident;
- проекция `patient_bookings`, календарь, напоминания и сообщения доигрываются независимо и не теряются от повтора/crash;
- automatic reconciliation: point + overlapping sweep, YooKassa invoice/payment identity, binding, watermark/oldest unresolved, provider failure and late success;
- все существующие patient-visible события записи/визита/денег проходят lifecycle → существующий `patientNotifications` store; внешние channel flags не удаляют feed fact и не выключают технические эффекты;
- stable dedupe feed/outbox при повторе webhook, worker и external delivery;
- tenant/principal boundaries, SECURITY DEFINER bodies, migration statement owners, declaration/grants/RLS/indexes; owner-aware rollback-only candidate preflight.

ВНЕ scope: правильность вычисления денежных сумм/удержаний/возвратов как бизнес-арифметика — её проверяет первый аудитор. Но cross-scope достижимый разрыв фиксируй, не исправляй.

До чтения существующих тестов составь blind kill-set по конечным дорогим поломкам. Затем изучи production diff и все `docs/_TODO/runs/s11-*` evidence/audits. Не принимай прежний PASS на веру; используй его как карту после своего kill-set. Для повторяемого поведения разрешены только blind behavioral acceptance-тесты с независимым oracle; UI/DOM/copy/layout tests запрещены. Разовые миграционные/privilege факты проверяй inspection и штатным owner-aware rollback-only preflight, не тестом SQL-текста. Все временные fault injections откати. Не запускай полный CI, не выполняй миграцию, не деплой.

Сохрани итог в `docs/_TODO/runs/s11-finance-lifecycle-final-audit.md`: каждый пункт scope с PASS/FAIL/BLOCKED и evidence, kill-set, команды, fault injection «поломка → какое утверждение покраснело», число убитых/непойманных, privilege analysis по §1 и exact SHA. Каждый MUST FIX обязан назвать достижимый сценарий, impact и нарушенный authority. Если добавил валидные behavioral acceptance-тесты — закоммить их вместе с отчётом. Production-код не менять. Перед концом убедись, что временные поломки сняты, и закоммить только audit artifacts/tests явными путями.
