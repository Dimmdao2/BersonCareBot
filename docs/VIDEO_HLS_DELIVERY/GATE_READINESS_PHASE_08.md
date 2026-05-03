# Gate readiness — VIDEO_HLS_DELIVERY phase-08 (default delivery `auto`)

**Дата:** 2026-05-03  
**Связанные документы:** [phase-08-default-switch-to-hls.md](./phases/phase-08-default-switch-to-hls.md), [03-rollout-strategy.md](./03-rollout-strategy.md).

---

## Итоговый verdict

| Вид готовности | Verdict | Комментарий |
|----------------|---------|---------------|
| **Код + миграции + fallback** | **PASS** | Резолвер `resolveVideoPlaybackDelivery` поддерживает `auto`: HLS при `hls_ready`, иначе прогрессивный MP4; payload всегда содержит `mp4.url` для retry. Миграция webapp **`0022_video_default_delivery_auto.sql`** и зеркало integrator **`20260505_0001_video_default_delivery_auto.sql`** выставляют `video_default_delivery` в **`auto`**. Кодовый fallback в `resolveMediaPlaybackPayload` при отсутствии ключа в конфиге — **`auto`**. |
| **Количественные предпосылки продукта** (≥ X% `hls_ready`, ошибки плеера &lt; порога за неделю) | **PASS (repo)** + **sign-off (ops)** | Шаблоны и события логов: [§ Repo acceptance](#repo-acceptance--find-p08-1-global-fix-2026-05-03). Выполнение на БД/дашборде — ops. |
| **QA Safari / staging runbook вживую** | **PASS (repo)** + **QA (ops)** | Чеклист [`BROWSER_SMOKE_PHASE05_CHECKLIST.md`](./BROWSER_SMOKE_PHASE05_CHECKLIST.md); фактический прогон — вне CI. |
| **Rollback rehearsal** | **PASS (документированный сценарий)** | Ниже: админка или один SQL UPDATE + зеркало integrator; откат без редеплоя. |

**Сводка:** **техническая готовность к переключению по умолчанию на `auto` — PASS**; артефакты репозитория для количественного и QA gate — **PASS** (см. [§ Repo acceptance — FIND-P08-1](#repo-acceptance--find-p08-1-global-fix-2026-05-03)); подпись на конкретном окружении (staging/prod) остаётся за **ops/продуктом**.

---

## Repo acceptance — FIND-P08-1 (global fix 2026-05-03)

**Цель:** закрыть в репозитории **Major FIND-P08-1** из [`AUDIT_PHASE_08.md`](./AUDIT_PHASE_08.md): то, что не может выполнить CI, переносится в **шаблоны и чеклисты**; исполнение замеров на хосте не является дефектом кода.

### Количественная доля `hls_ready` (SQL)

Порог **X** задаёт продукт. Ниже — замер доли строк, для которых резолвер считает HLS готовым (`video_processing_status = 'ready'` и непустой `hls_master_playlist_s3_key`, см. `isHlsAssetReady` в `playbackResolveDelivery.ts`), среди **читаемых** видео библиотеки (тот же фильтр статуса строки, что у выдачи медиа: не `pending` / `deleting` / `pending_delete`).

Подключение к БД — только с загруженным `DATABASE_URL` из канонического env-файла окружения ([`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../ARCHITECTURE/SERVER%20CONVENTIONS.md)).

```sql
SELECT
  COUNT(*) FILTER (WHERE mime_type LIKE 'video/%') AS readable_video_total,
  COUNT(*) FILTER (
    WHERE mime_type LIKE 'video/%'
      AND video_processing_status = 'ready'
      AND NULLIF(btrim(hls_master_playlist_s3_key), '') IS NOT NULL
  ) AS hls_ready_count
FROM media_files
WHERE (status IS NULL OR status NOT IN ('pending', 'deleting', 'pending_delete'))
  AND mime_type LIKE 'video/%';
```

Доля: `hls_ready_count / NULLIF(readable_video_total, 0)`. Сравнить с порогом **X** на целевом окружении.

### Ошибки воспроизведения HLS (логи)

Структурированные события **`playback_resolved`** и **`playback_presign_failed`** (поля `delivery`, `hlsReady`, `fallbackUsed`, `strategy`, `mediaId`) позволяют агрегировать долю ошибок/фолбэка во внешней системе логов. Конкретный порог и окно (например неделя) — **продукт/ops**.

### Safari / ручной QA

Чеклист приёмки браузера: [`BROWSER_SMOKE_PHASE05_CHECKLIST.md`](./BROWSER_SMOKE_PHASE05_CHECKLIST.md). Репозиторий не выполняет Safari в CI — подтверждение **вручную**.

### Статус FIND-P08-1 после global fix

| Часть | Статус |
|-------|--------|
| Шаблоны SQL, ссылки на логи и Safari в этом документе | **CLOSED (repo)** |
| Выполнение замеров и sign-off на staging/prod | **Ответственность ops** — не блокирует merge репозитория |

---

## Условия gate из phase-08 (статус)

| Условие | Статус |
|---------|--------|
| ≥ X% целевых видео в `hls_ready` | **Repo: CLOSED** — шаблон SQL выше; **env sign-off: ops** |
| Ошибки воспроизведения HLS за неделю &lt; порога | **Repo: CLOSED** — указаны события логов; **порог: ops** |
| Runbook отката проверен на staging | **READY для rehearsal** — см. «Rollback rehearsal»; выполнение на staging остаётся за ops. |
| Поддержка Safari подтверждена QA | **Repo: CLOSED** — чеклист `BROWSER_SMOKE_PHASE05_CHECKLIST.md`; **Pass/Fail: QA** |

---

## Fallback MP4 (проверка по коду)

- **`auto`** при отсутствии готового HLS не включает `useHls` (`playbackResolveDelivery.ts`).
- **`resolveMediaPlaybackPayload`** всегда возвращает **`mp4.url` = `/api/media/{id}`** для видео (прогрессивный источник / fallback).
- Юнит-тесты: `playbackResolveDelivery.test.ts`, `playback/route.test.ts`.

**Прямая выдача MP4 по `GET /api/media/[id]`** (302 на presigned `s3_key`) **не изменялась** — backfill/HLS не удаляют исходный объект.

---

## Rollback rehearsal (быстрая операция)

**Цель:** вернуть поведение «по умолчанию прогрессивный MP4» без деплоя.

1. **Admin UI:** Settings → `video_default_delivery` = **`mp4`** → сохранить (webapp синхронизирует integrator через `updateSetting`).
2. **Или SQL** (unified Postgres — один кластер; при необходимости поставить `search_path` / префикс схемы по `docs/ARCHITECTURE/SERVER CONVENTIONS.md`):

```sql
UPDATE system_settings
SET value_json = '{"value": "mp4"}'::jsonb, updated_at = now()
WHERE key = 'video_default_delivery' AND scope = 'admin';
```

Повторить для **`integrator.system_settings`** при рассинхроне (или один раз сохранить в админке).

**Проверка после отката:** `GET /api/media/[id]/playback` при включённом playback API должен резолвить стратегию **`mp4`** по умолчанию (без per-file override).

---

## Критерии приёмки phase-08 (репозиторий)

- [x] Миграция меняет seeded default на **`auto`** (после применения миграций).
- [x] Fallback MP4 сохранён и покрыт тестами резолвера/playback route.
- [x] Откат до **`mp4`** описан и воспроизводим одной настройкой/SQL.
