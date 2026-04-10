# Phase 09 — Signed URLs, TTL, and private access

**Цель:** усилить «умеренную» защиту: **короткий TTL** presigned URL, отсутствие долгоживущих публичных ссылок, явная проверка доступа на стороне API перед каждой выдачей playback.

**Зависимости:** [phase-04](./phase-04-playback-api-and-delivery-strategy.md), желательно стабильный [phase-08](./phase-08-default-switch-to-hls.md).

**Готовые инструменты:** S3 presign GET (уже есть); настройка TTL через параметры SDK.

**Не делаем:** DRM, device binding.

---

## Поведение

- Playback API генерирует presigned URL с `expiresIn` из `system_settings` (например `video_presign_ttl_seconds`) — ключ в `ALLOWED_KEYS`.
- Клиент при истечении TTL **перезапрашивает** playback JSON (естественно для VOD при длинном просмотре — выбрать TTL ≥ типичной сессии или реализовать refresh до expiry).
- MP4 path: либо оставить redirect `/api/media/id` (короткий second hop), либо тоже presigned в JSON для единообразия.

---

## Где проверяется доступ

- Только на **webapp** при `GET .../playback` и при существующем `GET /api/media/id` (уже session).
- S3 остаётся private; без IAM user per viewer.

---

## Кеширование и риски

- **CDN:** если позже включится, signed URL может кэшироваться нежелательно — использовать короткий TTL или отключить cache для signed (ops).
- **Браузер:** `Cache-Control` на redirect уже `private` — сохранить.
- **Логи:** не писать полный URL.

---

## Private access

- Убедиться, что bucket policy не даёт `s3:GetObject` без signature.
- Периодически аудит публичных ACL (вне кода).

---

## Изменения

### `apps/webapp`

- Параметризовать `presignGetUrl` TTL.
- Расширить admin settings UI для TTL (если user-facing).

### `apps/media-worker`

- Обычно без изменений; presign только на read path.

---

## Тесты

- Unit: TTL берётся из settings mock.
- Проверка: истёкший URL отклоняется S3 (manual или integration с minio time skew — сложно; manual OK).

---

## Чек-листы

**Реализация:** settings key; presign wrapper; документация в api.md.  
**Ревью:** нет секретов в клиенте кроме временных URL.  
**QA:** длинный просмотр — обновление playback.  
**Rollout:** начать с умеренного TTL (например 1h).  
**Rollback:** увеличить TTL или вернуть hardcoded default.

**Следующая фаза:** [phase-10-watermark-and-further-hardening.md](./phase-10-watermark-and-further-hardening.md)
