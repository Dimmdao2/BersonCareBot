# Phase-08 audit — VIDEO_HLS_DELIVERY (default delivery `auto`)

**Дата:** 2026-05-03  
**Область:** `video_default_delivery` в `system_settings`, резолв playback (`resolveVideoPlaybackDelivery`, `resolveMediaPlaybackPayload`), миграции **`0022`**, документ [GATE_READINESS_PHASE_08.md](./GATE_READINESS_PHASE_08.md).

| # | Проверка | Вердикт |
|---|----------|---------|
| 1 | Gate: coverage / ошибки / Safari / runbook | **PASS (repo, global fix 2026-05-03)** — SQL-шаблон, логи, Safari-чеклист в [GATE_READINESS_PHASE_08.md](./GATE_READINESS_PHASE_08.md) § Repo acceptance; выполнение замеров/sign-off на окружении — **ops**. |
| 2 | Default switch не ломает старый контент | **PASS** — `auto` → MP4 без HLS; `mp4.url` в playback; `GET /api/media/[id]` вне default delivery. |
| 3 | Rollback к `mp4` быстрый и предсказуемый | **PASS** (оговорка) — admin + `invalidateConfigKey`; чистый SQL + до **60 с** кэш `getConfigValue`. |
| 4 | Наблюдаемость delivery ratio | **PARTIAL** — `playback_resolved` / `playback_presign_failed` достаточны для внешнего дашборда; готового UI в репо нет. |

---

## 1) Gate: coverage / ошибки / Safari / runbook

**Вердикт: PASS (репозиторий)** после [global fix](./AUDIT_GLOBAL.md) — шаблоны в [GATE_READINESS_PHASE_08.md](./GATE_READINESS_PHASE_08.md) § Repo acceptance (SQL, события логов, Safari-чеклист). Исполнение замеров и QA Pass/Fail на конкретной среде — **ops** (не дефект кода).

| Пункт phase-08 gate | Статус аудита |
|----------------------|----------------|
| ≥ X% целевых видео в `hls_ready` | **Repo: CLOSED** — SQL в [GATE_READINESS_PHASE_08.md](./GATE_READINESS_PHASE_08.md); замер на окружении — ops. |
| Ошибки воспроизведения HLS за неделю &lt; порога | **Repo: CLOSED** — события `playback_resolved` / `playback_presign_failed`; порог — ops. |
| Runbook отката проверен на staging | **Сценарий задокументирован**; репетиция на staging — ops. |
| Safari QA | **Repo: CLOSED** — чеклист `BROWSER_SMOKE_PHASE05_CHECKLIST.md`; Pass/Fail — QA. |

**Вывод:** репозиторные артефакты для gate **закрыты**; продуктовый sign-off по данным окружения остаётся за ops/QA и не блокирует merge.

---

## 2) Переключение default не ломает старый контент

**Вердикт: PASS**

- Стратегия **`auto`**: при отсутствии готового HLS (`video_processing_status` / master key не собираются в `isHlsAssetReady`) резолвер **не** выбирает HLS (`useHls = false`); выдаётся прогрессивный путь как для MP4.

```60:76:apps/webapp/src/modules/media/playbackResolveDelivery.ts
  if (strategy === "mp4") {
    useHls = false;
  } else if (strategy === "hls") {
    // ...
  } else {
    // auto
    if (hlsReady) {
      useHls = true;
    } else {
      useHls = false;
    }
  }
```

- **Payload:** для видео в ответе playback всегда присутствует **`mp4: { url: /api/media/{id} }`** — клиент может остаться на MP4 без HLS.
- **Прямой MP4:** `GET /api/media/[id]` (redirect на presigned `s3_key`) **не зависит** от `video_default_delivery`; легаси ссылки на `/api/media/{id}` продолжают работать при наличии объекта в S3.

**Риск (известный):** при **`strategy === hls`** и неготовом ассете включается **`fallbackUsed`**; при **`auto`** без HLS деградация без флага fallback — ожидаемо (не ошибка UI при корректном клиенте).

---

## 3) Rollback к `mp4`: быстро и предсказуемо

**Вердикт: PASS** (с оговоркой про кэш)

- **Админка:** сохранение настройки через API вызывает **`invalidateConfigKey`** — новое значение подхватывается без редеплоя ([`admin/settings/route.ts`](apps/webapp/src/app/api/admin/settings/route.ts), [`system-settings/service.ts`](apps/webapp/src/modules/system-settings/service.ts)).
- **Только SQL:** значение в БД меняется сразу; **`getConfigValue`** держит **TTL-кэш 60 с** на ключ ([`configAdapter.ts`](apps/webapp/src/modules/system-settings/configAdapter.ts)). До истечения TTL или очистки кэша процесс может отдавать прежнее значение **для этого инстанса webapp**.

**Операционная рекомендация:** предпочитать откат через **admin Settings**; при экстренном SQL — учитывать до **60 с** задержки на чтение или перезапуск воркеров процесса / ожидание TTL.

---

## 4) Наблюдаемость delivery ratio

**Вердикт: PARTIAL (логи достаточны для агрегации; готового dashboard в репо нет)**

- На каждый успешный резолв пишется **`playback_resolved`** с полями: `mediaId`, **`delivery`** (`hls` | `mp4`), `hlsReady`, **`fallbackUsed`**, **`strategy`**, `latencyMs` — этого достаточно для построения долей **hls vs mp4** и доли **fallback** в системах логирования (Datadog/Grafana/Loki и т.д.).

```136:146:apps/webapp/src/app-layer/media/resolveMediaPlaybackPayload.ts
  logger.info(
    {
      mediaId: id,
      delivery,
      hlsReady: resolved.hlsReady,
      fallbackUsed,
      strategy: resolved.strategy,
      latencyMs: Math.round(performance.now() - t0),
    },
    "playback_resolved",
  );
```

- Ошибки presign: **`playback_presign_failed`** с `presignTarget` (`hls_master` | `poster`).
- **Gap:** в репозитории **нет** встроенного экрана «dashboard ratio» (phase-08 observability bullet); операционный контроль предполагает **внешний** дашборд по логам или экспорт.

---

## Сводка findings

| ID | Серьёзность | Статус | Описание |
|----|-------------|--------|----------|
| FIND-P08-1 | Major (gate) | **CLOSED (repo, global fix 2026-05-03)** | Ранее: отсутствовали шаблоны в репозитории. **Исправление:** [GATE_READINESS_PHASE_08.md](./GATE_READINESS_PHASE_08.md) § Repo acceptance (SQL, логи, Safari). Подпись на staging/prod — не дефект кода; см. таблицу статуса в gate doc. |
| FIND-P08-2 | Minor | **INFO** | SQL-rollback без admin: до **60 с** возможна задержка из-за кэша `getConfigValue`. |
| FIND-P08-3 | Minor | **INFO** | Нет встроенного UI-dashboard ratio — только структурированные логи. |

---

## MANDATORY FIX INSTRUCTIONS

Дальнейшие изменения вокруг phase-08 и default delivery:

### MF-1 — Не ослаблять fallback MP4

- **Правило:** при изменении `resolveVideoPlaybackDelivery` / `resolveMediaPlaybackPayload` сохранять: для видео с источником в S3 всегда возвращать **`mp4.url`** в JSON playback; при неготовом HLS для **`auto`** не ломать клиентский progressive путь.
- **Проверка:** `playbackResolveDelivery.test.ts`, `playback/route.test.ts`; регрессия `GET /api/media/[id]`.

### MF-2 — Откат `video_default_delivery`

- **Правило:** документированный быстрый откат — **`mp4`** через admin Settings (инвалидация кэша); SQL только при аварии с пониманием **60 с** кэша или процедурой рестарта/ожидания.
- **Проверка:** после изменений в `configAdapter` TTL — обновить gate doc и этот аудит.

### MF-3 — Gate перед «строгим» `hls` как default

- **Правило:** не переводить дефолт на **`hls`** без отдельного gate (выше риск); **`auto`** остаётся безопасным дефолтом при неполном покрытии библиотеки.
- **Проверка:** ADR/phase doc + sign-off.

### MF-4 — Observability

- **Правило:** сохранять поля **`delivery`**, **`fallbackUsed`**, **`strategy`** в `playback_resolved`; при добавлении новых веток резолва — не удалять возможность агрегировать соотношение HLS/MP4 из логов.
- **Проверка:** smoke на появление полей в structured log; при внедрении dashboard — ссылка в runbook.

### MF-5 — Синхронизация `system_settings`

- **Правило:** изменения дефолта доставки через **admin webapp** предпочтительнее raw SQL для единого пути **`updateSetting`** → mirror integrator (см. правила репозитория).
- **Проверка:** при только-SQL операциях — проверить обе схемы в unified Postgres.

---

**Definition of Done (этот документ):** пункты 1–4 проверены с вердиктами; findings и MF зафиксированы для phase-09 и ops.
