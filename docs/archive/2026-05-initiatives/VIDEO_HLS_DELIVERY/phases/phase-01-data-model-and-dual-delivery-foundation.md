# Phase 01 — Data model and dual-delivery foundation

**Цель:** заложить в БД и типах поля для HLS / статусов обработки / delivery **без изменения** текущего поведения MP4 и `GET /api/media/[id]`.

**Зачем:** без метаданных невозможны очередь, worker и выбор режима выдачи; additive schema минимизирует риск.

**Зависимости:** нет (первая техническая фаза после доков).

**Готовые инструменты:** PostgreSQL migrations (существующий стиль `apps/webapp/migrations/`).

---

## Изменения по слоям

### Backend (`apps/webapp`)

- Новая миграция(и): nullable колонки на `media_files` **или** отдельная таблица `media_video_derivatives` (выбрать один стиль; ниже — предпочтительно колонки на `media_files` для простоты запросов playback).

**Рекомендуемые поля (имена финализировать в PR):**

| Поле | Назначение |
|------|------------|
| `video_processing_status` | `none` / `pending` / `processing` / `ready` / `failed` (transcode) |
| `video_processing_error` | TEXT nullable, краткий код/сообщение |
| `video_source_s3_key` | optional denormalization; если всегда = `s3_key` для video, можно не вводить |
| `hls_master_playlist_s3_key` | ключ master `.m3u8` |
| `hls_variant_prefix` или только master | зависит от layout phase-03 |
| `poster_s3_key` | JPEG/WEBP превью |
| `video_duration_seconds` | INTEGER nullable |
| `available_qualities_json` | JSONB: `[{ renditionId, height, bandwidth }] ` |
| `video_delivery_override` | nullable enum text: `mp4` / `hls` / `auto` per file (опционально) |

- TypeScript: расширить `MediaRecord` / row types в `modules/media/types.ts` и репозитории **только чтение** для админки (опционально в этой фазе).

**Явно не делать:** менять `GET /api/media/[id]`; включать транскодинг.

### `apps/media-worker`

- Нет (только контракт полей в коде worker появится в фазе 02).

### Storage

- Нет новых объектов до транскодинга.

### Playback API

- Нет новых публичных endpoints (опционально заготовка internal read helper).

### Frontend

- Нет.

---

## Feature flags / fallback

- Флаги не обязательны в фазе 01; если добавляете ключи в `ALLOWED_KEYS` заранее — значения по умолчанию должны оставлять систему в режиме **MP4 only**.

---

## Риски и edge cases

- **Долгая миграция:** использовать `ADD COLUMN` nullable без DEFAULT тяжёлых выражений.
- **Существующие строки:** все новые поля NULL / `none` — интерпретация «как сейчас, MP4 only».
- Видео в `content_pages` с типом `url` (YouTube/external) **не** требуют этих полей.

---

## Тесты (при реализации)

- Миграция применяется на чистой и на существующей схеме (CI migrate).
- Unit: парсинг `available_qualities_json` если есть helper.
- Регрессия: существующие тесты `media` / `s3MediaStorage` проходят без изменений контракта URL.

---

## Критерии завершения

- [ ] Миграция в репозитории, откат = `DOWN` или новая миграция drop column (план отката описан в PR).
- [ ] Прод поведение MP4 идентично до включения последующих фаз.
- [ ] Документация `media.md` ссылается на новые поля кратко.

---

## Чек-лист реализации

- [ ] Спроектировать финальные имена колонок и enum статусов (согласовать с phase-03 keys).
- [ ] Написать SQL миграцию + при необходимости индекс по `video_processing_status` для backfill selection.
- [ ] Обновить TypeScript типы и SELECT в репозитории (если нужен admin list).
- [ ] Не трогать presign/redirect логику.

## Чек-лист код-ревью

- [ ] Нет breaking change для API.
- [ ] Нет тяжёлого backfill в той же миграции.
- [ ] Имена согласованы с `02-target-architecture.md`.

## Чек-лист тестов

- [ ] `pnpm test:webapp` зелёный.
- [ ] Проверены миграции up/down на dev DB.

## Чек-лист QA / ручная проверка

- [ ] Загрузить новое видео, открыть как раньше через `/api/media/uuid` — воспроизводится.

## Чек-лист rollout

- [ ] Деплой webapp с миграцией в окне низкой нагрузки.
- [ ] Проверить `SELECT COUNT(*)` до/после — без unexpected lock duration.

## Чек-лист rollback

- [ ] Если откат: задеплоить предыдущий билд **после** отката миграции (или оставить колонки unused — предпочтительно не drop в спешке).
- [ ] Зафиксировать в PR: nullable колонки безопасны для отката кода без отката БД.

**Следующая фаза:** [phase-02-transcoding-pipeline-and-worker.md](./phase-02-transcoding-pipeline-and-worker.md)
