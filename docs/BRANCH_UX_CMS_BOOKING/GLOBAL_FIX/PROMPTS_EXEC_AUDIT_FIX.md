# Промпты: GLOBAL_FIX (поэтапно, с жесткими audit-gates)

Ниже copy-paste промпты для исполнения master-плана из `GLOBAL_FIX`.

## Порядок (обязательный)

```text
ШАГ 01  STAGE 1 EXEC   -> Auto-agent
ШАГ 02  STAGE 1 AUDIT  -> Composer 2
ШАГ 03  STAGE 1 FIX    -> Auto-agent (только если rework)

ШАГ 04  STAGE 2 EXEC   -> Auto-agent
ШАГ 05  STAGE 2 AUDIT  -> Composer 2
ШАГ 06  STAGE 2 FIX    -> Auto-agent (только если rework)

ШАГ 07  STAGE 3 EXEC   -> Auto-agent
ШАГ 08  STAGE 3 AUDIT  -> Composer 2
ШАГ 09  STAGE 3 FIX    -> Auto-agent (только если rework)

ШАГ 10  STAGE 4 EXEC   -> Auto-agent
ШАГ 11  STAGE 4 AUDIT  -> Composer 2
ШАГ 12  STAGE 4 FIX    -> Auto-agent (только если rework)

ШАГ 13  STAGE 5 EXEC   -> Auto-agent
ШАГ 14  STAGE 5 AUDIT  -> Composer 2
ШАГ 15  STAGE 5 FIX    -> Auto-agent (только если rework)

ШАГ 16  STAGE 6 EXEC   -> Auto-agent
ШАГ 17  STAGE 6 AUDIT  -> Composer 2
ШАГ 18  STAGE 6 FIX    -> Auto-agent (только если rework)

ШАГ 19  STAGE 7 EXEC   -> Auto-agent
ШАГ 20  STAGE 7 AUDIT  -> Composer 2
ШАГ 21  GLOBAL FIX     -> Auto-agent (только если rework_required)
```

Правило перехода: следующий этап можно запускать только после `verdict: pass`.

---

## STAGE 1 - EXEC (F-01)

```text
Выполни Stage 1 по документу:
docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/STAGE_1_F01_INGEST_AND_USER_LINKING.md

Контекст:
- Нужно закрыть critical finding F-01.
- Нельзя расширять scope за пределы Stage 1.

Сделай:
1) Реализуй S1.T01-S1.T05 последовательно.
2) После каждой задачи обновляй:
   docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/AGENT_EXECUTION_LOG.md
3) В конце этапа:
   - прогони релевантные тесты,
   - прогони pnpm run ci,
   - зафиксируй evidence по gate (нет новых dead platform_user_id null).

Вывод:
- список "S1.Txx -> done/blocked"
- файлы изменений
- gate evidence
```

## STAGE 1 - AUDIT (Composer 2)

```text
Проведи аудит Stage 1 (F-01):
docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/STAGE_1_F01_INGEST_AND_USER_LINKING.md

Проверь обязательно:
1) Временные сбои не роняют ingest в hard-fail с первой попытки.
2) User linking по телефону работает как fallback.
3) Queue/retry/backoff и dead-letter policy реализованы корректно.
4) Нет новых dead событий по причине platform_user_id null.
5) CI зеленый и evidence зафиксирован в AGENT_EXECUTION_LOG.md.

Формат:
- verdict: pass | rework
- findings: [critical|major|minor]
- для каждого finding: что не так, как исправить, файл
```

## STAGE 1 - FIX

```text
Исправь замечания аудита Stage 1.

Вход:
- последний audit-report Stage 1

Правила:
1) Исправить все critical и major.
2) Не расширять scope за пределы F-01.
3) Обновить AGENT_EXECUTION_LOG.md.
4) Повторить тесты и при необходимости pnpm run ci.
```

---

## STAGE 2 - EXEC (F-04)

```text
Выполни Stage 2 по документу:
docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/STAGE_2_F04_COMPAT_SYNC_AND_PROVENANCE.md

Контекст:
- Нужно закрыть finding F-04.
- Full compat должен быть реальным, а не декларативным.

Сделай:
1) Реализуй S2.T01-S2.T05.
2) Сохрани provenance поля, реализуй lookup branch_service_id.
3) Добавь UI маркер происхождения.
4) Подготовь backfill evidence и ci result.
5) Обнови AGENT_EXECUTION_LOG.md.
```

## STAGE 2 - AUDIT (Composer 2)

```text
Проведи аудит Stage 2 (F-04):
docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/STAGE_2_F04_COMPAT_SYNC_AND_PROVENANCE.md

Проверь:
1) Реальный lookup branch_service_id (не заглушка).
2) Compat DoD и фактический код согласованы.
3) Provenance сохраняется и отображается.
4) Compat-строки не деградируют.
5) CI и evidence подтверждены.

Формат:
- verdict: pass | rework
- findings с severity + fix path
```

## STAGE 2 - FIX

```text
Исправь замечания аудита Stage 2.
Только scope F-04.
Обнови AGENT_EXECUTION_LOG.md и повтори проверки.
```

---

## STAGE 3 - EXEC (F-03)

```text
Выполни Stage 3 по документу:
docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/STAGE_3_F03_ATTACHMENT_FILE_IDS.md

Контекст:
- attachmentFileIds должен трактоваться как media_files.id.
- Нужно поддержать mixed URL+file end-to-end.

Сделай:
1) Реализуй S3.T01-S3.T05.
2) Добавь ownership/status validation для file ids.
3) Сохраняй file в online_intake_attachments (attachment_type='file').
4) Проверь doctor visibility.
5) Обнови AGENT_EXECUTION_LOG.md.
```

## STAGE 3 - AUDIT (Composer 2)

```text
Проведи аудит Stage 3 (F-03):
docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/STAGE_3_F03_ATTACHMENT_FILE_IDS.md

Проверь:
1) attachmentFileIds = media_files.id по контракту и в коде.
2) Сервер резолвит s3_key и валидирует ownership/status.
3) Mixed URL+file проходит e2e.
4) Врач видит вложения в details/list.
5) CI зеленый.

Формат:
- verdict: pass | rework
- findings с severity
```

## STAGE 3 - FIX

```text
Исправь замечания Stage 3 audit.
Закрой critical/major, обнови AGENT_EXECUTION_LOG.md, повтори проверки.
```

---

## STAGE 4 - EXEC (F-02)

```text
Выполни Stage 4 по документу:
docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/STAGE_4_F02_DOCTOR_API_PATIENT_IDENTITY.md

Контекст:
- Doctor API обязан возвращать patientName/patientPhone по контракту.

Сделай:
1) Реализуй S4.T01-S4.T05.
2) Добавь join с platform_users в list/details.
3) Приведи UI врача к контрактному ответу без fallback-заглушек в normal path.
4) Обнови AGENT_EXECUTION_LOG.md.
```

## STAGE 4 - AUDIT (Composer 2)

```text
Проведи аудит Stage 4 (F-02):
docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/STAGE_4_F02_DOCTOR_API_PATIENT_IDENTITY.md

Проверь:
1) list/details содержат patientName/patientPhone.
2) Контракт API совпадает с фактическим response.
3) UI врача рендерит identity корректно.
4) Нет fallback-заглушек как основного поведения.
5) CI и тесты подтверждены.

Формат:
- verdict: pass | rework
- findings по severity
```

## STAGE 4 - FIX

```text
Исправь замечания Stage 4 audit, не расширяя scope.
Обнови AGENT_EXECUTION_LOG.md, повтори тесты/CI.
```

---

## STAGE 5 - EXEC (F-06)

```text
Выполни Stage 5 по документу:
docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/STAGE_5_F06_NOTIFICATION_DEEP_LINK.md

Контекст:
- Уведомления TG/MAX должны открывать конкретную заявку по requestId.

Сделай:
1) Реализуй S5.T01-S5.T05.
2) Обнови notification relay и шаблоны каналов.
3) Подтверди click-through smoke.
4) Обнови AGENT_EXECUTION_LOG.md.
```

## STAGE 5 - AUDIT (Composer 2)

```text
Проведи аудит Stage 5 (F-06):
docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/STAGE_5_F06_NOTIFICATION_DEEP_LINK.md

Проверь:
1) Deep-link содержит requestId.
2) Клик из TG/MAX открывает нужную заявку.
3) Нет регрессии в message templates.
4) Evidence зафиксирован в AGENT_EXECUTION_LOG.md.

Формат:
- verdict: pass | rework
- findings с severity + fix path
```

## STAGE 5 - FIX

```text
Исправь замечания Stage 5 audit.
Только scope F-06.
Обнови AGENT_EXECUTION_LOG.md.
```

---

## STAGE 6 - EXEC (F-05)

```text
Выполни Stage 6 по документу:
docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/STAGE_6_F05_DOCS_STAGES_8_15_SYNC.md

Контекст:
- Нужно синхронизировать docs по Stages 8-15 (вариант B).

Сделай:
1) Реализуй S6.T01-S6.T05.
2) Убери битые stage-ссылки из README.
3) Восстанови stage-summary из EXECUTION_LOG/CHECKLISTS.
4) Закрой open пункты online-safe gate и SHA+CI traceability.
5) Обнови AGENT_EXECUTION_LOG.md.
```

## STAGE 6 - AUDIT (Composer 2)

```text
Проведи аудит Stage 6 (F-05):
docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/STAGE_6_F05_DOCS_STAGES_8_15_SYNC.md

Проверь:
1) README index соответствует фактической структуре файлов.
2) Stage-summary по 8-15 восстановлен и проверяем.
3) online-safe gate закрыт корректно.
4) SHA+CI traceability закрыт по каждому stage.
5) README/CHECKLISTS/EXECUTION_LOG синхронизированы.

Формат:
- verdict: pass | rework
- findings по severity
```

## STAGE 6 - FIX

```text
Исправь замечания Stage 6 audit.
Только doc-sync scope.
Обнови AGENT_EXECUTION_LOG.md.
```

---

## STAGE 7 - EXEC (финальный аудит)

```text
Выполни Stage 7 по документу:
docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/STAGE_7_FINAL_INTEGRATION_AUDIT.md

Сделай:
1) Реализуй S7.T01-S7.T04.
2) Прогони полный pnpm run ci.
3) Собери SQL-метрики compat/inbox/outbox.
4) Проведи ручной smoke booking/intake/doctor flows.
5) Зафиксируй финальный SHA, дату CI, evidence в AGENT_EXECUTION_LOG.md.
```

## STAGE 7 - AUDIT (Composer 2)

```text
Проведи финальный аудит Stage 7:
docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/STAGE_7_FINAL_INTEGRATION_AUDIT.md

Проверь:
1) pnpm run ci green.
2) SQL/метрики не показывают новых критичных расхождений.
3) Smoke booking/intake/doctor flows пройден.
4) Все gates Stage 1-6 имеют pass.

Формат:
- final_verdict: approve_for_release | rework_required
- findings по severity
- обязательные фиксы (если rework_required)
```

## GLOBAL FIX (если Stage 7 audit = rework_required)

```text
Исправь замечания финального аудита.

Правила:
1) Только scope findings из финального аудита.
2) Без нового функционала.
3) После правок повторить pnpm run ci.
4) Обновить AGENT_EXECUTION_LOG.md.
5) Подготовить таблицу: finding -> fix -> evidence.
```

---

## INCIDENT HOTFIX - BOOKING FLOW (RCA + PLAN, без имплементации в этом шаге)

### Подтвержденные причины (RCA)

1) Кэш слотов в `apps/webapp/src/modules/patient-booking/service.ts` живет до `5 минут` и не инвалидируется после `create/cancel/applyRubitimeUpdate`; из-за этого UI видит устаревшие окна.
2) Конкурентные попытки создать запись на один и тот же слот не блокируются на входе сервиса; overlap ловится поздно (на confirm/DB constraint), что позволяет внешнему Rubitime create произойти лишний раз.
3) В `apps/webapp/src/infra/repos/pgPatientBookings.ts` `createPending` не делает pre-check overlap по статусам in-flight (`creating`, `cancelling`, `cancel_failed`), поэтому в гонке возможны дубли попыток.
4) UI ошибки пробрасываются как технические коды (`slot_overlap` и т.п.) вместо русских сообщений.
5) Ссылка «Изменить» в активных записях ведет на `support_contact_url` через обычный `target=_blank`; в mini app это может открываться нестабильно или не открываться.
6) Нет мгновенного toast-уведомления об успешной записи в native booking confirm flow.

### План фиксирования (для простого агента)

```text
Сделай HOTFIX booking flow по подтвержденному RCA (без расширения scope).

Scope:
- Только booking native flow + related UI in cabinet.
- Не менять архитектуру stage-доков и не трогать нерелевантные модули.

Нужно сделать:
1) Slots cache
   - В `patient-booking/service.ts` уменьшить TTL кэша слотов до 60 секунд.
   - Добавить явную инвалидацию кэша при:
     - успешном createBooking,
     - markFailedSync/create error path,
     - slot_overlap rollback path,
     - cancelBooking success,
     - applyRubitimeUpdate.
   - Условие stale: кэш не валиден, если fetchedAt < lastSlotsMutationAt.

2) Антидубли по слоту
   - В `patient-booking/service.ts` добавить in-flight lock по ключу slotStart|slotEnd
     (Set, add до create flow, delete в finally), при дубле бросать `slot_overlap`.
   - В `pgPatientBookings.ts` в `createPending` сделать SQL pre-check overlap по статусам:
     creating, confirmed, rescheduled, cancelling, cancel_failed.
     Если overlap найден — возвращать `slot_overlap`.
   - Для in-memory порта синхронизировать те же blocking statuses.

3) Русские ошибки для пациента
   - В `useCreateBooking.ts` добавить map backend error code -> RU текст:
     - slot_overlap, slot_already_taken -> "Это время уже занято. Выберите другой слот."
     - booking_confirm_failed, rubitime_* -> "Не удалось подтвердить запись. Попробуйте еще раз."
     - branch_service_not_found -> "Услуга или специалист недоступны."
     - city_mismatch -> "Город не совпадает с выбранной услугой."
     - fallback -> "Не удалось создать запись."

4) Мгновенное уведомление о success
   - В `ConfirmStepClient.tsx` при ok=true показать toast.success("Запись подтверждена").
   - После toast делать router.push(routePaths.cabinet).

5) Кнопка «Изменить»
   - В `CabinetActiveBookings.tsx` заменить Link+target=_blank на client-safe open:
     - если Telegram mini app: использовать `window.Telegram.WebApp.openLink(href)` при наличии,
     - иначе `window.open(href, "_blank", "noopener,noreferrer")`.
   - Добавить проверку безопасной ссылки через `isSafeExternalHref`.

6) Тесты
   - `patient-booking/service.test.ts`: кэш инвалидируется, lock отсекает параллельный дубль.
   - `pgPatientBookings.test.ts`: createPending возвращает slot_overlap при overlap.
   - `useCreateBooking` (или рядом): RU mapping ошибок.
   - При необходимости обновить existing tests для in-memory overlap statuses.

7) Проверки
   - Прогнать целевые тесты по измененным файлам.
   - Если затронуты многие модули/есть сомнения — `pnpm run ci`.

8) Лог
   - Обновить `docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/AGENT_EXECUTION_LOG.md`:
     коротко: RCA, файлы, тесты, результат.
```
