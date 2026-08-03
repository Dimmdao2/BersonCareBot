# D30 Ш4 materialization boundary — independent audit

**Дата:** 2026-08-03

**Candidate:** `6ba57892099a96f084d09a1bc5de5d073d79716a`

**Ветка аудита:** `wt/trackd-d30-sh4-boundary-audit`

**Вердикт:** **FAIL — один fixer по сохранённым oracle, новый blind audit не нужен**

## Authority и граница

Проверен сохранённый 10-point kill-set D30 Ш4 против owner-архитектуры из
`D30_SCHEDULER_REVERSAL_PLAN.md`: решения/тексты/каналы принадлежат webapp; integrator оставляет wake и
transport; одна canonical occurrence и одна durable queue; tenant/exact-role wall; snooze generation;
claim-time freshness; scheduler-decision guard; callback regression. Миграция осталась temporary `9996` и
не добавлялась в journal. DEV/TEST/PROD, env, product branch и deploy не затрагивались.

## Findings

### F1 — snoozed generation больше некому материализовать

`app.patient_snooze_reminder_occurrence` оставляет ту же occurrence в `status='planned'`, переносит
`planned_at` и увеличивает `delivery_generation`. Новый wake перебирает только draft-ы
`planDueReminderOccurrences`, а planner намеренно возвращает только будущие исходные rule slots; существующие
planned occurrence порт вообще не читает. После нажатия «отложить» уже наступивший исходный слот исчезает из
planner и `g+1` никогда не получает queue row. Падающий saved oracle:
`runPatientReminderMaterializationWake.audit.unit.test.ts` — ожидался один materialize, получено `0`.

### F2 — gate проверяет metadata-recipient, но provider получает другой recipient

`revalidate_patient_reminder_delivery_materialization` сверяет canonical binding с
`payload_json.externalId`, но не сверяет его с фактическим `payload_json.intent.payload.recipient`. В disposable
PostgreSQL после замены только nested Telegram `chatId` на `9999` gate вернул `true`; worker после этого отправит
готовый intent чужому recipient. Падающий PostgreSQL oracle добавлен в существующий capability test.

### F3 — exact-capability migration открывает прямой occurrence write

Миграция заявляет отсутствие broad integrator writes, но первой секцией делает
`GRANT SELECT, INSERT, UPDATE ... TO app_owner`. Disposable ACL introspection получила
`owner_insert=true`, `owner_update=true`; сохранённый test проверял только positive EXECUTE и пропускал обход.
Падающий ACL oracle требует direct INSERT/UPDATE = false и оставляет только exact function doors.

### F4 — старый materialization обход не удалён

После снятия scheduled callers production registry/repositories всё ещё содержат
`reminders.rules.enabled`, `reminders.occurrences.due`, `reminders.occurrence.upsertPlanned` и
`reminders.occurrence.markQueued` (`contracts/ports.ts`, `contracts/schemas.ts`, `readPort.ts`, `writePort.ts`,
`infra/db/repos/reminders.ts`). Это второй действующий DB path рядом с новыми capabilities и нарушает owner
правило «один общий проход»; удалить после точного caller census, не создавать новый entity.

### F5 — scheduler guard остаётся слеп к dynamic/transitive imports

Audit fault добавил в scanned handler достижимый dynamic import модуля с русским message text и literal `dueAt`.
`schedulerDecisionGuard.test.ts` остался green `13/13`: closure собирается regex только по статическим `from`
и не рекурсирует. Значит скрытая business decision снова может вернуться в scheduler без красного gate.

### F6 — перенос изменил существующий default copy без продуктового решения

Старые canonical channel templates дают warmup title `Разминка ⚡`; новый webapp fallback даёт
`Время разминки 🤸`. Кроме того старый path при отсутствии custom title разрешал title связанной published
content page/section, новый materializer этот read удалил и заменил generic category fallback. Это достижимая
регрессия текста для правил без custom/display title; перенос ownership не разрешал менять пользовательский copy.

## Saved/fault oracle evidence

| Класс | Fault / candidate evidence | Результат |
|---|---|---|
| Atomic rollback | Временное снятие production `runDrizzleMutationTransaction`; существующий test `rolls back...` всё равно green, потому что сам вручную делает `BEGIN/ROLLBACK` и не вызывает repo | **MISSED — F1/F3 fixer обязан заменить ложный atomic oracle вызовом production port** |
| Concurrency | Удалён `ON CONFLICT (occurrence_key) DO NOTHING` | concurrent PG test RED: unique violation |
| Snooze/generation | Candidate без мутации | новый saved oracle RED: materialize `0`, ожидался `1` |
| Stale recipient | Candidate, nested intent recipient `1001→9999`, sibling `externalId` неизменен | новый PG oracle RED: gate `true`, ожидался `false` |
| Cross-tenant | Убран exact `app.org` predicate | existing PG oracle RED: чужой org получил materializable row |
| Exact grants | Candidate ACL | новый PG oracle RED: direct owner INSERT/UPDATE `true` |
| Worker no-provider | Gate branch временно отключён | worker oracle RED: provider called once |
| Hidden scheduler import | Dynamic import decision module | guard ошибочно GREEN `13/13` — F5 |

Все временные product mutations восстановлены; `git diff` после восстановления содержит только audit tests,
этот отчёт и queue verdict.

## Baseline / regression evidence

- Disposable PostgreSQL candidate до audit additions: exact file `7/7 PASS`.
- После audit additions: `2 FAIL / 5 PASS`: forged provider recipient и broad direct grants.
- Snooze saved oracle: `1 FAIL`, materialization call `0`.
- Integrator phase regression на candidate: `56 passed / 3 skipped`, `341 passed / 4 expected fail / 9 skipped`;
  callback suites `reminders.skip.d21a` и `reminders.notifSettings.d22` входят в green run.
- Worker no-provider mutation: exact stale-generation test RED и восстановлена.
- Scheduler hidden-import mutation: guard остался GREEN, затем mutation/file удалены.
- Executable legacy web-push search из Ш4.0 пуст; новой таблицы/queue kind нет. Второй путь F4 — оставшиеся
  typed read/write operations старого integrator materializer, перечисленные выше.

## Fix gate

Один fixer использует эти же падающие oracle: добавить canonical due/planned occurrence claim для snooze `g+1`,
сверять exact provider recipient, закрыть direct occurrence DML, удалить старые operations, сделать import closure
реальным и сохранить прежний copy/title resolution. После green saved suite оркестратор проверяет diff; повторный
blind audit не требуется.
