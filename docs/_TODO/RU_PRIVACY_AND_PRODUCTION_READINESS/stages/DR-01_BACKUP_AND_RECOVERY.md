> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

# DR-01/DR-02 — Backup, S3 and recovery

## Зависимости

PR-00 storage/backup inventory; `G-07`; подтверждённая российская offsite цель; отдельная disposable restore среда.

## File scope gate

Allowed сейчас: эта инициатива, read-only inventory и канонические `deploy/postgres/*` только после exact manifest в
LOG. Out of scope: второй parallel backup script, active SaaS files, real dumps/keys в git и production mutation без
TEST restore proof + `G-11`.

## DR-01 — protection

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Сверить DB/files/S3/config/key material: что нужно для полного восстановления и что нельзя класть вместе.
- [x] Зафиксировать `umask`, directories `0700`, artifacts `0600`, owner и cleanup для существующих backup scripts.
      Closed for `deploy/postgres/postgres-backup.sh` (repository slice, taskdb `#901`, L4): `umask 077`,
      normalized absolute non-root `BACKUPS_ROOT`/mode dirs `0700`, final artifact + checksum manifest `0600`, and
      signal cleanup of tracked partial/pending/current-run pair paths with retained partial inode proof (so cleanup
      cannot delete a collision); symlink components are refused. Не покрывает
      host-level owner/ACL provisioning вне этого скрипта. (✓ verified deploy/postgres/postgres-backup.sh:74 umask 077, :183-189 ensure_dir_0700/chmod 0700)
- [x] Убрать credential-bearing `DATABASE_URL` из process argv; использовать `.pgpass`/controlled env/Unix socket
      либо другой доказанный PostgreSQL credential path без вывода секрета.
      Closed for `postgres-backup.sh`: data-only parser requires exactly one valid env-file assignment and ignores
      inherited values; `DATABASE_URL` передаётся `pg_dump`/`psql` только через libpq env `PGDATABASE`, никогда через
      argv. (✓ verified postgres-backup.sh:33-34,76-77 — never a command-line arg, injected via PGDATABASE)
- [x] Шифровать поток `pg_dump → age` до записи конечного artifact; если временный plaintext технически неизбежен,
      он допускается только на encrypted volume с trap cleanup и отдельным evidence. Recovery key хранится отдельно
      от VPS и backup repository.
      Closed for `postgres-backup.sh`: настроенный `age -R` parser принимает весь public-recipients file до
      `pg_dump`; затем `pg_dump` стримится напрямую в `age`, plaintext final/temp файл не создаётся
      никогда (сильнее допущенного minimum). Реальный `age`/recovery-key lifecycle на хосте остаётся отдельным
      owner-gated rehearsal — репозиторная реализация проверена только синтетически. (✓ verified postgres-backup.sh:14-15,283-286,454 — age -R stream, no plaintext dump on disk)
- [x] Создавать atomic artifact + authenticated encryption и независимый checksum manifest; signing добавляется
      только если `CRYPTO-01/C0` определил signing-key owner/verification path. Повреждённая копия fail closed.
      Closed for `postgres-backup.sh`: ciphertext + manifest пишутся в `.partial` на том же каталоге; manifest then
      artifact publish uses atomic no-clobber links, with rollback if the pair cannot complete; `sha256sum -c`
      детектирует повреждение (доказано синтетическим тестом). Signing не добавлен — ждёт `CRYPTO-01/C0` по плану. (✓ verified postgres-backup.sh:15-20,193 — .partial atomic publish + sha256sum manifest)
- [ ] Настроить `restic` offsite copy, retention и integrity check; backend находится в РФ.
- [ ] Периодически копировать encrypted S3 media ciphertext **и** envelope/object manifests во вторую российскую
      failure domain с отдельными credentials. Versioning того же bucket/account не считается защитой от потери
      bucket, account или primary provider target.
- [ ] Проверить фактический anonymous deny, bucket policy/ACL и S3 credentials least privilege. Selectel Public Access
      Block API не поддерживается и не является обязательным чекбоксом.
- [ ] Для health media принять client-side encryption из `CRYPTO-01`. Selectel Bucket Encryption и Lifecycle API
      не поддерживаются: retention/purge реализуется приложением и проверяется version-aware inventory.
- [ ] Versioning рабочего media-bucket включается только после delete-all-versions capability. Object Lock проверяется
      на отдельном disposable/backup bucket и не включается на рабочем bucket «на пробу».
- [ ] Принять решение по `pgbackrest`/PITR из утверждённого RPO; один выбранный mechanism, documented restore path.
- [ ] Добавить наблюдаемость success/failure/age/duration без секретов и ПДн.

## DR-02 — recovery proof

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Сценарий A: потеря PostgreSQL, restore DB + migrations/invariants.
- [ ] Сценарий B: потеря VPS, rebuild services/config + restore DB/files.
- [ ] Сценарий C: ошибочное удаление S3 object, восстановление encrypted version/backup; delete marker и все версии
      учитываются явно.
- [ ] Сценарий D: недоступность primary backup target, restore из отдельной копии.
- [ ] Сценарий E: потеря primary S3 bucket/account, восстановление media ciphertext + manifests из независимой
      российской копии без plaintext staging вне encrypted boundary.
- [ ] Измерить фактические RPO/RTO, checksum/invariant results и ручные шаги; обновить runbook.

## Проверки и выход

- Restore только в disposable environment, prod/dev не смешиваются.
- После restore зелёны schema/integrity checks и tenant-negative smoke без реальной доставки.
- Backup без проверенного ключа, checksum и restore считается failed.
- Backup pipeline не считается закрытым, пока новый запуск не перестал создавать plaintext/world-readable dumps;
  существующие 93 открытые copies получили owner-approved encrypted migration/deletion disposition.
- В `EVIDENCE` хранится обезличенный отчёт; ключи/dumps остаются в защищённом контуре.
