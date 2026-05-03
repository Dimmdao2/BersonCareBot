# Phase 10 — Watermark and further hardening

**Цель:** опциональный **видимый watermark** (overlay user id / email / session token prefix) для дополнительного усложнения несанкционированного распространения; без DRM.

**Зависимости:** стабильный pipeline [phase-02](./phase-02-transcoding-pipeline-and-worker.md); желательно после [phase-08](./phase-08-default-switch-to-hls.md).

**Готовые инструменты:** FFmpeg `drawtext` или `overlay` filter.

**Не делаем:** per-user уникальный transcoding для каждого запроса на старте (слишком дорого); A/B forensic watermarking.

---

## Когда уместно

- Только для контента с флагом «чувствительное» или глобальный флаг `video_watermark_enabled` для определённых разделов.
- Отдельная очередь или job type `transcode_watermarked` — чтобы не замедлять основной поток.

---

## Реалистичный watermark

- Статичный или полупрозрачный текст в углу: `userId` + дата (из контекста job, переданного из webapp при постановке **отдельного** job после playback request — тяжело; проще: watermark при transcode с **platform user id владельца контента** или без PII — только `internal ref`).

**Ограничение:** при офлайн transcode до просмотра **нет** email пользователя-пациента без передачи PII в worker — согласовать с legal/продуктом. Безопасный вариант: watermark slug страницы / media id (малоценно) или отказаться от PII.

---

## Где реализуется

- Только **`apps/media-worker`** в FFmpeg graph (дополнительный pass или filter_complex).
- Не в браузере (легко снять в DevTools для canvas overlay — браузерный watermark слабее).

---

## Влияние на производительность

- CPU +20–50% в зависимости от разрешения; увеличить timeout job.

---

## Optional future steps (вне обязательного scope)

- Session-scoped **edge-signed** URLs через CDN.
- Ограничение числа одновременных playback per user (rate limit) — `system_settings` + middleware.

---

## Тесты

- Snapshot длительности ffmpeg args при включённом watermark.
- Visual smoke test один кадр (optional).

---

## Критерии завершения

- [ ] Watermark включается только по явному флагу/политике и не затрагивает базовый pipeline без флага.
- [ ] Зафиксирована и согласована политика PII для watermark (или явно выбран вариант без PII).
- [ ] Рост времени/стоимости транскодинга измерен и признан приемлемым для выбранного scope.

---

## Чек-листы

**Реализация:** флаг контента или global; filter в worker; документировать PII policy.  
**Ревью:** GDPR / хранение данных.  
**QA:** читаемость watermark, артефакты сжатия.  
**Rollout:** только для тестового раздела.  
**Rollback:** выключить флаг, новые jobs без watermark.

---

**Пакет документации:** [00-master-plan.md](../00-master-plan.md)
