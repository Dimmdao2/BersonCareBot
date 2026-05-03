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

## Режим исполнения для Composer (обязательный)

Для каждой фазы использовать одинаковый цикл:

1. `EXEC` — реализовать фазу строго в ее scope.
2. `AUDIT` — провести независимую проверку и выписать `MANDATORY FIX INSTRUCTIONS`.
3. `FIX` — закрыть `critical/major`, затем `minor` или явно зафиксировать defer.
4. Только после `FIX` переходить к следующей фазе.

Фазы выполнять строго по порядку `01 -> 10`, без параллельных прыжков.

---

## Политика проверок (без злоупотребления full CI)

- На шагах `EXEC/FIX` запускать только целевые проверки по затронутой области (`lint`, `typecheck`, `test:webapp`, выборочные e2e/smoke).
- Не запускать `pnpm run ci` после каждой мелкой правки.
- Полный `pnpm install --frozen-lockfile && pnpm run ci` делать только перед пушем/когда требуется pre-push барьер.

---

## Инфраструктурные задачи (этап B — актуализация после phase 01–10)

- [x] **`apps/media-worker` в монорепозитории** — сделано (`pnpm-workspace.yaml`).
- [x] **Отдельный systemd unit для `apps/media-worker` на production** — шаблон **`bersoncarebot-media-worker-prod.service`** в репозитории (`deploy/systemd/`), интеграция в `deploy/host/deploy-prod.sh`, `deploy/host/bootstrap-systemd-prod.sh`, записи в `deploy/HOST_DEPLOY_README.md` и `docs/ARCHITECTURE/SERVER CONVENTIONS.md`. На новом хосте оператор устанавливает unit из дерева деплоя и при необходимости расширяет sudoers по `deploy/sudoers-deploy.example`.
- [x] **FFmpeg на хосте** — требование для media-worker; установка пакета ОС выполняется оператором на целевой машине, не версионируется в git без нового host audit.

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
