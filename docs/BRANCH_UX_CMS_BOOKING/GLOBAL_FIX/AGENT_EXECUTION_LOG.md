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
- Tests: `service.test.ts` (in-memory mock map: свой файл / чужой / unknown); `pgMediaFileIntakeResolve.test.ts` — mock `PoolClient`: успех, нет строки, чужой owner, `pending`/`deleting`, пустой `s3_key`

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
  - `apps/webapp/src/app/api/doctor/online-intake/[id]/route.test.ts` — роль `client` → `403` на GET деталей (пациент не читает doctor intake)
- Tests: `doctorIntakeDetailResponse.test.ts`, `service.test.ts`, `route.test.ts` (изоляция пациента от doctor API)
- Примечание: отдельного GET пациента по id заявки нет — чужие вложения недоступны через patient API; доступ к деталям врача у пациента блокируется `canAccessDoctor`

### S3.T05 - Финальная проверка этапа
- Status: done
- CI: `pnpm run ci` — pass (после remediation Stage 3 audit; см. SHA в блоке AUDIT ниже)
- Evidence: unit-тесты выше + `pgMediaFileIntakeResolve.test.ts` + `doctor/online-intake/[id]/route.test.ts`; чекбоксы в `STAGE_3_F03_ATTACHMENT_FILE_IDS.md` закрыты; ручной e2e с реальной БД/S3 — на стенде после деплоя

### Stage 3 - AUDIT
- Auditor/model: Composer 2 (первичный аудит: medium — без изолированных тестов PG-резолвера и явного теста изоляции пациента)
- Verdict (remediation): **pass** — добавлены `pgMediaFileIntakeResolve.test.ts` (ownership/status/s3_key), `app/api/doctor/online-intake/[id]/route.test.ts` (`client` → 403), обновлены `STAGE_3_F03_ATTACHMENT_FILE_IDS.md` и этот лог; локальная проверка: `pnpm run ci` — pass (2026-04-02)

---

## Stage 4 - F-02

### S4.T01 - Зафиксировать контракт doctor responses
- Status: done
- Agent/model: Cursor agent
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/API_CONTRACT_ONLINE_INTAKE_V1.md` — секция «Patient identity»: обязательные `patientName`/`patientPhone`, источник `platform_users`, пустые строки при отсутствии данных; одинаковый shape list/details
  - `apps/webapp/src/modules/online-intake/types.ts` — `DoctorIntakePatientIdentity`, `IntakeRequestWithPatientIdentity`, `IntakeRequestFullWithPatientIdentity`
- Tests: не требовались (контракт + типы)
- CI: см. S4.T05

### S4.T02 - Join с `platform_users` в doctor list
- Status: done
- Files changed:
  - `apps/webapp/src/infra/repos/pgOnlineIntake.ts` — `listRequestsForDoctor`: `LEFT JOIN platform_users`, `COALESCE(display_name/phone_normalized)`
  - `apps/webapp/src/infra/repos/inMemoryOnlineIntake.ts` — `listRequestsForDoctor` + опциональный `userProfiles`
  - `apps/webapp/src/modules/online-intake/ports.ts`, `service.ts` — `listForDoctor` → `listRequestsForDoctor`
  - `apps/webapp/src/app/api/doctor/online-intake/route.test.ts` — list возвращает identity
- Tests: `service.test.ts` (doctor identity), `route.test.ts`

### S4.T03 - Join в doctor details + унификация mapper
- Status: done
- Files changed:
  - `apps/webapp/src/infra/repos/pgOnlineIntake.ts` — `getByIdForDoctor` (join + те же поля, что в list)
  - `apps/webapp/src/infra/repos/inMemoryOnlineIntake.ts` — `getByIdForDoctor`
  - `apps/webapp/src/modules/online-intake/doctorIntakeDetailResponse.ts` — `buildDoctorOnlineIntakeDetailResponse(full)` без отдельного `patientDisplay`; данные с `IntakeRequestFullWithPatientIdentity`
  - `apps/webapp/src/app/api/doctor/online-intake/[id]/route.ts` — убран второй SQL к `platform_users`; 401/403/404 без изменений по смыслу

### S4.T04 - UI врача без fallback-заглушек (normal path)
- Status: done
- Files changed:
  - `apps/webapp/src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.tsx` — без изменений логики отображения (уже без `—`/`неизвестно`); контрактные поля приходят с API
  - `apps/webapp/src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.test.tsx` — smoke: имя и телефон из ответа list
- Tests: `DoctorOnlineIntakeClient.test.tsx`

### S4.T05 - Финальные проверки и gate
- Status: done
- CI: `pnpm run ci` — pass (локально, 2026-04-03)
- Evidence: webapp `service.test.ts`, `doctorIntakeDetailResponse.test.ts`, `api/doctor/online-intake/route.test.ts`, `DoctorOnlineIntakeClient.test.tsx`; полный CI как выше

### Stage 4 - AUDIT
- Auditor/model: Composer 2 (первичный аудит: low — лишний `userId` в list JSON, `changedBy` nullable vs контракт, слабые ассерты identity в `doctorIntakeDetailResponse.test`)
- Verdict (remediation): **pass** — `GET /api/doctor/online-intake` маппит items без `userId` (`toDoctorListItem` в `route.ts`); `buildDoctorOnlineIntakeDetailResponse` отдаёт `statusHistory[].changedBy` как `string` (`null` → `""`); расширены `doctorIntakeDetailResponse.test.ts`; `route.test.ts` проверяет отсутствие `userId`; локально `pnpm run ci` — pass (2026-04-03, повтор после remediation)

---

## Stage 5 - F-06 (notification deep-link на заявку)

### S5.T01 - Зафиксировать deep-link контракт
- Status: done
- Agent/model: Cursor agent
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/API_CONTRACT_ONLINE_INTAKE_V1.md` — секция «Deep link»: `{APP_BASE_URL}/app/doctor/online-intake/{requestId}`, база из env bootstrap
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_9_ONLINE_INTAKE.md` — уточнён источник базы (`APP_BASE_URL`), path с `requestId`
- Tests: не требовались (док)

### S5.T02 - Генерация deep-link в notification relay
- Status: done
- Files changed:
  - `apps/webapp/src/modules/online-intake/intakeNotificationRelay.ts` — `buildIntakeDeepLink(requestId)`, префикс «Карточка:» в тексте
- Tests: `intakeNotificationRelay.test.ts` — URL содержит `/app/doctor/online-intake/{id}`; `buildIntakeDeepLink` unit cases

### S5.T03 - Шаблоны каналов TG/MAX
- Status: done
- Files changed:
  - `apps/integrator/src/content/telegram/user/templates.json` — ключ `doctor.onlineIntake.notify` (плейсхолдеры `typeLabel`, `patientName`, `summaryPart`, `deepLink`)
  - `apps/integrator/src/content/max/user/templates.json` — тот же ключ (паритет TG/MAX)
- Note: фактическая отправка online-intake по-прежнему идёт relay-outbound с полным текстом из webapp; шаблон зафиксирован для консистентности и возможного reuse

### S5.T04 - Doctor routing (карточка по ссылке)
- Status: done
- Files changed:
  - `apps/webapp/src/app/app/doctor/online-intake/[requestId]/page.tsx` — маршрут с `initialOpenRequestId`
  - `apps/webapp/src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.tsx` — загрузка детали по deep-link, 404/403/error, блок «Заявка по ссылке» если заявки нет в текущем фильтре
- Tests: `DoctorOnlineIntakeClient.test.tsx` — deep-link без строки в списке

### S5.T05 - Smoke и gate
- Status: done
- Evidence:
  - Автоматический smoke: `intakeNotificationRelay.test.ts` (URL + requestId в path), `DoctorOnlineIntakeClient.test.tsx` (открытие карточки по `initialOpenRequestId`)
  - Ручной клик из реальных TG/MAX: требует задеплоенного стенда и учётки; в логе зафиксировано покрытие через unit/UI tests (см. выше)
- CI: `pnpm run ci` — pass (2026-04-03)

### Stage 5 - AUDIT
- Auditor/model: Composer 2
- Verdict: pass
- Evidence checked:
  - Deep-link в уведомлении содержит `requestId` в path
  - UI открывает заявку по `/app/doctor/online-intake/[requestId]`
  - Шаблоны TG/MAX синхронизированы (`doctor.onlineIntake.notify`)

### Stage 5 - AUDIT remediation (post-audit F-06)
- Status: done
- Agent/model: Cursor agent
- Findings закрыты:
  - [minor] F06-DOC-01 — чекбоксы S5.T02–T04 и ссылки на тесты в `STAGE_5_F06_NOTIFICATION_DEEP_LINK.md`
  - [info] F06-E2E-01 — в S5.T05 явно: ручной клик TG/MAX опционален на стенде; gate опирается на `intakeNotificationRelay.test.ts` + `DoctorOnlineIntakeClient.test.tsx`
  - [low] F06-DOC-02 — убран обязательный `scripts.json` из списка файлов S5.T03; добавлено пояснение: relay-outbound с полным текстом из webapp, шаблоны для паритета/reuse
- Дополнительно в stage-doc: шаг S5.T01 про базу ссылки выровнен на `APP_BASE_URL` (не `PUBLIC_URL`)
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/STAGE_5_F06_NOTIFICATION_DEEP_LINK.md`
- Approved at: 2026-04-03

---

## Stage 6 - F-05

### S6.T01 - README index к фактической структуре
- Status: done
- Agent/model: Cursor agent
- Files changed:
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/README.md` — Stages 8–15: вариант B (таблица ссылок на `EXECUTION_LOG`, `AUDIT_STAGE_8_15.md`, `STAGE_9_ONLINE_INTAKE.md`; без битых `STAGE_8_*.md` … `STAGE_15_*.md`)

### S6.T02 - Stage-summary из EXECUTION_LOG/CHECKLISTS
- Status: done
- Files changed:
  - `docs/.../AUDIT_STAGE_8_15.md` — §8 «Stage summaries (variant B)»
  - `docs/.../EXECUTION_LOG.md` — секция «SHA + CI traceability»; обновлён итог Stages 8–15

### S6.T03 - Закрыть online-safe gate
- Status: done
- Files changed:
  - `docs/.../CHECKLISTS.md` §7 — пункт online-safe gate
  - `docs/.../CUTOVER_RUNBOOK.md` §6 — чекбоксы 6.1 и операторские 6.2–6.3

### S6.T04 - Закрыть SHA+CI traceability (Stages 8–15)
- Status: done
- Files changed:
  - `docs/.../EXECUTION_LOG.md` — таблица «SHA + CI traceability»; `CHECKLISTS.md` §7 (пункт про SHA+CI)

### S6.T05 - Финальная docs-синхронизация + AGENT_EXECUTION_LOG
- Status: done
- Files changed:
  - `docs/.../COMPATIBILITY_RUBITIME_WEBAPP.md` — ссылка на §Stage 11 вместо несуществующего `STAGE_11_*.md`
  - `docs/.../AUDIT_STAGE_8_15.md` — §3 mismatches, F-05 remediation, §8 summaries; §6a/§6b разделение docs vs code verdict
  - `docs/.../PROMPTS_EXEC_AUDIT_FIX.md` — STAGE 11 EXEC: ссылки variant B (`EXECUTION_LOG` §Stage 11), без битого `STAGE_11_RUBITIME_COMPAT_BRIDGE.md`
  - `docs/.../EXECUTION_LOG.md` — уточнение строки под таблицей SHA+CI
  - `GLOBAL_FIX/AGENT_EXECUTION_LOG.md` — этот блок

### Evidence (Stage 6)
- Tests: не требуются (документация)
- CI: `pnpm run ci` — pass (2026-04-03); HEAD `b8c08689bf7c49e790cf1691d6af6396a4b59774` (таблица SHA+CI в `BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md`)

### Stage 6 - AUDIT
- Auditor/model: Composer 2
- Verdict: pass (doc-sync scope: `STAGE_6_F05_DOCS_STAGES_8_15_SYNC.md`)
- Findings:
  - [resolved] Расхождение §6 vs §3/`CHECKLISTS` §7 — закрыто: в `AUDIT_STAGE_8_15.md` введены §6a (docs SSOT variant B) и §6b (продуктовый реестр F-01–F-04).
  - [resolved] Битая ссылка `STAGE_11_RUBITIME_COMPAT_BRIDGE.md` в `PROMPTS_EXEC_AUDIT_FIX.md` — заменена на variant B.
  - [resolved] Примечание под таблицей SHA+CI в `EXECUTION_LOG.md` — уточнено без противоречия с текущим HEAD.
  - [info] Открытые F-01–F-04 остаются в `AUDIT_STAGE_8_15.md` §4/§6b как продуктовый трекинг, вне doc-sync Stage 6.
- Evidence checked:
  - `BOOKING_REWORK_CITY_SERVICE/README.md` — индекс Stages 8–15
  - `CHECKLISTS.md` §7, `EXECUTION_LOG.md` SHA+CI, `CUTOVER_RUNBOOK.md` §6, `AUDIT_STAGE_8_15.md` §6a
- Approved at: 2026-04-03

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

## INCIDENT FIX — BOOKING PROD (time / lifecycle / manage link)

### Зафиксированные решения (scope)

- Код + prod cleanup/replay для уже битых данных.
- «Изменить» только при валидном HTTPS URL конкретной записи Rubitime (`patient_bookings.rubitime_manage_url`); без URL — кнопки нет (не `support_contact_url`).

### RCA (baseline)

1. **Integrator `create-record`:** время передавалось как `slotStart.slice(0, 19)` (UTC-часть ISO), без перевода instant → локальное бизнес-время → в Rubitime уезжало на −3 ч (пример UI 11:00 → 08:00).
2. **Webapp `upsertFromRubitime`:** PostgreSQL `could not determine data type of parameter $5` в UPDATE с `CASE` по nullable snapshot-полям → `appointment.record.upserted` уходил в `projection_outbox.dead`.
3. **Cabinet:** «Изменить» использовало `support_contact_url` вместо URL записи Rubitime.

### Prod evidence (заполняет оператор на хосте)

- **commit SHA / services:** confirmed on host — `27193e3897d9ce74c6980e2f0d2705d4bedbce72`; `bersoncarebot-api-prod`, `bersoncarebot-worker-prod`, `bersoncarebot-webapp-prod` = `active`.
- **health:** `GET http://127.0.0.1:3200/health` -> `{"ok":true,"db":"up"}`; `GET http://127.0.0.1:6200/api/health` -> `{"ok":true,"db":"up"}`.
- **dead projection remediation:** выполнены requeue-волны по `parameter $5`, затем `parameter $11`, затем `parameter $14`; после точечных SQL-фиксов `pgPatientBookings.ts` и replay итог outbox: `done=93`, `dead=1`.
- **остаточный dead:** `id=498` (`slot_no_overlap`) — intentional technical block-window record (`+70000000000`, `БЛОК ОКНА`), оставлен в `dead` как non-actionable.

### INCIDENT.S0 — baseline + RCA
- Status: done
- Files: `AGENT_EXECUTION_LOG.md` (этот блок), `PROD_BOOKING_INCIDENT_REMEDIATION.md`

### INCIDENT.S1 — integrator create-record time
- Status: done
- Files: `apps/integrator/src/config/appTimezone.ts` (`formatIsoInstantAsRubitimeRecordLocal`), `recordM2mRoute.ts`, `appTimezone.test.ts`, `recordM2mRoute.test.ts`

### INCIDENT.S2 — webapp upsertFromRubitime / projection SQL
- Status: done
- Files: `apps/webapp/src/infra/repos/pgPatientBookings.ts` (явные `::text` / `::integer` в UPDATE, колонка `rubitime_manage_url`), `pgPatientBookings.test.ts`

### INCIDENT.S3 — exact Rubitime manage link
- Status: done
- Files: migration `054_patient_bookings_rubitime_manage_url.sql`, `types.ts`, `ports.ts`, `events.ts`, `service.ts` + `rubitimeManageUrl.ts`, cabinet components, `inMemoryPatientBookings.ts`, `CabinetActiveBookings.test.tsx`
- Tests: `apps/webapp/src/app/app/patient/cabinet/CabinetActiveBookings.test.tsx` — кнопка «Изменить» только для валидного HTTPS `rubitimeManageUrl`; при `null`/unsafe URL кнопки нет (без fallback в `support_contact_url`)

### INCIDENT.S4 — CI
- Status: done
- CI: `pnpm run ci` green (lint, typecheck, integrator+webapp tests, build, audit)

### INCIDENT.S5 — prod runbook
- Status: done
- File: `docs/BRANCH_UX_CMS_BOOKING/BOOKING_LIFECYCLE_FIX/PROD_BOOKING_INCIDENT_REMEDIATION.md`
- Notes: runbook расширен до operator-grade: обязательная диагностика, replay команды `requeue-projection-outbox-dead.ts` (dry-run/commit/verify), транзакционные шаблоны reconcile (wrong-time, stale-cancel, URL backfill), обязательный closeout payload

### INCIDENT.S6 — post-deploy smoke
- Status: in_progress
- Evidence: host SHA/services/health подтверждены; replay outbox выполнен и стабилизирован (`done=93`, `dead=1` intentional).
- Remaining: финальный продуктовый smoke по кабинету пациента (подтвердить отсутствие ложных historical rows для `+79189000782` через targeted reconcile decision).

### INCIDENT.S7 — closeout
- Status: blocked (закрывается только после S6)
- **Residual risks:** старые строки без `rubitime_manage_url`; replay dead events нужен по факту id из prod.

### INCIDENT.REMEDIATION.AUDITFIX — post-audit corrections
- Status: done
- Agent/model: Cursor agent
- Files changed:
  - `apps/webapp/src/app/app/patient/cabinet/CabinetActiveBookings.test.tsx` — UI regression coverage для exact manage link
  - `docs/BRANCH_UX_CMS_BOOKING/BOOKING_LIFECYCLE_FIX/PROD_BOOKING_INCIDENT_REMEDIATION.md` — детализированный prod replay/reconcile runbook с транзакционными SQL-шаблонами
  - `docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/AGENT_EXECUTION_LOG.md` — статусы S6/S7 переведены в `blocked` до фактического prod evidence
- Tests:
  - `pnpm -C apps/webapp test src/app/app/patient/cabinet/CabinetActiveBookings.test.tsx`
  - `pnpm -C apps/webapp test src/infra/repos/pgPatientBookings.test.ts src/modules/patient-booking/rubitimeManageUrl.test.ts src/modules/patient-booking/service.test.ts src/modules/integrator/events.test.ts`
- CI:
  - `pnpm run ci` — pass (local, 2026-04-02)
- Notes:
  - Этот блок закрывает замечания аудита по S3/S5. S6/S7 остаются operator-dependent.

### INCIDENT.REMEDIATION.CANCELLED_PROJECTION_HIDE
- Status: done
- Agent/model: Cursor agent
- Files changed:
  - `apps/webapp/src/infra/repos/pgPatientBookings.ts` — при `upsertFromRubitime(status='cancelled')` для `source='rubitime_projection'` строка удаляется; cancel-событие без существующей строки не создает compat-row
  - `apps/webapp/src/infra/repos/inMemoryPatientBookings.ts` — parity с PG: cancel removes compat row / skip create
  - `apps/webapp/src/app-layer/di/buildAppDeps.ts` — `getPastAppointments` фильтрует cancelled-строки из `appointment_records` в пациентском журнале
  - `apps/webapp/src/infra/repos/pgPatientBookings.test.ts` — regression на delete/skip-create для compat cancel
  - `apps/webapp/src/infra/repos/inMemoryPatientBookings.test.ts` — parity regression на cancel behavior
- Tests:
  - `pnpm -C apps/webapp test src/infra/repos/pgPatientBookings.test.ts src/infra/repos/inMemoryPatientBookings.test.ts src/modules/integrator/events.test.ts`
- Notes:
  - Цель: remove/delete из Rubitime не оставляет «Запись из расписания» в журнале пациента.

### INCIDENT.REMEDIATION.BOOKING_TIME_AND_OVERLAP_V2
- Status: done
- Problem (prod-like):
  1. **Журнал / отменённая запись:** время в `patient_bookings` сдвигалось (например +1 ч к Москве), потому что webhook `appointment.record.upserted` передаёт `recordAt` как **наивную** строку без TZ; в UPDATE пути `upsertFromRubitime` она кастилась в `timestamptz` в контексте session TZ и **перезаписывала** корректный `slot_start` у **native**-строки.
  2. **«Это время уже занято» на свободный слот:** overlap в `createPending` и EXCLUDE в БД были **глобальными** (все пациенты/все специалисты), из‑за чего чужая запись на тот же интервал блокировала слот у другого специалиста.
- Fix:
  - `apps/webapp/src/infra/repos/pgPatientBookings.ts` — в UPDATE `upsertFromRubitime`: `slot_start`/`slot_end` обновляются только при `source = 'rubitime_projection'`; для `native` время не трогаем.
  - `apps/webapp/src/infra/repos/inMemoryPatientBookings.ts` — parity: не перезаписывать слот у native при upsert.
  - `apps/webapp/src/infra/repos/pgPatientBookings.ts` — `createPending`: overlap только с тем же `rubitime_cooperator_id_snapshot`, иначе (online / без специалиста) — только с тем же `platform_user_id`.
  - `apps/webapp/src/infra/repos/inMemoryPatientBookings.ts` — та же логика overlap.
  - `apps/webapp/src/modules/patient-booking/service.ts` — ключ `inFlightCreateBySlot` включает `branchServiceId` (in_person) или `online:category` (online), чтобы не блокировать параллельные брони разных ресурсов.
  - `apps/webapp/migrations/055_patient_bookings_overlap_per_specialist.sql` — EXCLUDE пересобран: пересечение интервалов только внутри одного `rubitime_cooperator_id_snapshot` (для `confirmed`/`rescheduled` при непустом snapshot).
- Tests:
  - `pnpm -C apps/webapp test src/infra/repos/pgPatientBookings.test.ts src/infra/repos/inMemoryPatientBookings.test.ts`
  - `pnpm -C apps/webapp test src/modules/patient-booking/service.test.ts`
- CI:
  - `pnpm run ci` — pass (local, 2026-04-03)
- Ops:
  - После merge: применить webapp-миграции на prod (`055_...`), иначе constraint останется старым.

### INCIDENT.PROD.EXECUTION.LOG — outbox replay timeline (operator)
- Status: done
- Host SHA: `27193e3897d9ce74c6980e2f0d2705d4bedbce72`
- Steps:
  - baseline: `appointment.record.upserted` dead rows observed with `parameter $5`.
  - replay #1 (`error-contains='parameter $5'`): requeued 14.
  - replay #2 (`error-contains='parameter $11'`): after SQL cast fix for `$10/$11/$12::uuid`, requeued 14.
  - replay #3 (`error-contains='parameter $14'`): after SQL cast fix for `$14/$15::integer`, requeued 14.
  - point fix: `id=451` moved to pending and delivered after confirming `patient_bookings.platform_user_id` nullable = `YES`.
- Final outbox snapshot:
  - `done=93`
  - `dead=1` (`id=498`, `slot_no_overlap`, technical window block record)

---

## Итоговый релизный блок

- Final verdict: pending
- Final SHA: pending
- Final CI date: pending
- Release decision: pending
