# media

Медиафайлы: отдача по идентификатору и библиотека CMS.

## Возможности

- Загрузка в библиотеку (роль doctor/admin): **легаси** presigned single-PUT (`presign` → PUT → `confirm`) или **multipart** direct-to-S3 при поддержке клиентом и флаге `s3Multipart` из `GET /api/media/s3-status`. Клиент библиотеки после неуспешного multipart делает **best-effort** `POST /api/media/multipart/abort` (в т.ч. из `libraryMultipartUpload` при ошибке после `init`). Ошибки `part-url` / `complete`: отдельно `session_expired`, `session_state_conflict` и `session_not_found` (см. `api.md`).
- **UI врача:** основной поток — экран библиотеки (`/app/doctor/content/library`) для загрузки; в CMS и упражнениях выбор существующего файла через `GET /api/admin/media` (picker / диалог вставки в Markdown). Fallback `POST /api/media/upload` (multipart, ~до 50 МБ) остаётся для сервисных сценариев и тестов, не как основной путь из редактора Markdown.
- Получение медиа по id: `GET /api/media/{id}` (сессия, 302 на presigned GET в private-бакет).
- Листинг с фильтрацией/сортировкой и **папками**: `folderId`, `includeDescendants` в list API.
- **Иерархия папок** (`media_folders`): CRUD через admin API; в UI библиотеки — хлебные крошки и дочерние папки с действиями переименовать / переместить / удалить (пустая папка). Перемещение файла — `PATCH /api/admin/media/[id]` с `folderId`.
- Поиск использований в CMS (`content_pages`); hard-delete с подтверждением в UI.
- Канонические ссылки в контенте остаются **`/api/media/{uuid}`**; смена папки не меняет id.

## Лимиты и MIME

- Белый список MIME и максимальный размер — [`uploadAllowedMime.ts`](./uploadAllowedMime.ts) (в т.ч. **3 GiB** для allowed типов в БД и API).
- Константы multipart (размер части, TTL сессии, cap частей) — [`multipartConstants.ts`](./multipartConstants.ts).

## Порт / сервис

Сервис и порт (`ports.ts`, `service.ts`) инкапсулируют хранилище и операции над папками. Реализация может отдавать URL или поток (в т.ч. мок). Не зависит от интегратора; webapp владеет источниками медиа.

## Ops (кратко)

- Для multipart из браузера на MinIO в CORS private-бакета нужны методы **PUT, GET, HEAD**, заголовки **`Content-Type`**, **`x-amz-*`**, и обязательно **`ExposeHeader: ETag`** (иначе клиент не соберёт `parts` для `CompleteMultipartUpload`). Подробнее: `deploy/HOST_DEPLOY_README.md`.
- Истёкшие multipart-сессии: внутренний `POST /api/internal/media-multipart/cleanup` + cron; на стороне бакета рекомендуется lifecycle **`AbortIncompleteMultipartUpload`** (1–2 дня) как подстраховка.

См. также [`apps/webapp/src/app/api/api.md`](../../app/api/api.md) и `docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md`.

План поэтапного введения **HLS** параллельно с текущей MP4-выдачей (без простоя): `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/00-master-plan.md`.

### Колонки `media_files` для HLS (VIDEO_HLS_DELIVERY phase-01)

Добавлены nullable-поля под транскод и артефакты: `video_processing_status`, `video_processing_error`, `hls_master_playlist_s3_key`, `hls_artifact_prefix`, `poster_s3_key`, `video_duration_seconds`, `available_qualities_json`, `video_delivery_override`. До включения pipeline они **NULL**; поведение `GET /api/media/{id}` не меняется. Типы полей в ответах листинга/детали см. `modules/media/types.ts`.
