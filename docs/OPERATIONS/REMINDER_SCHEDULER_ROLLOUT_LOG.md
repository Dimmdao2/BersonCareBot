# Reminder scheduler — production rollout log

Журнал выполнения плана «напоминания в проде (scheduler)»: systemd unit, bootstrap/deploy, sudoers, доки, политика lock/restart, reminder-хвосты.

Формат записи: дата (UTC), что изменено, проверки, результат, откат.

---

## Template (копировать для новой строки)

| Дата | Шаг | Изменения | Проверки | Результат | Откат |
|------|-----|-----------|----------|-----------|-------|
| YYYY-MM-DD | A1… | … | … | … | … |

---

## Записи (репозиторий — по шагам плана)

| Дата | Шаг | Изменения | Проверки | Результат | Откат |
|------|-----|-----------|----------|-----------|-------|
| 2026-05-14 | A1 Unit | `deploy/systemd/bersoncarebot-scheduler-prod.service`: `api.prod`, `ExecStart` → `dist/infra/runtime/scheduler/main.js`, `Restart=on-failure`, `RestartSec=5` | Сверка с `bersoncarebot-worker-prod.service` | Зафиксировано в репо | Удалить unit с хоста + `daemon-reload` |
| 2026-05-14 | A2 Bootstrap | `deploy/host/bootstrap-systemd-prod.sh`: install/enable scheduler; `enable --now` только при наличии `dist/.../scheduler/main.js` | Логика веток enable vs enable --now | Зафиксировано в репо | Откат скрипта + ручной `systemctl disable` при необходимости |
| 2026-05-14 | A3 deploy-prod | `deploy/host/deploy-prod.sh`: install, `require_unit_file`, sudo checks, restart после migrate вместе с API/worker, `is-active` + `journalctl -n 40` при падении | `rg` по деплой-докам | Зафиксировано в репо | Откат скрипта |
| 2026-05-14 | A4 Sudoers | `deploy/sudoers-deploy.example`: NOPASSWD для install/enable/restart/is-active/journalctl scheduler | Соответствие командам из deploy-prod | Зафиксировано в репо | Обновить реальный sudoers на хосте |
| 2026-05-14 | A5 Доки | `SERVER CONVENTIONS`, `HOST_DEPLOY_README`, `ARCHITECTURE` (снятие отклонения 3), `deploy/env/README`, `INTEGRATOR_CONTRACT`, `api.md`, `OUTGOING_DELIVERY_QUEUE`, списки unit-шаблонов; архивные чеклисты/runbook/HLS gap — упоминание `bersoncarebot-scheduler-prod` | Чтение ссылок кросс-репо | Зафиксировано в репо | Откат коммита доков |
| 2026-05-14 | A6 Scripts | `apps/integrator`: `scheduler:dev`, `scheduler:start`; корень: `scheduler:dev`, `scheduler:start`, `scheduler:start:host` | Имена согласованы с `worker:*` | Зафиксировано в репо | — |
| 2026-05-14 | Lock / restart | `scheduler/main.ts`: `process.exit(1)` при отказе lock; unit `Restart=on-failure` | Нет tight loop при дубликате unit | Зафиксировано в репо | Согласовать с ops при смене политики |
| 2026-05-14 | B Хвосты | `reminders.ts` due: `LEFT JOIN` telegram; handler: topic-bindings не режут каналы при `{}`; `client.ts`: логи без полного URL; webapp stub dispatch + тесты; `executeAction` тест на пустые bindings | `vitest` по `reminders.dispatchDue` | Зафиксировано в репо | — |

### Хост (ops — вне репозитория)

| Дата | Шаг | Изменения | Проверки | Результат | Откат |
|------|-----|-----------|----------|-----------|-------|
| — | Host sudoers | Применить обновлённый фрагмент к `/etc/sudoers.d/` для `deploy` | `sudo -n -l` | *заполняет оператор* | visudo |
| — | Host enable | `systemctl enable --now bersoncarebot-scheduler-prod` после деплоя с артефактами | `systemctl is-active`; `journalctl -u … -n 80` | *заполняет оператор* | `systemctl stop …` |

Перед merge в ветку с кодом: полный **`pnpm run ci`** на актуальном дереве (барьер репозитория).
