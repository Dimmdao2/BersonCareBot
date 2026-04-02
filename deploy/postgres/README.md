# PostgreSQL backup (production)

Канонический скрипт: [`postgres-backup.sh`](./postgres-backup.sh). Он делает **pg_dump обеих** production-баз:

- integrator — `DATABASE_URL` из `api.prod` (ожидаемое имя БД: `tgcarebot`);
- webapp — `DATABASE_URL` из `webapp.prod` (ожидаемое имя БД: `bcb_webapp_prod`).

Формат: custom (`-Fc`), файлы `*.dump` с меткой времени в каталоге режима.

## Установка на хост

Один раз (от пользователя с правом записи в `/opt/backups/scripts/`, обычно root):

```bash
sudo install -m 0755 /opt/projects/bersoncarebot/deploy/postgres/postgres-backup.sh /opt/backups/scripts/postgres-backup.sh
```

После обновления репозитория — повторить `install` или `cp` из того же пути.

Пользователь `deploy` должен иметь passwordless `sudo` для `sudo /opt/backups/scripts/postgres-backup.sh pre-migrations` (как в `deploy/host/deploy-prod.sh`).

## Режимы

| Аргумент | Каталог вывода |
|----------|----------------|
| `pre-migrations` | `/opt/backups/postgres/pre-migrations/` |
| `hourly` | `/opt/backups/postgres/hourly/` |
| `daily` | `/opt/backups/postgres/daily/` |
| `manual` | `/opt/backups/postgres/manual/` |

Переопределение путей к env (редко нужно):

- `BERSONCAREBOT_API_ENV_FILE` — по умолчанию `/opt/env/bersoncarebot/api.prod`
- `BERSONCAREBOT_WEBAPP_ENV_FILE` — по умолчанию `/opt/env/bersoncarebot/webapp.prod`

## Cron (пример)

Чтобы hourly совпадал с обеими БД, в cron вызывать тот же скрипт с аргументом `hourly` (а не устаревший вариант только для одной БД).

```cron
17 * * * * root /opt/backups/scripts/postgres-backup.sh hourly
```

Точное расписание — на усмотрение оператора (не дублировать с другими задачами на том же хосте).
