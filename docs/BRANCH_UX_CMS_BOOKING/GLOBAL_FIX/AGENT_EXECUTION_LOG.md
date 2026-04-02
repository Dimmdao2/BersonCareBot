# AGENT EXECUTION LOG: GLOBAL_FIX

Статусы:

- task: `pending | in_progress | done | blocked | skipped`
- audit verdict: `pass | rework`
- stage verdict: `pass | fail`

---

## Формат записи задачи

```markdown
### Sx.Tyy - <task title>
- Status:
- Agent/model:
- Started at:
- Finished at:
- Files changed:
  - `path` - short note
- Tests:
- CI:
- Evidence:
- Notes:
```

## Формат записи аудита этапа

```markdown
### Stage x - AUDIT
- Auditor/model: Composer 2
- Verdict: pass | rework
- Findings:
  - [severity] <id> <summary>
- Required fixes:
  - <item>
- Evidence checked:
  - <tests/sql/logs>
- Approved at:
```

---

## BOOKING_LIFECYCLE_FIX Stage 1

| Task | File | Status |
|------|------|--------|
| 1.1 Retry `postSigned` (3×, backoff 1s/2s/4s, 5xx + `TypeError`) | `apps/webapp/src/modules/integrator/bookingM2mApi.ts` | done |
| 1.2 `createBooking` guard: missing `rubitimeId` → `failed_sync` + `rubitime_id_missing` | `apps/webapp/src/modules/patient-booking/service.ts` | done |
| 1.3 `upsertFromRubitime` fallback: native + phone + `slot_start` | `apps/webapp/src/infra/repos/pgPatientBookings.ts` | done |
| 1.4 `postRubitimeApi2` retry (3×, backoff 1s/2s/4s, 5xx + `TypeError`; 4xx без ретрая; envelope `status !== ok` без ретрая) | `apps/integrator/src/integrations/rubitime/client.ts` | done |
| 1.5 `dispatchOutgoing` `maxAttempts: 3` (patient + doctor TG/MAX) | `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` | done |
| 1.6 Tests | `service.test.ts`, `pgPatientBookings.test.ts`, `inMemoryPatientBookings.test.ts`, `bookingM2mApi.test.ts`, `client.test.ts` | done |
| 1.7 CI | — | done |
| 1.8 In-memory parity: тот же fallback `upsertFromRubitime` (native + phone + slot, `ORDER BY created_at DESC` → max `createdAt`) | `apps/webapp/src/infra/repos/inMemoryPatientBookings.ts` | done |
| 1.9 SQL cleanup (диагностика / `failed_sync` / reconcile webapp↔integrator) | `docs/BRANCH_UX_CMS_BOOKING/BOOKING_LIFECYCLE_FIX/cleanup_*.sql` | done |

- CI evidence: green, 2026-04-02 (`pnpm run ci`); 1.4/1.8/1.9 зафиксированы в том же прогоне

### BOOKING_LIFECYCLE_FIX — parity integrator + in-memory + SQL cleanup (2026-04-02)
- Status: done
- Agent/model: Cursor agent
- Files changed:
  - `apps/integrator/src/integrations/rubitime/client.ts` — выравнивание ретраев с webapp `postSignedWithRetry`: 3 попытки, backoff `[1000, 2000, 4000]` мс
  - `apps/integrator/src/integrations/rubitime/client.test.ts` — ожидания числа вызовов `fetch` (в т.ч. три 503 подряд; два 503 затем 200)
  - `apps/webapp/src/infra/repos/inMemoryPatientBookings.ts` — `normalizeRuPhoneE164`, fallback до основного UPDATE, `applyUpsertFromRubitimeToRow`
  - `apps/webapp/src/infra/repos/inMemoryPatientBookings.test.ts` — кейс «fallback links native row by phone + slot…»
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_LIFECYCLE_FIX/cleanup_diagnostic.sql` — только SELECT
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_LIFECYCLE_FIX/cleanup_fix.sql` — `BEGIN` / UPDATE → `failed_sync` / `ROLLBACK` по умолчанию
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_LIFECYCLE_FIX/cleanup_reconcile.sql` — ручной cross-DB reconcile с `rubitime_records`
- Tests: `pnpm --dir apps/integrator test` (client), `pnpm --dir apps/webapp test` (in-memory); полный `pnpm run ci`
- Notes: изначально в таблице 1.4 ошибочно стояло «2×, 2s» — исправлено на фактическую политику 3× и backoff как у webapp

---

## Stage 1 - F-01

### S1.T01 - Зафиксировать целевой контракт ingest resiliency
- Status: done
- Agent/model: Cursor agent
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/COMPATIBILITY_RUBITIME_WEBAPP.md` — секция Ingest resiliency (recoverable vs non-recoverable, backoff, idempotency, phone policy)
  - `apps/webapp/src/modules/integrator/ingestErrorClassification.ts` — классификация HTTP-исходов emit
  - `apps/webapp/src/modules/integrator/ingestErrorClassification.test.ts` — contract tests
- Tests: `ingestErrorClassification.test.ts`
- CI: `pnpm run ci` (2026-04-02)
- Evidence: recoverable = 0/5xx/503/429/408; non-recoverable = 4xx except 429/408

### S1.T02 - User linking по телефону
- Status: done
- Files changed:
  - `apps/webapp/src/shared/phone/normalizeRuPhoneE164.ts` + test
  - `apps/webapp/src/modules/integrator/events.ts` — нормализация телефона перед findByPhone / applyRubitimeUpdate
  - `apps/integrator/src/infra/db/writePort.ts` + `apps/integrator/src/infra/phone/normalizeRuPhoneE164.ts`
  - `apps/integrator/src/integrations/rubitime/connector.ts` — autobind payload phone
  - `apps/webapp/src/infra/repos/pgUserByPhone.ts`, `deliveryTargetsApi.ts` — общая нормализация
  - `apps/webapp/migrations/052_patient_bookings_platform_user_null_compat.sql` — `platform_user_id` nullable для `rubitime_projection`, CHECK для native
  - `apps/webapp/src/infra/repos/pgPatientBookings.ts`, `types.ts`, `inMemoryPatientBookings.ts`
- Tests: `events.test.ts` (normalize + findByPhone), `normalizeRuPhoneE164.test.ts`, compat in-memory tests
- CI: green

### S1.T03 - Очередь/worker/retry/backoff
- Status: done
- Files changed:
  - `apps/integrator/src/infra/runtime/worker/projectionWorker.ts` — non-recoverable emit → immediate dead; backoff cap 3600s
  - `apps/integrator/src/infra/runtime/worker/projectionEmitFailure.ts` + test
  - `apps/integrator/src/infra/runtime/worker/projectionWorker.test.ts` — 422 immediate fail, cap backoff
- Tests: integrator `projectionWorker.test.ts`, `projectionEmitFailure.test.ts`
- CI: green

### S1.T04 - Dead-letter + requeue
- Status: done
- Files changed:
  - `apps/webapp/scripts/requeue-projection-outbox-dead.ts` — dry-run / `--commit`, фильтры event-type / error substring
  - `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/RUNBOOK_RUBITIME_RESYNC.md` — шаг 2.3
- Tests: логика скрипта покрыта ручным сценарием; SQL контрольные запросы в runbook
- CI: green

### S1.T05 - Проверки этапа и gate
- Status: done
- Tests: полный `pnpm run ci`
- Gate evidence (SQL — на стенде с БД, не в CI):
  - Контроль «нет новых dead с `last_error` про platform_user_id»: см. runbook и `RUNBOOK_RUBITIME_RESYNC.md` (раздел «После: outbox состояние»).
  - Локально: CI green = предусловие gate; метрика dead по БД — после деплоя миграции 052 и прогона worker.

### Stage 1 - AUDIT
- Auditor/model: Composer 2
- Verdict: **pass** (код + CI; SQL-метрика dead на целевой БД — постдеплойная проверка по runbook)
- Findings (audit 2026-04-02) — закрыто:
  - [minor] Лог аудита и tie-break — обновлены `AGENT_EXECUTION_LOG`, `COMPATIBILITY_RUBITIME_WEBAPP.md`, `pgUserByPhone` (ambiguous → null), тесты `events` + `pgUserByPhone`.
- Required fixes: —
- Evidence checked:
  - `pnpm run ci` — pass (см. последний прогон при закрытии Stage 1 FIX)
  - SQL «нет новых dead по platform_user_id»: оператор после миграции 052 — `RUNBOOK_RUBITIME_RESYNC.md`
- Approved at: 2026-04-02

### Stage 1 - FIX (post-audit)
- Status: done
- Files changed:
  - `apps/webapp/src/infra/repos/pgUserByPhone.ts` — при `>1` пользователе с тем же телефоном `findByPhone` → `null`
  - `apps/webapp/src/infra/repos/pgUserByPhone.test.ts` — покрытие 0 / 1 / ambiguous
  - `apps/webapp/src/modules/integrator/events.test.ts` — no phone match → `userId: null`; fallback `integratorUserId`
  - `docs/.../COMPATIBILITY_RUBITIME_WEBAPP.md` — явная ссылка на реализацию tie-break
- CI: `pnpm run ci` — pass (2026-04-02)

### INCIDENT HOTFIX — native booking (slots / дубли / RU / UX)
- Status: done
- Agent/model: Cursor agent
- RCA (кратко):
  - кэш слотов с длинным TTL без инвалидации после мутаций;
  - гонки при параллельном создании на тот же слот;
  - `createPending` без pre-check overlap по in-flight статусам;
  - сырой `error` в UI вместо RU;
  - «Изменить» через `target=_blank` в mini app;
  - нет мгновенного success toast после подтверждения.
- Files changed:
  - `apps/webapp/src/modules/patient-booking/service.ts` — TTL 60s, `lastSlotsMutationAt` + инвалидация, in-flight lock по слоту, инвалидация при `booking_confirm_failed` и при `cancel_sync_failed`
  - `apps/webapp/src/infra/repos/pgPatientBookings.ts` — pre-check overlap в `createPending` (CTE + WHERE NOT EXISTS)
  - `apps/webapp/src/infra/repos/inMemoryPatientBookings.ts` — blocking statuses как в PG
  - `apps/webapp/src/app/app/patient/cabinet/useCreateBooking.ts`, `bookingCreateErrorMessages.ts` — RU mapping
  - `apps/webapp/src/app/app/patient/booking/new/confirm/ConfirmStepClient.tsx` — `toast.success` после успеха
  - `apps/webapp/src/app/app/patient/cabinet/CabinetActiveBookings.tsx` — client-кнопка + `openExternalLinkInMessenger`
  - `apps/webapp/src/shared/lib/openExternalLinkInMessenger.ts` — Telegram `WebApp.openLink` / fallback
- Tests: `service.test.ts` (cache + concurrent lock + cancel sync_failed cache invalidation), `pgPatientBookings.test.ts` (overlap), `bookingCreateErrorMessages.test.ts`
- CI: `pnpm run ci` — pass (2026-04-02)

### HOTFIX PLAN — BOOKING FLOW (baseline + decisions, для слабого агента)
- Status: done
- Agent/model: Cursor agent
- Started at: 2026-04-02
- Scope: native booking flow + cabinet UX + связанные тесты/лог; без правки файла плана `.cursor/plans/`.
- Зафиксированные решения (не менять):
  - **Overlap:** global (без привязки к врачу/ресурсу).
  - **Блокируют слот:** `creating`, `confirmed`, `rescheduled`, `cancelling`, `cancel_failed`.
  - **Не блокируют:** `cancelled`, `completed` (и прочие финальные non-blocking).
  - **Авто-refresh слотов на клиенте:** не добавлять (только TTL + инвалидация на сервере).
- HOTFIX.S0: запись старта и решений — этот блок.
- HOTFIX.S1 дополнение: при отмене с `sync_failed` (`cancelRecord` упал) вызывать `invalidateSlotsCache()` после `markCancelled(..., cancel_failed)`, чтобы UI не держал устаревшие слоты.
- Evidence (после прогона): см. HOTFIX.S7 ниже.

### HOTFIX.S7 — финальные проверки
- Status: done
- Tests: `service.test.ts` (в т.ч. `cancelBooking: sync failure invalidates slots cache...`), `pgPatientBookings.test.ts`, `bookingCreateErrorMessages.test.ts`; полный `pnpm --dir apps/webapp vitest --run`
- CI: `pnpm run ci` — pass (2026-04-02)
- Evidence:
  - инвалидация кэша при `cancel_sync_failed`: `apps/webapp/src/modules/patient-booking/service.ts` + тест в `service.test.ts`
  - остальные пункты плана уже в коде (см. блок «INCIDENT HOTFIX — native booking» выше)

### HOTFIX PLAN — статус доделок (чеклист ✓/✗, приоритет)

**Вывод:** по scope HOTFIX PLAN (кэш, дубли, RU, toast, «Изменить», тесты, CI) **критичных и обязательных доделок нет** — закрыто. Ниже — пометки по желательным/техдолгу вне scope.

| Приоритет | Пункт | ✓/✗ | Комментарий |
|-----------|--------|-----|-------------|
| **критично** | S1–S7 реализованы, `pnpm run ci` green | ✓ | Блокирующих задач нет. |
| **критично** | Инвалидация кэша при `cancel_sync_failed` | ✓ | Закрыто в `service.ts` + тест. |
| **важно** | Соответствие плана и EXCLUDE в БД (`041`): pre-check шире статусов, чем `EXCLUDE` только для `confirmed`/`rescheduled` | ✓ | Ожидаемо: узкий EXCLUDE + широкий pre-check; не баг. |
| **низкий** | Дословная строка «INCIDENT HOTFIX execution started» в логе | ✗ | Вместо неё блок «HOTFIX PLAN — BOOKING FLOW» с тем же смыслом; править не обязательно. |
| **низкий** | Отдельный тест parity `inMemoryPatientBookings` vs PG (fallback `upsertFromRubitime`) | ✓ | Закрыто: `inMemoryPatientBookings.test.ts` — native + `rubitimeId: null` → webhook с тем же phone/slot; см. также задачу 1.8 в таблице BOOKING_LIFECYCLE_FIX. |
| **опционально (вне scope плана)** | Client auto-refresh слотов раз в 60с | ✗ | Явно **не** делали по решению плана. |
| **опционально (продукт)** | Overlap по ресурсу врача/услуги вместо global | ✗ | Отдельная фича + миграция; не входит в этот hotfix. |
| **операционно** | Перед merge: повторить `pnpm run ci` на актуальном `main` | — | Рекомендация, не дефект кода. |

Кратко: **доделывать по hotfix-плану ничего не нужно**; крестики только у косметики/опций вне scope.

---

## Stage 2 - F-04

### S2.T01 - Контракт полного compat enrichment
- Status: done
- Agent/model: Cursor agent
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/COMPATIBILITY_RUBITIME_WEBAPP.md` — DoD `full`/`partial`/`minimal`, запрет fake full, `branch_service_lookup_miss`, ссылка на `computeCompatSyncQuality` и backfill
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CHECKLISTS.md` — пункт F-04 в §5
- Tests: не требуются (док)
- CI: `pnpm run ci` (2026-04-02, SHA `98e98d365a43a4e7105729f51f18b00ada4a061d`)

### S2.T02 - Реальный lookup branch_service_id
- Status: done
- Files changed:
  - `apps/webapp/src/infra/repos/rubitimeBranchServiceLookup.ts` — deterministic SQL lookup + ambiguous без cooperator
  - `apps/webapp/src/infra/repos/pgPatientBookings.ts` — merge lookup, snapshot/FK columns, `lookup_miss`/`ambiguous` логи
  - `apps/webapp/src/modules/patient-booking/compatSyncQuality.ts` — реальные критерии `full` (в т.ч. `branch_service_id`)
  - `apps/webapp/src/modules/integrator/events.ts` — `rubitimeCooperatorId` из payload
  - `apps/integrator/src/infra/db/writePort.ts` — `rubitimeCooperatorId` в projection payload
  - `apps/integrator/src/integrations/rubitime/connector.ts` — `cooperatorId` из record
  - `apps/integrator/src/content/rubitime/scripts.json` — `rubitimeCooperatorId` в `booking.upsert`
- Tests: `compatSyncQuality.test.ts`, `inMemoryPatientBookings.test.ts`, `pgPatientBookings.test.ts` — mock `lookupBranchServiceByRubitimeIds`: create → `full` + `branch_service_id`, update → `UPDATE` без второго INSERT, lookup miss → `minimal`
- CI: green (тот же SHA до аудита; после remediation — см. Stage 2 AUDIT)

### S2.T03 - Provenance (createdBy/updatedBy/sourceActor)
- Status: done
- Files changed:
  - `apps/webapp/migrations/053_patient_bookings_compat_provenance.sql` — `provenance_created_by`, `provenance_updated_by`
  - `apps/webapp/src/modules/patient-booking/types.ts` — поля на `PatientBookingRecord`
  - `apps/webapp/src/infra/repos/pgPatientBookings.ts` — `rubitime_external` на create/update compat
- Tests: маппинг через list/get покрыт типами + репо
- CI: green

### S2.T04 - UI маркер происхождения
- Status: done (расширено после аудита: врачебный UI)
- Files changed:
  - `apps/webapp/src/shared/lib/scheduleRecordProvenance.ts` — единый `SCHEDULE_RECORD_PROVENANCE_PREFIX`
  - `apps/webapp/src/app/app/patient/cabinet/patientBookingLabels.ts` — `bookingProvenancePrefix`, реэкспорт префикса
  - `CabinetActiveBookings.tsx`, `CabinetPastBookings.tsx`, `CabinetUpcomingAppointments.tsx` — префикс / подпись
  - `buildAppDeps.ts` — `scheduleProvenancePrefix` для `AppointmentSummary` / `PastAppointmentSummary` / `ClientAppointmentHistoryItem`
  - `pgDoctorAppointments.ts`, `doctor-appointments/ports.ts` — `scheduleProvenancePrefix` в строках списка врача
  - `app/app/doctor/appointments/page.tsx`, `DoctorDashboardContextWidgets.tsx`, `doctor/page.tsx`, `ClientProfileCard.tsx` — отображение маркера
- Tests: `patientBookingLabels.test.ts`
- CI: green

### S2.T05 - Backfill + CI + gate evidence
- Status: done
- Files changed:
  - `apps/webapp/scripts/backfill-rubitime-compat-snapshots.ts` — phase 1 payload + phase 2 catalog, counters (`snapshot_*`, `catalog_*`); в JSON-выводе добавлено поле `catalog_degraded` (= `catalog_lookup_miss` + `catalog_lookup_ambiguous`) для согласования с S2.T05 «degraded»
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md` — блок Stage 2 F-04 (этот лог)
- Evidence (SQL — на стенде с БД): см. комментарии в head backfill-скрипта; до/после: `SELECT count(*), compat_quality FROM patient_bookings WHERE source='rubitime_projection' GROUP BY 2;`
- CI: `pnpm run ci` — pass (после remediation)

### Stage 2 - AUDIT
- Auditor/model: Composer 2 (первичный аудит: rework по doctor UI + тестам lookup-path + счётчику backfill)
- Verdict (remediation): **pass** — маркер «Из расписания · » в кабинете врача (дашборд, список записей, карточка клиента: предстоящие + история), тесты `upsertFromRubitime` с моком `lookupBranchServiceByRubitimeIds`, поле `catalog_degraded` в JSON-выводе backfill; проверки: `pnpm run ci` — pass (2026-04-02, после патча в рабочем дереве)

---

## Stage 3 - F-03

### S3.T01 - Зафиксировать контракт attachmentFileIds
- Status: done
- Agent/model: Cursor agent
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/API_CONTRACT_ONLINE_INTAKE_V1.md` — `attachmentFileIds` = `media_files.id`, ownership/status, mixed URL+file, порядок URL затем file, дедуп, коды ошибок
  - `apps/webapp/src/modules/online-intake/types.ts` — комментарии к `CreateLfkIntakeInput`
  - `apps/webapp/src/app/api/patient/online-intake/lfk/route.ts` — `z.array(z.string().uuid()).max(10)` для `attachmentFileIds`
- Tests: zod в route; контракт зафиксирован в docs
- CI: см. S3.T05

### S3.T02 - Resolver media_files.id -> s3_key
- Status: done
- Files changed:
  - `apps/webapp/src/infra/repos/pgMediaFileIntakeResolve.ts` — `resolveMediaFileForLfkAttachment` (owner `uploaded_by`, статус не `pending`/`deleting`, `s3_key` обязателен)
  - `apps/webapp/src/infra/repos/pgOnlineIntake.ts` — INSERT `online_intake_attachments` с `attachment_type='file'`, поля из `media_files`
- Tests: `service.test.ts` (in-memory mock map: свой файл / чужой / unknown)

### S3.T03 - Persist mixed attachments (url + file)
- Status: done
- Files changed:
  - `apps/webapp/src/modules/online-intake/service.ts` — дедуп URL и file id (порядок первых вхождений), затем PG/in-memory
  - `apps/webapp/src/infra/repos/pgOnlineIntake.ts` — сначала URL-строки, затем file-строки
  - `apps/webapp/src/infra/repos/inMemoryOnlineIntake.ts` — опциональный `mediaFilesById` для тестов
- Tests: `service.test.ts` — mixed order, dedupe

### S3.T04 - Doctor visibility + e2e tests
- Status: done
- Files changed:
  - `apps/webapp/src/infra/s3/client.ts` — `presignGetUrl` (default 3600s)
  - `apps/webapp/src/modules/online-intake/doctorIntakeDetailResponse.ts` — контрактный JSON: `description`, `attachmentUrls`, `attachmentFiles` (+ presign или public URL если S3 не сконфигурирован)
  - `apps/webapp/src/app/api/doctor/online-intake/[id]/route.ts` — join `platform_users` для имени/телефона, ответ через builder (не сырой `IntakeRequestFull`)
  - `apps/webapp/src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.tsx` — «Подробнее»: текст + ссылки URL + файлы
  - `apps/webapp/src/modules/online-intake/doctorIntakeDetailResponse.test.ts` — смешанные вложения в ответе
- Tests: `doctorIntakeDetailResponse.test.ts`, `service.test.ts`
- Примечание: отдельного GET пациента по id заявки нет — чужие вложения недоступны через patient API

### S3.T05 - Финальная проверка этапа
- Status: done
- CI: `pnpm run ci` — pass (2026-04-02)
- Evidence: unit-тесты выше; ручной e2e с реальной БД/S3 — на стенде после деплоя

### Stage 3 - AUDIT
- Auditor/model: Composer 2
- Verdict: pending (код + CI; полный e2e с PG+S3 на стенде)

---

## Stage 4 - F-02

### S4.T01 - Join patient identity для doctor list/details
- Status: pending

### S4.T02 - Контрактный ответ API без fallback
- Status: pending

### S4.T03 - UI doctor inbox alignment
- Status: pending

### S4.T04 - Тесты + gate evidence
- Status: pending

### Stage 4 - AUDIT
- Auditor/model: Composer 2
- Verdict: pending

---

## Stage 5 - F-06

### S5.T01 - Генерация deep-link с requestId
- Status: pending

### S5.T02 - Шаблоны TG/MAX + маршрутизация
- Status: pending

### S5.T03 - e2e click-through проверка
- Status: pending

### Stage 5 - AUDIT
- Auditor/model: Composer 2
- Verdict: pending

---

## Stage 6 - F-05

### S6.T01 - README index к фактической структуре
- Status: pending

### S6.T02 - Stage-summary из EXECUTION_LOG/CHECKLISTS
- Status: pending

### S6.T03 - Закрыть online-safe gate и SHA+CI traceability
- Status: pending

### S6.T04 - Финальная синхронизация docs
- Status: pending

### Stage 6 - AUDIT
- Auditor/model: Composer 2
- Verdict: pending

---

## Stage 7 - Final integration audit

### S7.T01 - Full CI (`pnpm run ci`)
- Status: pending

### S7.T02 - SQL metrics (compat/inbox/outbox)
- Status: pending

### S7.T03 - Ручной smoke (booking/intake/doctor)
- Status: pending

### S7.T04 - Финальный аудит-вердикт
- Status: pending

### Stage 7 - AUDIT
- Auditor/model: Composer 2
- Verdict: pending

---

## Итоговый релизный блок

- Final verdict: pending
- Final SHA: pending
- Final CI date: pending
- Release decision: pending
