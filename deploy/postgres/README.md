# PostgreSQL backup (production)

Дамп по `DATABASE_URL` из `api.prod` и `webapp.prod`. Если оба URL **совпадают** (типичный unified Postgres), выполняется **один** `pg_dump` с префиксом `unified_` в имени файла.

**Каждый дамп больше не пишет `.dump` на диск.** `pg_dump` стримится напрямую в `age`; конечный артефакт —
`<label>_<dbname>_<timestamp>.dump.age` (зашифрованный custom-format поток) + рядом атомарный чек-сумм манифест
`<тот же файл>.sha256`. Плейнтекст-дамп нигде не создаётся, даже во временном файле. `umask 077`, каталоги
`0700`, финальные артефакты `0600`. Ciphertext и manifest сначала пишутся в `.partial` на том же каталоге/файловой
системе. Сначала manifest, затем artifact публикуются атомарным no-clobber `ln`: существующую генерацию нельзя
перезаписать при коллизии. Если publication artifact не состоялась или процесс получает сигнал, manifest и все
финалы текущего неполного logical set откатываются; более ранние валидные генерации не трогаются.

**Требование: `age` + non-secret recipients file.** Скрипт **fail closed до вызова `pg_dump`**, если бинарь `age`
отсутствует в `PATH`, либо файл `BERSONCAREBOT_BACKUP_AGE_RECIPIENTS_FILE` (по умолчанию
`/opt/backups/age-recipients.txt`) не существует/пуст/не читается или весь файл отвергается настроенным `age -R`
parser до `pg_dump`. Этот файл содержит только **публичные** recipient-ключи age (одна строка на ключ через
`age -R`) — он **не секрет** и может лежать рядом со скриптом на
хосте. Приватный recovery-ключ (`age-keygen`) **никогда** не хранится в этом файле, в репозитории или в обычном
VPS backup-пути — он живёт отдельно (owner-controlled, вне `/opt/backups`), иначе бэкап и ключ к нему теряются
вместе при потере VPS. Сгенерировать пару: `age-keygen -o /path/outside/backups/recovery-key.txt` — публичный
recipient (`age1...`) из вывода команды кладётся в recipients file на хосте, приватный ключ уходит в отдельное
защищённое хранилище владельца. Установка/rehearsal реального `age` на хосте и restore drill — отдельный
owner-gated этап (`DR-01`/`DR-02`); эта версия репозитория тестируется только синтетически (см. ниже), реальное
шифрование/восстановление на TEST/PROD не выполнялось.

**`DATABASE_URL` никогда не в argv.** Скрипт передаёт connection string только через libpq-переменную окружения
`PGDATABASE` (принимает полный `postgres://...` URI, сохраняет host/port/user/db/sslmode) — не как аргумент
`pg_dump`/`psql`. В `ps`/argv строка с кредами не видна. Env-файлы читаются как data, не `source`/`eval`: нужен
ровно один корректный `DATABASE_URL`, inherited value не используется. Raw stderr `pg_dump`/`age` не сохраняется;
в operator tick при dump failure уходит только безопасная generic ошибка.

**Верификация артефакта (documented verify command):**

```bash
cd /opt/backups/postgres/<mode>/
sha256sum -c <label>_<dbname>_<timestamp>.dump.age.sha256
```

Несовпадение чек-суммы (повреждение/подмена файла) детектируется этой командой (`sha256sum -c` вернёт `FAILED` и
ненулевой код). Расшифровка (`age -d -i <приватный-ключ> -o out.dump <файл>.dump.age`, затем `pg_restore`) —
предмет отдельного `DR-02` restore drill, не этого скрипта.

**Установка:**

```bash
sudo install -m 0755 /opt/projects/bersoncarebot/deploy/postgres/postgres-backup.sh /opt/backups/scripts/postgres-backup.sh
```

**Проверка (после того как `age`/recipients file подготовлены на хосте):**

```bash
sudo /opt/backups/scripts/postgres-backup.sh pre-migrations
ls -la /opt/backups/postgres/pre-migrations/
```

**Синтетический тест (без реальной БД/age/psql, DEV):**

```bash
deploy/postgres/test-postgres-backup.sh
```

Прогоняет `postgres-backup.sh` только с временным `BACKUPS_ROOT` (`BERSONCAREBOT_BACKUPS_ROOT`), временными env-
файлами и поддельными `pg_dump`/`age`/`psql` (никогда не системные `pg_dump`/`psql` и никогда реальный
`DATABASE_URL`); `sha256sum` — настоящий (чистая хеш-утилита, без DB/секретов), чтобы честно проверить
документированную verify-команду. Покрывает unified/split success, оба split-failure rollback, provider/checksum
failure cleanup, signal cleanup, safe dotenv/inherited value, full-parser recipients fail-closed (malformed age/SSH),
`bash -x` marker-negative, no-clobber collision, absolute non-root/symlink path rejection, pair-aware orphan/retention
and unusual filename. Это только
synthetic evidence: реальный host, ключ, `age`, dump или restore не проверялись.

**Режимы:**

```bash
sudo /opt/backups/scripts/postgres-backup.sh pre-migrations
sudo /opt/backups/scripts/postgres-backup.sh hourly
sudo /opt/backups/scripts/postgres-backup.sh daily
sudo /opt/backups/scripts/postgres-backup.sh weekly
sudo /opt/backups/scripts/postgres-backup.sh manual
sudo /opt/backups/scripts/postgres-backup.sh prune
```

**Retention (`prune`):** hourly старше **48 ч**, daily старше **35 суток**, weekly старше **12 недель** (84 суток); **pre-migrations** — всегда сохраняются **20 самых новых complete encrypted pairs** (по mtime основного артефакта); среди остальных удаляются только те, что **старше 30 суток**. Fresh incomplete encrypted artifact/manifest сохраняет короткую manifest-first grace, но не занимает keep-20 slot. Зашифрованный артефакт (`*.dump.age`, а также legacy незашифрованный `*.dump`/`*.sql`/`*.gz`) и его `.sha256`-манифест считаются **одной генерацией** — манифест никогда не учитывается как отдельная генерация в правиле «20 самых новых», а удаляется только вместе со своим артефактом. Удаляются только файлы под `/opt/backups/postgres/`. Сухой прогон: `BERSONCAREBOT_PRUNE_DRY_RUN=1`.

После каждого режима (включая `prune`) скрипт пишет строку в `public.operator_job_status`: **`job_family=backup`**, **`job_key`** = `backup.pre_migrations` | `backup.hourly` | `backup.daily` | `backup.weekly` | `backup.manual` | `backup.prune` (см. миграция **`0058`** для приведения старых значений `postgres_backup` / коротких ключей).

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

**Переопределение backup root / recipients file (используется тестами, опционально на хосте):**

```bash
sudo env BERSONCAREBOT_BACKUPS_ROOT=/opt/backups/postgres BERSONCAREBOT_BACKUP_AGE_RECIPIENTS_FILE=/opt/backups/age-recipients.txt /opt/backups/scripts/postgres-backup.sh manual
```
