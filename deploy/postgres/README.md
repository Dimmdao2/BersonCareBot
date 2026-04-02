# PostgreSQL backup (production)

Дамп обеих БД (integrator + webapp из `api.prod` / `webapp.prod`). Скрипт: [`postgres-backup.sh`](./postgres-backup.sh).

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
sudo /opt/backups/scripts/postgres-backup.sh manual
```

**Cron (пример):**

```cron
17 * * * * root /opt/backups/scripts/postgres-backup.sh hourly
```

**Другие пути к env:**

```bash
sudo env BERSONCAREBOT_API_ENV_FILE=/path/to/api.prod BERSONCAREBOT_WEBAPP_ENV_FILE=/path/to/webapp.prod /opt/backups/scripts/postgres-backup.sh pre-migrations
```
