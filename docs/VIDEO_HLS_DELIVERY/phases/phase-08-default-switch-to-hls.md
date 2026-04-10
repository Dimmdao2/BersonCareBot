# Phase 08 — Default switch to HLS

**Цель:** при достаточном покрытии библиотеки переключить **`video_default_delivery`** на `auto` или `hls` с **надёжным fallback** на MP4.

**Зависимости:** [phase-07](./phase-07-backfill-legacy-library.md) или явное решение «достаточно новых-only»; стабильные [phase-04](./phase-04-playback-api-and-delivery-strategy.md) и [phase-05](./phase-05-player-integration-and-dual-mode-frontend.md).

---

## Условия готовности (gate)

- [ ] ≥ X% целевых видео в `hls_ready` (X согласовать с продуктом).
- [ ] Ошибки воспроизведения HLS за неделю < порога (логи/metrics).
- [ ] Runbook отката проверен на staging.
- [ ] Поддержка Safari подтверждена QA.

---

## Постепенный rollout

1. `auto` для internal staff (через override query или роль) — optional.
2. `auto` в production для всех: HLS если ready.
3. `hls` strict (без MP4 preference) — **опционально и позже**; риск выше.

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

## Чек-листы

**Реализация:** только смена default в settings + мониторинг.  
**Ревью:** fallback ветки.  
**QA:** регрессия всех типов `video_type`.  
**Rollout:** изменить setting в админке; наблюдать 24–48h.  
**Rollback:** `video_default_delivery=mp4` немедленно.

**Следующая фаза:** [phase-09-signed-urls-ttl-and-private-access.md](./phase-09-signed-urls-ttl-and-private-access.md)
