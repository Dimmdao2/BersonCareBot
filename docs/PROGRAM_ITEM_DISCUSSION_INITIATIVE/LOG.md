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
