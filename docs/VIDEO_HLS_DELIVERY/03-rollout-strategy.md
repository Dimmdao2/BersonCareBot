# Rollout strategy — HLS dual delivery

Поэтапная выкатка без простоя, с флагами и откатом.

**Связь:** [00-master-plan.md](./00-master-plan.md) · риски: [05-risk-register.md](./05-risk-register.md)

---

## 1. Принципы

1. **Каждый merge** оставляет прод в рабочем состоянии для текущих пользователей MP4.
2. **Флаги в `system_settings` (admin)** — источник истины для поведения delivery (см. правила репозитория: не env для интеграционных/продуктовых переключателей).
3. **Сначала dark launch:** инфраструктура + worker на staging / prod с флагом «выкл» для пользователей.
4. **Canary:** включение HLS для подмножества (например только `content_pages` с меткой, или только новые `media_files` после даты, или internal test slug).

---

## 2. Окружения

| Этап | Где проверять |
|------|----------------|
| Локально | docker-compose / dev DB + MinIO; worker в отдельном терминале |
| CI | unit/integration без реального FFmpeg (мок subprocess) + опциональный job с FFmpeg в будущем |
| Staging | полный цикл upload → transcode → playback |
| Production | флаги выкл → поэтапное включение |

---

## 3. Фазы выкатки (сопоставление с кодом)

| Порядок | Действие | Риск без флага |
|---------|----------|----------------|
| 1 | Миграции БД additive, деплой webapp, **поведение MP4 без изменений** | Низкий |
| 2 | Деплой `media-worker` (может idle), мониторинг | Низкий |
| 3 | Включить enqueue **только** для ручного тестового media id / admin action | Средний без ограничения |
| 4 | Включить JSON playback API для внутренних тестов (feature flag) | Низкий |
| 5 | Включить UI dual-mode **за флагом** или для staff | Средний |
| 6 | Новые загрузки → auto-enqueue transcode при `video_hls_new_uploads_enabled` | Средний — нагрузка CPU |
| 7 | Backfill батчами с rate limit | Высокий без лимитов |
| 8 | `default_delivery=hls` с fallback | Высокий — откат должен быть одной настройкой |
| 9–10 | TTL/signed hardening, watermark | Средний (кэш, стоимость CPU) |

---

## 4. Feature flags (предлагаемые ключи — финализировать при реализации)

Добавление в `ALLOWED_KEYS` и UI настроек — отдельный PR к фазе 01/04.

Примеры:

- `video_hls_pipeline_enabled` — мастер-выключатель enqueue + worker consume.
- `video_hls_new_uploads_auto_transcode` — новые видео → job.
- `video_playback_api_enabled` — клиенты могут звать playback endpoint.
- `video_default_delivery` — `"mp4" | "hls" | "auto"`.

**Важно:** зеркалирование в integrator DB для ключей не требуется для медиа, если integrator не читает эти настройки; по правилам репозитория новые ключи всё равно проходят через общий механизм `updateSetting` — integrator получит копию (допустимо, без использования).

---

## 5. Переключение default на HLS (фаза 08)

**Предусловия:**

- Доля успешных транскодов > порога (например 95% целевой библиотеки или все новые за N дней).
- Ошибки плеера HLS в логах ниже порога (метрика внедрить в фазе 04/05).
- Runbook отката отрепетирован.

**Действие:** выставить `video_default_delivery=auto` или `hls`, сохранить `mp4` fallback при `hls_ready=false`.

**Откат:** `video_default_delivery=mp4`, опционально отключить auto-transcode для новых.

---

## 6. Backfill (фаза 07)

- Запускать **ночью** или в окна низкой нагрузки.
- Лимит: `N` jobs/час, размер батча, max concurrent workers = 1 на v1.
- Идемпотентность: повторный enqueue не должен перезатирать успешный результат без explicit `force_retranscode`.
- Skip: файлы не `video/*`, слишком большие (политика), уже `hls_ready`, или предыдущий `failed` с кодом «не исправить» (manual list).

---

## 7. Observability при rollout

- Логи worker: `media_id`, `job_id`, длительность, `ffmpeg_exit_code`, размер выхода.
- Логи webapp playback: `media_id`, выбранный `delivery`, причина fallback.
- Алерты: рост `failed`, длина очереди, presign errors.

---

## 8. Документация деплоя

При появлении systemd unit для media-worker — обновить:

- `docs/ARCHITECTURE/SERVER CONVENTIONS.md`
- `deploy/HOST_DEPLOY_README.md`

До этого момента в rollout-чеклистах указывать «не применимо».

---

## 9. Ссылки на phase чек-листы

Каждая фаза содержит **Rollout** и **Rollback** чек-листы; этот файл задаёт общий каркас.
