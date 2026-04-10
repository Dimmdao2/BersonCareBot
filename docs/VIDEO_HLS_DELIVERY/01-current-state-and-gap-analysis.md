# Current state and gap analysis — video / HLS initiative

Отдельный документ аудита: как устроено сейчас, что есть, чего нет, точки встраивания, tight coupling, риски.

**Связь:** [00-master-plan.md](./00-master-plan.md) · целевая схема: [02-target-architecture.md](./02-target-architecture.md)

---

## 1. Как сейчас устроена выдача видео

### 1.1 Контент CMS (источник ссылки на видео)

- Таблица **`content_pages`** (webapp DB): поля **`video_url`**, **`video_type`**.
- Типы: `url` (внешний или прямой URL), `youtube`, **`api`** (внутренний медиа-id или путь `/api/media/{uuid}`).
- Резолвер каталога: `apps/webapp/src/modules/content-catalog/service.ts` — для DB-страниц собирает `ContentVideoSource` (`url` | `api`).
- Пациентский просмотр: `apps/webapp/src/app/app/patient/content/[slug]/page.tsx` — для `api` нормализует URL до `/api/media/{id}`; рендер: `<video><source src=…>` или YouTube iframe.
- Редактор/превью врача: `ContentPreview.tsx`, библиотека: `MediaLibraryClient.tsx`, `MediaLightbox.tsx`, `VideoThumbnailPreview.tsx` — тот же паттерн `<video>` + URL.

### 1.2 Хранение файлов и доступ

- Таблица **`media_files`**: `id`, `original_name`, `stored_path`, `s3_key`, `mime_type`, `size_bytes`, `status`, `uploaded_by`, `folder_id`, multipart-сессии (см. миграции `028`, `044`, `067` и др.).
- Реализация хранилища: `apps/webapp/src/infra/repos/s3MediaStorage.ts`, S3-клиент: `apps/webapp/src/infra/s3/client.ts`.
- **Канонический URL в продукте:** `/api/media/{uuid}` (см. `apps/webapp/src/modules/media/media.md`).
- **Выдача:** `GET /api/media/[id]/route.ts`:
  - требуется **сессия** (любая роль для чтения по текущим правилам);
  - при наличии `s3_key` в БД → **302** на **presigned GET** в **private** бакет;
  - **не** проксирует байты через Next.js.
- Загрузка: presign + PUT + confirm, multipart direct-to-S3, или legacy upload form — см. `apps/webapp/src/app/api/api.md`.

### 1.3 Документация и ops (подтверждённые факты)

- Приватное медиа и purge: `docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md`.
- Прод-сервисы: `docs/ARCHITECTURE/SERVER CONVENTIONS.md` — `bersoncarebot-webapp-prod`, `bersoncarebot-api-prod`, `bersoncarebot-worker-prod` (последний — **integrator** projection worker, не медиа).

---

## 2. Сущности и модели (что уже есть)

| Область | Есть | Нет |
|---------|------|-----|
| Медиа-запись в БД | `media_files` с S3 key, статусами жизненного цикла загрузки/удаления | Поля HLS (master playlist key, renditions, `processing_status` transcoding) |
| Видео как контент | `content_pages.video_*` | Связь «страница → delivery mode» (сейчас неявно всегда через URL) |
| Плеер в UI | `NoContextMenuVideo`, нативный MP4 | hls.js, выбор по `application/vnd.apple.mpegurl` |
| API плейбэка | Фактически **один** маршрут `GET /api/media/[id]` | Отдельный «playback info» JSON endpoint |
| Очередь задач (webapp) | Internal HTTP jobs (purge, multipart cleanup) | Очередь транскодинга |
| Worker CPU-heavy (webapp) | Нет | Нет |
| Integrator worker | `projection_outbox`, ретраи | Не подходит для смешивания с FFmpeg pipeline |

---

## 3. Storage abstraction

- Есть порт **`MediaStoragePort`** (`apps/webapp/src/modules/media/ports.ts`) и реализации S3 / mock — **абстракция загрузки и метаданных** хорошая.
- **Нет** отдельного абстрактного слоя «VideoDelivery» (MP4 vs HLS bundle) — его предстоит ввести на уровне домена/playback (фазы 01 + 04).

---

## 4. Worker / queue infrastructure (релевантное)

- **Webapp:** фоновая обработка реализована как **вызываемые по HTTP** internal routes с `INTERNAL_JOB_SECRET` — подходит для **лёгких** батчей, **не** для FFmpeg.
- **Integrator:** `bersoncarebot-worker-prod` — домен проекций; **не использовать** для транскодинга медиа webapp (разные границы отказа, другое назначение).
- **Вывод:** для HLS нужен **новый** процесс **`apps/media-worker`** и **новая** очередь (минимум — PostgreSQL в webapp DB).

---

## 5. Playback endpoint (текущий)

- Единственный пользовательский путь чтения файла по id: **`GET /api/media/[id]`** (redirect).
- Для HLS нужны **множественные** объекты (`.m3u8`, `.ts`/`.m4s`); каждый может обслуживаться тем же механизмом **presigned URL**, но клиенту нужен **стартовый master URL** и политика TTL/подписи (фазы 04 и 09).

---

## 6. Player abstraction

- Переиспользуемый компонент: **`NoContextMenuVideo`** — тонкая обёртка над `<video>`.
- **Нет** общего `VideoPlayer` с ветвлением MP4/HLS/error — появится в фазе 05 (минимально инвазивно: обёртка или хук + условный рендер).

---

## 7. Где встраивать новую логику (рекомендуемые точки)

| Слой | Путь / модуль | Зачем |
|------|----------------|-------|
| БД | `apps/webapp/migrations/*.sql` | Новые колонки `media_files`, опционально таблица `media_transcode_jobs` |
| Домен медиа | `apps/webapp/src/modules/media/*` | Типы, сервис enqueue после upload, чтение статуса |
| S3 | `apps/webapp/src/infra/s3/client.ts`, префиксы в phase-03 | Загрузка сегментов, presign |
| API | `apps/webapp/src/app/api/...` | Playback JSON, опционально `GET /api/media/[id]` расширить только если нужно (предпочтительно **новый** route) |
| Каталог контента | `content-catalog/service.ts` + patient page | Потребляет playback contract вместо сырого `/api/media/id` (постепенно) |
| UI | patient `content/[slug]`, doctor preview, lightbox | Dual-mode player |
| Новый пакет | `apps/media-worker` | FFmpeg, poll queue, update DB |
| Флаги | `system_settings`, `ALLOWED_KEYS` | `video_delivery_strategy`, `video_hls_new_uploads_enabled`, и т.д. (точные имена — при реализации) |

---

## 8. Чего не хватает (gap)

1. **Метаданные транскодинга** в БД (статус, ключ master playlist, длительность, список качеств, постер).
2. **Очередь заданий** и **воркер** с FFmpeg.
3. **Соглашение о ключах S3** для дерева HLS рядом с source MP4.
4. **Playback resolution API** (JSON) и политика `mp4` / `hls` / `auto`.
5. **Клиентская поддержка HLS** (hls.js + Safari).
6. **Feature flags** в DB для поэтапного включения.
7. **Наблюдаемость**: метрики/логи очереди, `ffmpeg` exit code, длительность job (запланировать в фазе 02/04).
8. **Деплой:** unit systemd для `media-worker`, зависимость **ffmpeg** в пакетах хоста — сейчас **не описаны** в SERVER CONVENTIONS (добавить при внедрении).

---

## 9. Tight coupling и риски

- **Жёсткая привязка UX к `/api/media/{id}`** как единственному виду ссылки для внутреннего видео — при HLS нужен либо тот же id с другим контрактом плейбэка, либо явный playback endpoint; иначе клиент не узнает про master playlist.
- **Один redirect на один объект** — для HLS много объектов; нельзя «прикрутить HLS» одним маршрутом без контракта для сегментов (presigned на каждый или cookie-based origin — вне scope минимального плана; по умолчанию — **presigned на каждый объект** с кэшированием на клиенте).
- Смешение **integrator worker** и медиа — **анти-паттерн** (разный смысл очереди, риск блокировки проекций).

---

## 10. Соответствие ожиданиям заказчика (чек)

| Ожидание | Статус в репозитории |
|----------|---------------------|
| FFmpeg + S3 + API + player | Соответствует плану; FFmpeg и worker — новые |
| Не отдельный video microservice | Соответствует — `apps/media-worker` в монорепо |
| Не проксировать видео через backend | Уже так для MP4; HLS — сохранить |
| `apps/api` (Fastify) | **Нет** отдельного приложения; эквивалент — **webapp API routes** |
| Существующая очередь для медиа | **Нет** — gap, предлагается PG-queue |

---

## 11. Следующий документ для чтения

[02-target-architecture.md](./02-target-architecture.md) — как закрывают gaps фазы 01–05 без нарушения ограничений.
