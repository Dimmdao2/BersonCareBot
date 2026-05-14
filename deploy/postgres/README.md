# PostgreSQL backup (production)

Дамп по `DATABASE_URL` из `api.prod` и `webapp.prod`. Если оба URL **совпадают** (типичный unified Postgres), выполняется **один** `pg_dump` с префиксом `unified_` в имени файла.

**Установка:**

```bash
sudo install -m 0755 /opt/projects/bersoncarebot/deploy/postgres/postgres-backup.sh /opt/backups/scripts/postgres-backup.sh
```

**Проверка:**

```bash
sudo /opt/backups/scripts/postgres-backup.sh pre-migrations
ls -la /opt/backups/postgres/pre-migrations/
```

**Режимы:**

```bash
sudo /opt/backups/scripts/postgres-backup.sh pre-migrations
sudo /opt/backups/scripts/postgres-backup.sh hourly
sudo /opt/backups/scripts/postgres-backup.sh daily
sudo /opt/backups/scripts/postgres-backup.sh weekly
sudo /opt/backups/scripts/postgres-backup.sh manual
sudo /opt/backups/scripts/postgres-backup.sh prune
```

**Retention (`prune`):** hourly старше **48 ч**, daily старше **35 суток**, weekly старше **12 недель** (84 суток), pre-migrations старше **30 суток** и при этом остаётся не больше **20** файлов (лишние самые старые удаляются). Удаляются только файлы под `/opt/backups/postgres/`. Сухой прогон: `BERSONCAREBOT_PRUNE_DRY_RUN=1`.

После каждого режима (включая `prune`) скрипт пишет строку в `public.operator_job_status` (`job_family=postgres_backup`, `job_key` = имя режима).

**Cron (пример):**

```cron
17 * * * * root /opt/backups/scripts/postgres-backup.sh hourly
12 3 * * * root /opt/backups/scripts/postgres-backup.sh daily
22 4 * * 0 root /opt/backups/scripts/postgres-backup.sh weekly
35 4 * * * root /opt/backups/scripts/postgres-backup.sh prune
```

**Другие пути к env:**

```bash
sudo env BERSONCAREBOT_API_ENV_FILE=/path/to/api.prod BERSONCAREBOT_WEBAPP_ENV_FILE=/path/to/webapp.prod /opt/backups/scripts/postgres-backup.sh pre-migrations
```
