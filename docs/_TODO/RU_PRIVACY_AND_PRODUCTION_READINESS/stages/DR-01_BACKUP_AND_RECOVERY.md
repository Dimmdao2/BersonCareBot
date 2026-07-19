# DR-01/DR-02 — Backup, S3 and recovery

## Зависимости

PR-00 storage/backup inventory; `G-07`; подтверждённая российская offsite цель; отдельная disposable restore среда.

## File scope gate

Allowed сейчас: эта инициатива, read-only inventory и канонические `deploy/postgres/*` только после exact manifest в
LOG. Out of scope: второй parallel backup script, active SaaS files, real dumps/keys в git и production mutation без
TEST restore proof + `G-11`.

## DR-01 — protection

- [ ] Сверить DB/files/S3/config/key material: что нужно для полного восстановления и что нельзя класть вместе.
- [ ] Зафиксировать `umask`, directories `0700`, artifacts `0600`, owner и cleanup для существующих backup scripts.
- [ ] Убрать credential-bearing `DATABASE_URL` из process argv; использовать `.pgpass`/controlled env/Unix socket
      либо другой доказанный PostgreSQL credential path без вывода секрета.
- [ ] Шифровать поток `pg_dump → age` до записи конечного artifact; если временный plaintext технически неизбежен,
      он допускается только на encrypted volume с trap cleanup и отдельным evidence. Recovery key хранится отдельно
      от VPS и backup repository.
- [ ] Создавать atomic artifact + authenticated encryption и независимый checksum manifest; signing добавляется
      только если `CRYPTO-01/C0` определил signing-key owner/verification path. Повреждённая копия fail closed.
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
