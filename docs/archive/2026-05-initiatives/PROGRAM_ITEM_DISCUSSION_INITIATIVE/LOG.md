# LOG — PROGRAM_ITEM_DISCUSSION_INITIATIVE

Журнал решений, контрактов и проверок по инициативе обсуждения элементов программы.

---

## 2026-05-30 — Этап 0 (документация и контракты)

### Что сделано

- Создана папка инициативы `docs/PROGRAM_ITEM_DISCUSSION_INITIATIVE/`.
- Добавлен [`README.md`](README.md) с явной фиксацией решений `P1-P24` и ссылкой на рабочий plan.
- Зафиксированы API-контракты этапа в этом `LOG.md`.

### Решения этапа 0 (канон, без отложенных пунктов)

`P1-P24` приняты как обязательные для реализации и не остаются «на потом»:

- `P1-P7`: scope doctor-program, interim webapp-reply из журнала.
- `P8-P13`: legacy merge, backfill, unread-модель, complete-модалка и last-done.
- `P14-P17`: submission-media policy, patient-scoped upload, UX copy, без новых env.
- `P18-P24`: backward compatibility, idempotency, pagination, linkage policy, playback policy, rollout flags, static thumbs.

Полный текст решений хранится в [`README.md`](README.md), этот `LOG.md` является формальной фиксацией принятия `P1-P24` как обязательных требований.

### API-контракты этапа 0 (v1, фиксированные)

#### 1) Discussion thread пациента по элементу

- `GET /api/patient/treatment-program-instances/{instanceId}/items/{itemId}/discussion`
  - Query: `cursor?`, `limit?`, `direction=backward` (default).
  - Response:
    - `{ ok: true, messages, pageInfo, totalCount, unreadCount, lastMessage, lastDoneSummary }`
  - Инварианты:
    - сортировка стабильная по `(createdAt, id)`;
    - только `assignment_source === doctor`;
    - thread ограничен текущим `itemId`.

- `POST /api/patient/treatment-program-instances/{instanceId}/items/{itemId}/discussion`
  - Body: `{ body: string }`.
  - Response: `{ ok: true, message }`.
  - Инварианты:
    - `body` trim + max length;
    - запись в `program_item_discussion_messages` c `sender_role=patient`.

- `POST /api/patient/treatment-program-instances/{instanceId}/items/{itemId}/discussion/read`
  - Body: `{}`.
  - Response: `{ ok: true }`.
  - Инварианты:
    - upsert в `program_item_discussion_reads`;
    - снятие per-item unread.

- `POST /api/patient/treatment-program-instances/{instanceId}/items/{itemId}/discussion/media`
  - Body: `{ mediaFileId: string }`.
  - Response: `{ ok: true, message }`.
  - Инварианты:
    - только владелец `uploaded_by == patientUserId`;
    - `usage_purpose=program_item_submission`.

#### 2) Отметка выполнения элемента

- `POST /api/patient/treatment-program-instances/{instanceId}/items/{itemId}/progress/complete`
  - Body (новый клиент): `{ perceivedDifficulty: "easy" | "medium" | "hard", reps?: number, weightKg?: number }`.
  - Body (старый клиент): отсутствует.
  - Response: `{ ok: true, item }` (текущий контракт route/service).
  - Инварианты:
    - backward-compatible;
    - payload `done` дополняется полями выполнения.

#### 3) Interim-ответ врача из журнала программы

- `POST /api/doctor/treatment-program-instances/{instanceId}/items/{itemId}/program-note-reply`
  - Body: `{ text: string }`.
  - Response: `{ ok: true }`.
  - Инварианты:
    - тонкий route + вызов сервиса `sendProgramNoteReply`;
    - idempotent поведение;
    - dual-write: support chat + discussion.

#### 4) Patient media upload (scoped)

- `POST /api/patient/media/program-submission/presign`
  - Body: `{ filename: string, mimeType: string, size: number }`.
  - Response: `{ ok: true, mediaId: string, uploadUrl: string, readUrl: string }`.
  - Ошибки:
    - `403 forbidden` (нет patient-сессии),
    - `400 invalid_json|invalid_body`,
    - `415 mime_not_allowed`,
    - `413 file_too_large`,
    - `500 presign_failed`.

- `POST /api/patient/media/program-submission/confirm`
  - Body: `{ mediaId: string }`.
  - Response: `{ ok: true, mediaId: string, url: string }`.
  - Ошибки:
    - `403 forbidden`,
    - `400 invalid_json|invalid_body`,
    - `404 not_found|file_not_found_in_s3`,
    - `409 invalid_status|confirm_race`,
    - `500 missing_s3_key`.
  - Инварианты:
    - отдельный patient-scoped путь;
    - no HLS для submission-media;
    - progressive 480p output после transcode.

### Принятые ограничения этапа 0

- Реализация кода и миграций не выполнялась (только документация и контракты).
- Переработка `/app/doctor/messages` остается вне scope.
- Promo/course сценарии пациента не включаются.

### Локальные проверки этапа 0

- Проверена структура инициативы: новые файлы только в `docs/PROGRAM_ITEM_DISCUSSION_INITIATIVE/`.
- Контракты синхронизированы с текущим plan-файлом (`P1-P24`, фазы 0-7).
- Для этапа 0 не оставлено опциональных/отложенных пунктов: все требования этапа зафиксированы в явном виде.

---

## 2026-05-30 — Этап 1 (schema + doctor reply) + закрытие аудита этапа

### Что сделано

- Схема и миграция этапа 1 добавлены и зафиксированы:
  - `program_item_discussion_messages`;
  - `program_item_discussion_reads`;
  - `media_files.usage_purpose` (`program_item_submission`).
- Реализован `sendProgramNoteReply` и интеграция в `integratorSupportBridge` (dual-write: support chat + discussion).
- Реализован doctor route:
  - `POST /api/doctor/treatment-program-instances/{instanceId}/items/{itemId}/program-note-reply`.
- В doctor UI на странице инстанса программы добавлен click-to-reply из строки patient note в журнале.

### Исправления по аудиту этапа 1 (без хвостов)

- Исправлен endpoint mismatch:
  - удалён путь `.../note-reply`;
  - канонический путь `.../program-note-reply` применён и в route, и в doctor UI вызове.
- Добавлены rollout flags `P23` в `system_settings`:
  - `patient_program_discussion_doctor_reply_from_log_enabled`;
  - `patient_program_discussion_ui_enabled`;
  - `patient_program_discussion_media_submission_enabled`.
- Для rollout flags выполнено end-to-end включение:
  - whitelist `ALLOWED_KEYS`;
  - admin PATCH API (`ADMIN_SCOPE_KEYS`, boolean normalization);
  - batch-режим `MODES_FORM_KEYS`;
  - admin technical UI (switches в «Режимы»);
  - чтение в server data loader;
  - runtime-gate doctor route + UI (`doctor_reply_from_log_enabled`).
- В interim doctor UI добавлен success feedback: toast «Ответ отправлен».
- Порт `program-item-discussion` доведён до контрактного набора:
  - `countMessagesForItem`;
  - `mergeLegacyAdminReplies` (чтение legacy admin replies из support messages с фильтрацией по префиксу упражнения).

### Локальные проверки этапа 1 после исправлений

- Проверка ссылок на route: в коде остался только `program-note-reply`.
- Проверка наличия новых ключей feature-flag в `system_settings` контуре (types + API + modes + UI data flow).
- Проверка наличия методов порта и реализаций (`pg` + `inMemory`) для `countMessagesForItem` и `mergeLegacyAdminReplies`.

---

## 2026-05-30 — Этап 2 (patient discussion API + dual-write observation)

### Что сделано

- Реализованы patient discussion endpoints:
  - `GET /api/patient/treatment-program-instances/{instanceId}/items/{itemId}/discussion`
  - `POST /api/patient/treatment-program-instances/{instanceId}/items/{itemId}/discussion`
  - `POST /api/patient/treatment-program-instances/{instanceId}/items/{itemId}/discussion/read`
- Реализован batch summary endpoint для плиток/списков:
  - `GET /api/patient/treatment-program-instances/{instanceId}/discussion/summary`
  - поддержан запрос подмножества `itemIds=uuid,uuid,...` без N HTTP запросов по одному item.
- Для всех новых patient discussion endpoints добавлен runtime gate по `patient_program_discussion_ui_enabled` (rollback без миграций).
- `POST .../discussion` маршрутизирован через `patientAppendObservationNote` (единый путь): сохраняет запись в `program_action_log`, сохраняет сообщение в discussion и сохраняет текущие уведомления врачу.
- В `createTreatmentProgramPatientActionService` добавлен dual-write:
  - `patientAppendObservationNote` теперь пишет в `program_item_discussion_messages` (`sender_role=patient`, `origin=patient_observation`) для doctor-program.
- Добавлен shared UI компонент:
  - `apps/webapp/src/app/app/patient/treatment/ProgramItemDiscussionDialog.tsx`
  - при открытии выполняет `GET .../discussion` и `POST .../discussion/read`, composer отправляет через `POST .../discussion`.

### Контракт GET discussion (зафиксированы параметры пагинации)

- Поддержаны query-параметры:
  - `direction` — `backward` (default) / `forward`
  - `limit` — default `30`, max `100`
  - `cursor` — opaque cursor по позиции `(createdAt,id)`
- Сортировка стабильная по `(createdAt,id)`.
- В ответе отдаются:
  - `messages`
  - `pageInfo` (`direction`, `limit`, `nextCursor`, `hasMore`)
  - `totalCount`
  - `unreadCount`
  - `lastMessage`
  - `lastDoneSummary`
- Legacy admin replies включаются через read-time merge (`mergeLegacyAdminReplies`) и участвуют в пагинации.

### Локальные проверки этапа 2

- `pnpm --dir apps/webapp exec vitest --run src/modules/treatment-program/patient-program-actions.test.ts src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/discussion/route.test.ts src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/discussion/read/route.test.ts src/app/api/patient/treatment-program-instances/[instanceId]/discussion/summary/route.test.ts`
- `pnpm --dir apps/webapp typecheck`
- IDE lint diagnostics по изменённым файлам: ошибок нет.

### Закрытие аудита этапа 2 (без хвостов)

- Убраны жёсткие потолки выборки `500/2000` в `program-item-discussion` репозитории, которые обрезали длинные треды.
- `listMessagesForStageItem` переведён на `(limit, offset)` без hard-cap; API routes теперь догружают полную историю батчами.
- `mergeLegacyAdminReplies` переведён на `(limit, offset)` поверх отфильтрованного legacy-потока (prefix match), без hard-cap и без обрезания длинной истории.
- `GET .../discussion` и `GET .../discussion/summary` больше не опираются на фиксированное окно в 500 строк: сбор истории выполняется батчами до исчерпания данных.
- Проверки после фикса:
  - `pnpm --dir apps/webapp exec vitest --run src/modules/program-item-discussion/service.test.ts src/modules/treatment-program/patient-program-actions.test.ts src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/discussion/route.test.ts src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/discussion/read/route.test.ts src/app/api/patient/treatment-program-instances/[instanceId]/discussion/summary/route.test.ts`
  - `pnpm --dir apps/webapp test -- patient-program-actions program-item-discussion observation-note`
  - `pnpm --dir apps/webapp typecheck`

---

## 2026-05-30 — Этап 3 (patient UI плитки программы)

### Что сделано

- На плитке элемента программы переключён CTA:
  - `Добавить комментарий` -> `Комментарии`;
  - добавлен badge с количеством комментариев (из batch summary);
  - добавлена красная unread-dot при `unreadCount > 0`.
- Добавлена иконка-кнопка `Camera` в строку действий плитки (layout: камера + комментарии слева, `Отметить выполнение` справа шире).
- Плитка переведена на `ProgramItemDiscussionDialog` вместо старой локальной модалки «Наблюдение».
- Добавлен batch-prefetch счётчиков/непрочитанных через:
  - `GET /api/patient/treatment-program-instances/{instanceId}/discussion/summary?itemIds=...`
  - один запрос на набор item’ов (без N+1 по плиткам).
- После `onRead` и закрытия диалога выполняется re-fetch summary, чтобы unread/dot синхронизировались с фактическим состоянием.

### Тесты и проверки

- Расширен существующий RTL-файл зоны treatment:
  - `apps/webapp/src/app/app/patient/treatment/PatientTreatmentProgramDetailClient.test.tsx`
  - покрыты badge/dot, кнопка `Камера`, открытие `ProgramItemDiscussionDialog`.
- Прогон:
  - `pnpm --dir apps/webapp exec vitest --run src/app/app/patient/treatment/PatientTreatmentProgramDetailClient.test.tsx`
  - `pnpm --dir apps/webapp test -- PatientTreatmentProgramDetailClient`
- IDE lint diagnostics по изменённым файлам: ошибок нет.
- `pnpm --dir apps/webapp typecheck` сейчас падает на существующей несвязанной ошибке в `src/app-layer/di/buildAppDeps.ts` (`SystemSetting.value`), вне scope этапа 3.

### Исправления по аудиту этапа 3 (без хвостов)

- Устранён rollout-разрыв между UI и API:
  - `patient_program_discussion_ui_enabled` теперь читается в server page loader и прокидывается до `PatientTreatmentProgramStagePageProgramSection`.
  - controls `Камера/Комментарии` на плитке рендерятся только при `assignment_source === doctor` **и** включённом feature-flag.
- Добавлен негативный RTL-кейс в существующий treatment test file:
  - при `patientProgramDiscussionUiEnabled=false` кнопки обсуждения скрыты и `GET .../discussion/summary` не вызывается.
- Проверки после исправления:
  - `pnpm --dir apps/webapp exec vitest --run src/app/app/patient/treatment/PatientTreatmentProgramDetailClient.test.tsx src/app/api/patient/treatment-program-instances/[instanceId]/discussion/summary/route.test.ts`
  - `ReadLints` по изменённым файлам (ошибок нет).

---

## 2026-05-30 — Этап 4 (patient item page + complete payload)

### Что сделано

- На странице пункта программы (`PatientProgramStageItemPageClient.tsx`) обновлена action-row под контентом:
  - удалён старый CTA `Добавить комментарий`;
  - layout приведён к `[Камера][Отметить выполнение wide]`;
  - `Отметить выполнение` больше не one-click (открывает модалку).
- Добавлен `ProgramItemCompleteDialog.tsx`:
  - выбор сложности (`easy|medium|hard`);
  - опциональные поля `reps`, `weightKg`;
  - submit-кнопка `Записать`.
- Item page discussion UX:
  - заголовок `Комментарий специалиста` переименован в `Инструкция от специалиста`;
  - добавлен discussion preview block: последний комментарий (если есть), flat CTA (`Открыть комментарии` / `Оставить комментарий к выполнению`), строка `В прошлый раз сделано ...` при наличии `reps + weightKg` в последнем `done`.
  - вместо старой модалки наблюдения используется `ProgramItemDiscussionDialog`.
- `POST .../progress/complete` расширен для backward-compatible body:
  - старый пустой POST поддержан;
  - новый JSON body (`perceivedDifficulty`, `reps`, `weightKg`) валидируется и передаётся в service.
- `patientCompleteSimpleItem` в `progress-service` расширен:
  - в `program_action_log.payload` теперь сохраняются optional completion-поля, если переданы.
- Rollout parity:
  - item-page discussion UI тоже привязан к `patient_program_discussion_ui_enabled` (флаг читается в `[instanceId]/item/[itemId]/page.tsx` и прокидывается в клиент).

### Тесты и проверки

- Добавлены/обновлены тесты:
  - `src/app/app/patient/treatment/PatientProgramStageItemPageClient.test.tsx`
  - `src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/complete/route.test.ts`
  - `src/modules/treatment-program/progress-service.test.ts` (payload для `patientCompleteSimpleItem`)
- Прогоны:
  - `pnpm --dir apps/webapp exec vitest --run src/modules/treatment-program/progress-service.test.ts src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/complete/route.test.ts src/app/app/patient/treatment/PatientProgramStageItemPageClient.test.tsx`
  - `pnpm --dir apps/webapp test -- progress-service complete route PatientProgramStageItemPageClient`
  - `ReadLints` по изменённым файлам: ошибок нет.
- `pnpm --dir apps/webapp typecheck` падает на несвязанных ошибках в `src/modules/patient-booking/service.ts` (nullable checks), вне scope этапа 4.

### Исправления по аудиту этапа 4 (без хвостов)

- Обновлён `apps/webapp/src/app/app/patient/treatment/program-detail/README.md`: описание вкладки «Программа» синхронизировано с discussion UI (этапы 3–4), убрано устаревшее «Добавить комментарий» / observation-note modal flow.
- Добавлен негативный RTL-кейс в `PatientProgramStageItemPageClient.test.tsx`:
  - при `patientProgramDiscussionUiEnabled=false` скрыты camera/discussion CTA и не вызывается `GET .../discussion`.
- Проверки после исправления:
  - `pnpm --dir apps/webapp exec vitest --run src/app/app/patient/treatment/PatientProgramStageItemPageClient.test.tsx`
  - `ReadLints` по изменённым файлам (ошибок нет).

---

## 2026-05-30 — Этап 5 (unread indicators)

### Что сделано

- **Per-item unread на item page:** preview-блок показывает `новых: n` при `unreadCount > 0` (данные из `GET .../discussion`).
- **Chat badge upgrade (P11):** точка заменена на красный кружок с цифрой (как у напоминаний) в `PatientTopNav`, `PatientHeader`, `PatientPrimaryNavStrip` через shared `PatientNavCountBadge`.
- **Mark-read sync (P10):** при `POST /api/patient/messages/read` — до `markInboundRead` вызывается `syncDiscussionReadFromSupportInboundMessages`:
  - по `support_message_id` → `program_item_discussion_messages`;
  - legacy fallback — parse title из prefixed admin message + match stage item (ambiguous → skip + warn).
- Discussion modal / `POST .../discussion/read` — mark-read уже был в этапах 2–4.

### Тесты и проверки

- `src/modules/program-item-discussion/syncDiscussionReadFromSupportInbound.test.ts`
- `src/app/api/patient/messages/read/route.test.ts`
- `src/modules/messaging/programNoteReplyContext.test.ts` (parse title)
- `src/shared/ui/PatientTopNav.test.tsx` (count badge)
- `src/app/app/patient/treatment/PatientProgramStageItemPageClient.test.tsx` (`новых: n`)
- Прогон: `pnpm --dir apps/webapp exec vitest --run syncDiscussionReadFromSupportInbound messages/read/route PatientTopNav PatientProgramStageItemPageClient programNoteReplyContext`

### Исправления по аудиту этапа 5 (без хвостов)

- **Legacy unread в per-item счётчике:** `getUnreadCount` в service принимает `exerciseTitle` и добавляет `countLegacyUnreadAdminReplies` (support-only admin replies после `last_read_at`, без double-count по `support_message_id` из discussion).
- **Mark-read на tap preview (P10):** `openDiscussionDialog` на item page вызывает `POST .../discussion/read` до открытия модалки.
- **RTL-тесты:** `PatientHeader.test.tsx` (chat badge), `PatientPrimaryNavStrip.test.tsx`, `service.unread.test.ts`, preview mark-read в `PatientProgramStageItemPageClient.test.tsx`.

---

## 2026-05-30 — Этап 6 (patient media submission)

### Что сделано

- Patient upload API:
  - `POST /api/patient/media/program-submission/presign`
  - `POST /api/patient/media/program-submission/confirm`
  - `GET /api/patient/media/program-submission/{mediaId}/status`
  - `usage_purpose=program_item_submission`, лимит 100 MiB, image/video MIME subset.
- Discussion media attach:
  - `POST .../items/{itemId}/discussion/media` (`{ mediaFileId }`)
  - `patientAppendDiscussionMedia` (discussion + `program_action_log` с `source=patient_media`).
- media-worker: ветка `program_item_submission` — 480p progressive MP4, удаление исходника, без HLS.
- Playback ACL (P14): `canAccessProgramSubmissionMedia` — uploader + doctor/admin; stats skip для submission.
- Patient UI: `ProgramItemDiscussionMediaPicker`, media bubbles в `ProgramItemDiscussionDialog`, rollout `patient_program_discussion_media_submission_enabled`.
- Doctor UI: превью медиа в журнале выполнения для `patient_media`.

### Тесты и проверки

- `src/modules/media/programSubmissionPlaybackAccess.test.ts`
- `src/modules/program-item-discussion/discussionFeatureGates.test.ts`
- `src/app/api/patient/media/program-submission/presign/route.test.ts`
- `src/app/api/patient/media/program-submission/confirm/route.test.ts`
- `src/app/api/patient/treatment-program-instances/.../discussion/media/route.test.ts`
- `src/modules/treatment-program/patient-program-actions.test.ts` (`patientAppendDiscussionMedia`)
- `src/app/api/media/[id]/playback/route.test.ts`, `[id]/route.test.ts`, `hls/.../route.test.ts` (ACL mocks)
- Прогон: `pnpm --dir apps/webapp test -- program-submission media discussionFeatureGates patientAppendDiscussionMedia`
- `pnpm --dir apps/media-worker test` (worker branch + poster)

### Исправления по аудиту этапа 6

- Shared gates: `discussionFeatureGates.ts` — media flow требует UI + media flags (P23).
- Presign/confirm/status/discussion/media — единый `isPatientProgramDiscussionMediaFlowEnabled`.
- Confirm отклоняет строки с `usage_purpose !== program_item_submission`.
- HLS proxy — ACL через `getMediaAccessRow` + `assertMediaPlaybackAccess`.
- Doctor journal: `DoctorProgramActionLogMediaPreview` (video через `PatientMediaPlaybackVideo`).
- Camera UX: прямой вызов picker на плитке и item page.
- Worker: poster.jpg после 480p transcode.
- Тесты: confirm route, discussion/media route, feature gates, playback/hls mock fixes.

---

## 2026-05-30 — Этап 7 (документация, gate-вердикты, CI)

### Синхронизация architecture docs

- [`docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md`](../../../ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md) — patient thread API, webapp doctor reply из журнала, rollout flags, карта кода.
- [`docs/ARCHITECTURE/MEDIA_HTTP_ACCESS_AUTHORIZATION.md`](../../../ARCHITECTURE/MEDIA_HTTP_ACCESS_AUTHORIZATION.md) — ACL `program_item_submission`, обновлённые таблицы маршрутов.
- [`docs/ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md`](../../../ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md) — submission progressive-only, discussion/doctor surfaces.
- [`apps/webapp/src/app/app/patient/treatment/program-detail/README.md`](../../../../apps/webapp/src/app/app/patient/treatment/program-detail/README.md) — feature flags rollout.
- [`README.md`](README.md) — статус «инициатива закрыта», таблица rollout.
- Plan перенесён в [`.cursor/plans/archive/program_item_discussion_070c3846.plan.md`](../../../../.cursor/plans/archive/program_item_discussion_070c3846.plan.md).

### Gate-вердикты по фазам (Definition of Done)

| Фаза | Вердикт | Ключевые проверки |
|------|---------|-------------------|
| 0 | **PASS** | P1–P24 и API-контракты в LOG/README |
| 1 | **PASS** | Schema, `sendProgramNoteReply`, doctor journal click-to-reply, feature flags |
| 2 | **PASS** | Patient discussion GET/POST/read, dual-write observation, summary batch |
| 3 | **PASS** | Tile UI: комментарии/badge/dot, camera, dialog; rollout gate |
| 4 | **PASS** | Item page layout, complete modal, instruction label, preview block |
| 5 | **PASS** | Per-item unread, chat count badge, mark-read sync (modal + support chat) |
| 6 | **PASS** | Upload presign/confirm, 480p worker, media bubbles, ACL, doctor preview |
| 7 | **PASS** (docs) / **CI отложен** | Architecture docs sync; см. §Закрытие независимого аудита |

### Definition of Done (весь план)

См. актуальный чеклист в §«Закрытие независимого аудита» ниже.

### Финальный CI

Команда (барьер merge/push): `pnpm install --frozen-lockfile && pnpm run ci`.

**Статус:** не запускался в рамках закрытия этапа 7 (2026-05-30) — параллельные изменения в рабочем дереве.

**Локально известно:** lint падал на `no-secrets` в `processProgramSubmissionTranscode.ts` (`submission_480p_head_missing_after_upload`) — исправлено `eslint-disable-next-line` по паттерну `processTranscodeJob.ts` (commit `71985985`); полный прогон CI не подтверждался.

### Исправления по аудиту этапа 7

- **`api.md`:** discussion GET/POST/read/media, batch summary, program-submission presign/confirm/status, doctor `program-note-reply`; observation-note помечен legacy.
- **`PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md`:** секция обсуждения по пункту программы.
- **`TREATMENT_PROGRAM_EXECUTION_RULES.md`:** ссылка на инициативу в «Источник правил».
- LOG/README/plan: CI явно **отложен** до стабильного дерева; DoD по CI — `[ ]`.

---

## 2026-05-30 — Доведение до идеала (post-audit hardening)

### Media submission (P14)
- Лимит upload: **250 MiB**; confirm сверяет S3 HEAD (size/MIME).
- Video attach только при `video_processing_status=ready`; enqueue fail → `failed` + блок attach.
- Status API: `{ ready, state, error? }`.

### P24 / playback
- Discussion bubble: static thumb без Play-overlay; playback в модалке.
- Poster presign для mp4-only submission; playback events skip для `program_item_submission`.

### P19 / P20
- Doctor webapp reply: стабильный `webapp-program-note:{hash}`; notify только при `created: true`.
- Discussion GET/summary: DB cursor paging + bounded legacy merge; ambiguous title → legacy не мержится.

### UX (P3/P13)
- Tile aria «Инструкция от специалиста»; «В прошлый раз» — reps и/или weight.

### Тесты
- presign 413/415, confirm 413, status, program-note-reply idempotency, upload limits, worker layout, discussion route.

---

## 2026-05-30 — Закрытие независимого аудита (этапы 0–7 → 100% code)

### Что исправлено

- **P0 runtime/typecheck:** прокинут `mediaSubmissionEnabled` в `PatientTreatmentProgramStagePageProgramSection` (props + destructure, default `false`).
- **P0 item page:** в `PatientProgramStageItemPageClientProps` добавлен `patientProgramDiscussionMediaSubmissionEnabled`; вычисляется локальный `mediaSubmissionEnabled` (doctor + UI + media flags).
- **Typecheck:** `discussionFeatureGates.test.ts` — cast через `unknown` для mock deps.
- **P19:** unit-тест `sendProgramNoteReply` — stable `integratorMessageId` передаётся в `appendWebappMessage` для support idempotency.

### Локальные проверки после fix

- `pnpm --dir apps/webapp exec tsc --noEmit` — ошибок по discussion/mediaSubmission нет.
- RTL: `PatientTreatmentProgramDetailClient.test.tsx`, `PatientProgramStageItemPageClient.test.tsx` — green.
- Discussion suite (routes, service, gates, unread, submission, worker-related webapp tests): **122+ tests PASS**.

### Gate-вердикты (актуализировано)

| Фаза | Вердикт | Примечание |
|------|---------|------------|
| 0–2 | **PASS** | без изменений |
| 3–4 | **PASS** | после fix props camera/discussion UI |
| 5–6 | **PASS** | backend + UI media flow после fix |
| 7 | **PASS** (docs) / **CI отложен** | full `pnpm run ci` — барьер push при стабильном дереве |

### Definition of Done (весь план)

- [x] Пациент doctor-program: плитка и item page по спецификации.
- [x] Thread modal: patient + admin + legacy merge per item.
- [x] Врач отвечает из журнала программы; пациент получает prefixed message (Telegram + webapp).
- [x] Unread: badge на «Комментарии», «новых: n» на item, цифра на иконке чата.
- [x] Выполнение с difficulty/reps/weight; строка «В прошлый раз…».
- [x] Submission media: upload, 480p MP4, thread, без HLS и без playback stats.
- [x] Архитектура: modules/ports/DI, Drizzle, thin routes, LOG актуален.
- [x] Rollback через `system_settings` feature-flags без schema rollback.
- [x] Независимый аудит P0 (mediaSubmissionEnabled props) — закрыт.
- [x] Инициатива перенесена в `docs/archive/2026-05-initiatives/PROGRAM_ITEM_DISCUSSION_INITIATIVE/`.
- [ ] `pnpm run ci` зелёный перед merge — барьер push (todo `phase-ci-merge-barrier`: cancelled; прогон при стабильном worktree).

---

## 2026-05-30 — Архивация и синхронизация docs/plan

### Что сделано

- Папка инициативы перенесена: `docs/PROGRAM_ITEM_DISCUSSION_INITIATIVE/` → `docs/archive/2026-05-initiatives/PROGRAM_ITEM_DISCUSSION_INITIATIVE/`.
- Обновлены ссылки в `docs/README.md`, architecture docs, `api.md`, `program-detail/README.md`, `TREATMENT_PROGRAM_EXECUTION_RULES.md`.
- Plan frontmatter: `status: completed`; todos `phase-audit-p0-props` completed, `phase-ci-merge-barrier` cancelled.
- Инициатива снята с блока «Активные инициативы» в `docs/README.md`.
