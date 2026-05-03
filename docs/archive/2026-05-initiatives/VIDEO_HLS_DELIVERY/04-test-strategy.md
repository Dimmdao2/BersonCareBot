# Test strategy — HLS dual delivery

**Связь:** [00-master-plan.md](./00-master-plan.md) · фазы: [phases/](./phases/)

---

## 1. Цели

- Гарантировать **неизменность** MP4-пути при регрессиях.
- Проверить **контракт** playback API и **ветвление** delivery.
- Покрыть **отказы** транскодинга и **fallback**.
- Избежать обязательной зависимости CI от тяжёлого FFmpeg там, где достаточно моков.

---

## 2. Уровни тестов

### 2.1 Unit (webapp)

| Область | Что тестировать |
|---------|-----------------|
| Delivery resolver | `mp4` / `hls` / `auto` при комбинациях `hls_ready`, флагов, mime |
| Presign wrapper | не вызывать при unauthorized; TTL из настроек (фаза 09) |
| Job enqueue | после `confirm` создаётся ровно одна строка job при идемпотентности |
| Mapping S3 keys | префиксы, master vs segments |

Моки: S3 client, `system_settings` reader.

### 2.2 Unit (media-worker)

| Область | Что тестировать |
|---------|-----------------|
| Job state machine | pending → processing → done/failed |
| FFmpeg invocation | аргументы собираются корректно (snapshot тест строки или массива args) |
| Retry policy | backoff, max attempts |

**FFmpeg в CI:** опционально `ffmpeg -version` в job matrix; иначе полностью мок `spawn`.

### 2.3 Integration (webapp)

- API route tests (как существующие `route.test.ts`): playback JSON 401 без сессии, 404 неизвестный id, 200 MP4-only до готовности HLS.
- Репозиторий + реальная PG test container (если уже принят в проекте) для миграций колонок.

### 2.4 Integration (worker + DB)

- Поднять test DB, вставить `media_files` + job, прогнать worker handler с моком FFmpeg, проверить обновление статуса.

### 2.5 E2E / сценарные (по необходимости)

- Playwright: открыть страницу с тестовым контентом, дождаться `loadeddata` (MP4 и HLS).
- Может быть ограничено staging из-за отсутствия FFmpeg в CI.

---

## 3. Негативные сценарии (обязательный перечень)

- Транскод **failed** → playback возвращает MP4 при `auto`.
- Частично залитые артефакты (worker упал mid-upload) → статус `failed`, не отдавать HLS.
- Истёкший presigned URL (фаза 09) → клиент запрашивает playback снова; документировать UX.
- Не-видео mime в enqueue → reject job.
- Огромный файл → политика отказа до enqueue (лимит отдельный от upload лимита или тот же).

---

## 4. Регрессия существующих путей

- `GET /api/media/[id]` — тесты редиректа и 401 (уже есть паттерны) не ломать.
- Multipart upload, purge delete — без изменений поведения при фазе 01.

---

## 5. Контрактные тесты API

- Зафиксировать JSON schema или TypeScript type + тест «лишние поля допустимы, обязательные присутствуют».
- Версионирование: при breaking change добавить `v2` или поле `contractVersion` (минимально).

---

## 6. Производительность и нагрузка (вне CI по умолчанию)

- Ручной прогон: N параллельных просмотров HLS с одного аккаунта (допустимая политика).
- Worker: 1 concurrent job на старте — зафиксировать в phase-02 runbook.

---

## 7. Чек-лист «готовности тестового контура»

- [ ] Моки S3 покрывают presign GET для `.m3u8` и `.ts`.
- [ ] Тесты delivery resolver покрывают ≥90% веток.
- [ ] Есть минимум один интеграционный тест «happy path» MP4 без HLS (регрессия).
- [ ] После фазы 05 — тест компонента выбора hls.js vs native (jest + mock `MediaSource` или e2e).

---

## 8. Связь с phase-документами

В каждом `phase-0X-*.md` раздел **Тесты** уточняет конкретные файлы и кейсы для этой фазы.
