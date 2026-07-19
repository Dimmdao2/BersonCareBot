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
- [ ] Шифровать standalone artifacts через `age`; recovery key хранить отдельно от VPS и backup repository.
- [ ] Настроить `restic` offsite copy, retention и integrity check; backend находится в РФ.
- [ ] Проверить S3 default encryption, bucket policy, public access block, versioning, lifecycle и delete protection.
- [ ] Принять решение по `pgbackrest`/PITR из утверждённого RPO; один выбранный mechanism, documented restore path.
- [ ] Добавить наблюдаемость success/failure/age/duration без секретов и ПДн.

## DR-02 — recovery proof

- [ ] Сценарий A: потеря PostgreSQL, restore DB + migrations/invariants.
- [ ] Сценарий B: потеря VPS, rebuild services/config + restore DB/files.
- [ ] Сценарий C: ошибочное удаление S3 object, восстановление версии/backup.
- [ ] Сценарий D: недоступность primary backup target, restore из отдельной копии.
- [ ] Измерить фактические RPO/RTO, checksum/invariant results и ручные шаги; обновить runbook.

## Проверки и выход

- Restore только в disposable environment, prod/dev не смешиваются.
- После restore зелёны schema/integrity checks и tenant-negative smoke без реальной доставки.
- Backup без проверенного ключа, checksum и restore считается failed.
- В `EVIDENCE` хранится обезличенный отчёт; ключи/dumps остаются в защищённом контуре.
