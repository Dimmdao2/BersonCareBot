# Post-documentation implementation roadmap (этап B)

Документ **после** утверждения пакета [00-master-plan.md](./00-master-plan.md) и gap analysis. Не заменяет phase-файлы; задаёт **рекомендуемый порядок PR** и критерии «готово к следующему PR».

**Правило:** не начинать код phase-N+1, пока чек-листы phase-N не закрыты в review.

---

## Последовательность PR (рекомендуемая)

| # | Содержание PR | Фазы | Примечание |
|---|----------------|------|------------|
| 1 | Миграция БД + TS типы, без смены runtime поведения | 01 | Чистый additive |
| 2 | Таблица очереди + enqueue stub (admin/internal only) + package `apps/media-worker` skeleton | 02 (partial) | Worker может логировать «no-op» |
| 3 | FFmpeg pipeline + upload HLS + статусы | 02 + 03 | E2E dev путь |
| 4 | Purge/delete расширение для HLS keys | 03 | Согласовать с delete flow |
| 5 | `GET .../playback` + resolver + тесты | 04 | Флаг выкл |
| 6 | Player dual-mode + patient page | 05 | За флагом |
| 7 | Auto-enqueue на new upload | 06 | Canary |
| 8 | Backfill runner | 07 | Ops playbook |
| 9 | Default delivery flip + мониторинг | 08 | Требует gate |
| 10 | TTL из settings | 09 | |
| 11 | Watermark optional | 10 | Отдельное согласование PII |

---

## Инфраструктурные задачи (параллельно с PR 2–3)

- [ ] Добавить `apps/media-worker` в `pnpm-workspace.yaml`.
- [ ] Unit файл systemd + строка в `deploy/HOST_DEPLOY_README.md` + `SERVER CONVENTIONS.md`.
- [ ] Установка `ffmpeg` на хост (документировать пакет ОС).

---

## Критерии остановки (когда не продолжать)

- Рост failed transcode > Y% за сутки.
- Регрессия MP4 401/302 в проде.
- CPU saturation webapp (если случайно положили FFmpeg в API — откат немедленный).

---

## Код без явной необходимости не писать

До завершения phase 01–04 **не** добавлять `hls.js` в зависимости (избежать мёртвого кода).

---

## Обновление документации по ходу реализации

После каждой значимой фазы обновлять:

- `apps/webapp/src/app/api/api.md` — новые маршруты и коды ошибок.
- `06-execution-log.md` — дата, PR, решения, инциденты.

---

**Возврат к плану:** [00-master-plan.md](./00-master-plan.md)
