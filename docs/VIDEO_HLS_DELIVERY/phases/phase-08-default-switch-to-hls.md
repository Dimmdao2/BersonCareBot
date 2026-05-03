# Phase 08 — Default switch to HLS

**Цель:** при достаточном покрытии библиотеки переключить **`video_default_delivery`** на `auto` или `hls` с **надёжным fallback** на MP4.

**Зависимости:** [phase-07](./phase-07-backfill-legacy-library.md) или явное решение «достаточно новых-only»; стабильные [phase-04](./phase-04-playback-api-and-delivery-strategy.md) и [phase-05](./phase-05-player-integration-and-dual-mode-frontend.md).

---

## Условия готовности (gate)

**Вердикт и детали:** [GATE_READINESS_PHASE_08.md](../GATE_READINESS_PHASE_08.md).

- [ ] ≥ X% целевых видео в `hls_ready` (X согласовать с продуктом) — **ops / prod**.
- [ ] Ошибки воспроизведения HLS за неделю < порога (логи/metrics) — **ops**.
- [ ] Runbook отката проверен на staging — **ops** (сценарий задокументирован в gate doc).
- [ ] Поддержка Safari подтверждена QA — **manual QA**.

---

## Постепенный rollout

1. **Реализовано в репозитории:** после `drizzle-kit migrate` / применения SQL значение **`video_default_delivery`** в `system_settings` становится **`auto`** (миграции **`0022`** webapp + **`20260505_0001`** integrator). Дополнительно менять в админке не требуется для базового переключения.
2. Опционально: стратегия **`hls`** strict — позже и только по решению продукта; сейчас выбран **`auto`**.
3. Canary по роли / `?prefer=` для admin остаётся доступен без изменений.

---

## Fallback

- Resolver **всегда** возвращает `mp4` URL в структуре ответа при наличии source для player retry.
- Если MP4 удалён политикой retention — отдельное решение (не делать до явного ТЗ).

---

## Observability

- Dashboard: `playback delivery=hls vs mp4 vs fallback` ratio.

---

## Риски

- Старый контент без HLS — `auto` обязан деградировать без ошибок UI.

---

## Тесты

- Нагрузочный smoke: K одновременных воспроизведений (manual).

---

## Критерии завершения

- [x] `video_default_delivery=auto` включён в кодовой базе: миграция **`0022_video_default_delivery_auto.sql`** (webapp) + зеркало integrator **`20260505_0001_video_default_delivery_auto.sql`**; fallback MP4 подтверждён тестами и gate doc.
- [ ] Доля fallback на MP4 контролируемая (метрики `playback_resolved` / продукт) — **ongoing ops**.
- [x] Rollback до `video_default_delivery=mp4` документирован ([GATE_READINESS_PHASE_08.md](../GATE_READINESS_PHASE_08.md)); выполнение rehearsal на staging — **ops**.

---

## Чек-листы

**Реализация:** миграция default + мониторинг `playback_resolved`.  
**Ревью:** fallback ветки.  
**QA:** регрессия всех типов `video_type`.  
**Rollout:** деплой + миграции БД; затем наблюдение 24–48h; при необходимости откат — см. [GATE_READINESS_PHASE_08.md](../GATE_READINESS_PHASE_08.md).  
**Rollback:** `video_default_delivery=mp4` немедленно (админка или SQL).

**Следующая фаза:** [phase-09-signed-urls-ttl-and-private-access.md](./phase-09-signed-urls-ttl-and-private-access.md)
