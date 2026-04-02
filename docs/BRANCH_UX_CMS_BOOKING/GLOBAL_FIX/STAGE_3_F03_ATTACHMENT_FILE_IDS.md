# Stage 3: F-03 - attachmentFileIds по прод-контракту

Цель этапа: привести обработку `attachmentFileIds` к фактическому контракту (`media_files.id`) и сделать полный e2e путь до врача.

## S3.T01 - Зафиксировать контракт attachmentFileIds

**Цель:** исключить двусмысленность в API и docs.

**Файлы:**

- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/API_CONTRACT_ONLINE_INTAKE_V1.md`
- `apps/webapp/src/modules/online-intake/types.ts`
- `apps/webapp/src/app/api/patient/online-intake/lfk/route.ts`

**Шаги:**

1. Явно зафиксировать: `attachmentFileIds[]` содержит `media_files.id`.
2. Прописать ограничения: ownership, status, max count.
3. Прописать mixed payload (URL + file) как поддерживаемый сценарий.

**Тесты:**

- [x] request schema validates attachmentFileIds as ids.

**Критерии готовности:**

- контракт и route validation совпадают.

---

## S3.T02 - Resolver `media_files.id -> s3_key`

**Цель:** безопасно резолвить file-id в данные для `online_intake_attachments`.

**Файлы:**

- `apps/webapp/src/infra/repos/pgOnlineIntake.ts`
- `apps/webapp/src/infra/repos/*media*`
- `apps/webapp/src/modules/online-intake/*`

**Шаги:**

1. Добавить резолвер по `media_files.id`.
2. Проверять ownership текущего пациента.
3. Проверять статус/доступность файла.
4. Маппить в `online_intake_attachments` с `attachment_type='file'`, `s3_key`.

**Тесты:**

- [x] file belongs to patient -> persisted.
- [x] чужой file id -> 403/validation error.
- [x] неактивный/удаленный файл -> reject.

**Критерии готовности:**

- все file-id корректно трансформируются в attachment rows.

---

## S3.T03 - Mixed URL+file persistence

**Цель:** поддержать одновременно URL и file attachments.

**Файлы:**

- `apps/webapp/src/app/api/patient/online-intake/lfk/route.ts`
- `apps/webapp/src/infra/repos/pgOnlineIntake.ts`
- `apps/webapp/src/modules/online-intake/service.ts`

**Шаги:**

1. Реализовать единый ingestion массивов URL и file-id.
2. Исключить дубли внутри одной заявки.
3. Сохранить корректный порядок/тип в БД.

**Тесты:**

- [x] mixed payload persists both types.
- [x] duplicates are rejected or normalized по контракту.

**Критерии готовности:**

- mixed payload стабильно проходит API -> DB.

---

## S3.T04 - Видимость вложений у врача

**Цель:** доктор видит и URL, и file-attachments в деталях заявки.

**Файлы:**

- `apps/webapp/src/app/api/doctor/online-intake/[id]/route.ts`
- `apps/webapp/src/app/app/doctor/online-intake/*`

**Шаги:**

1. Убедиться, что details API отдает unified attachments model.
2. Отобразить file/url элементы в doctor UI.
3. Проверить права доступа на чтение.

**Тесты:**

- [x] doctor details includes mixed attachments.
- [x] patient cannot read foreign request attachments.

**Критерии готовности:**

- врач видит вложения без ручных DB-проверок.

---

## S3.T05 - Финальная проверка этапа

**Шаги:**

1. e2e: create intake с URL+file.
2. doctor opens request and sees both.
3. Прогон `pnpm run ci`.
4. Запись evidence в `AGENT_EXECUTION_LOG.md`.

---

## Audit Gate Stage 3 (обязательный)

`PASS` только если:

1. `attachmentFileIds` трактуются как `media_files.id`;
2. сервер резолвит `s3_key` и валидирует ownership/status;
3. mixed URL+file проходит e2e;
4. данные видны врачу в UI/details API.
