# Tooling and host packages

Снимок от 2026-07-19. Он разделяет четыре разных состояния: решение в документации, наличие на dev-хосте,
интеграцию в репозиторий/CI и установку на production. Наличие бинарника у пользователя `dev` не означает, что
защита внедрена.

## 1. Security CI: уже не только «в памяти», но ещё не внедрено

Решение сохранено в:

- [`../../ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md`](../../ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md);
- [`../SECURITY_CI_STACK_PLAN.md`](../SECURITY_CI_STACK_PLAN.md);
- taskdb `#881`;
- commit `7a3b0a840f` от 2026-07-19.

| Инструмент | Dev-host | Repo/CI | Куда устанавливается | Решение |
|---|---|---|---|---|
| Gitleaks | `~/.local/bin`, `8.30.1` | jobs/config отсутствуют | pinned GitHub Action или CI binary | внедрить сейчас, PR + history gate |
| Semgrep | `~/.local/bin`, `1.168.0` | jobs/ignore отсутствуют | GitHub Action/container | внедрить сейчас, baseline + triage |
| Trivy | `~/.local/bin`, `0.72.0` | jobs/ignore отсутствуют | GitHub Action/container | fast PR + full release scan |
| OWASP ZAP | `zap-baseline.py` не найден | workflow отсутствует | pinned container/workflow | weekly + pre-release; active только synthetic TEST |
| Garak | `~/.local/bin`, `0.15.1` | отсутствует | не требуется сейчас | отложен до появления AI-agent surface в продукте |

Это **не npm-зависимости приложения** и не причина ставить сканеры в production runtime. Версии в CI пинуются и
обновляются отдельными dependency/security PR.

ZAP baseline отправляет обычные HTTP/spider-запросы; он не является «ничего не отправляющим наблюдением».
Active scan отправляет attack payloads и разрешён только по синтетическому TEST/эфемерной копии. Диапазоны hosted
GitHub runners общие для разных клиентов; временное открытие TEST допускается только узким auto-closing окном,
без реальных ПДн/секретов, после owner-approved threat review.

## 2. Host packages: новый предлагаемый baseline

До этой инициативы утверждённого списка host security packages в репозитории не было. Ниже — предложение для
`SEC-02`/`DR-01`, а не факт production-установки. Production в рамках этого планирования не инспектировался.

В репозитории уже есть канонический `deploy/postgres/postgres-backup.sh`: unified `pg_dump`, hourly/daily/weekly
retention и `operator_job_status` health tick. `DR-01` усиливает этот путь permissions/encryption/offsite/restore
proof и не создаёт параллельный backup script.

| Package/tool | Dev-host сейчас | Вердикт плана | Роль и критерий |
|---|---|---|---|
| `nftables` | установлен `1.0.9` | **adopt** | один host firewall под Selectel SG; ruleset default-deny, reboot-persistent, rollback-tested |
| `ufw` | не установлен | **reject** | не вводить второй frontend рядом с canonical `nftables` |
| `fail2ban` | не установлен | **adopt** | SSH brute-force ban; proof через synthetic failed logins без блокировки deploy path |
| `auditd` + `audispd-plugins` | не установлены | **adopt** | изменения env/systemd/SSH/backup-конфигов и privileged actions; без секретов в events |
| `age` | не установлен | **adopt** | шифрование standalone dump-артефактов до перемещения; ключ восстановления хранится отдельно |
| `restic` | не установлен | **adopt после G-07** | шифрованная, checksum-verifiable offsite копия в российское object storage |
| `pgbackrest` | не установлен | **decision в DR-01** | принять для WAL/PITR, если утверждённый RPO не закрывается текущими dumps; решение фиксирует proof/rollback |
| `awscli` | не установлен | **admin/CI only** | проверка S3 encryption/versioning/lifecycle/policy; не нужен app runtime |
| `postgresql-<server-major>-pgaudit` | не проверялся | **proof before adopt/reject** | сначала подтвердить production major; проверить объём, performance и риск чувствительных параметров в логах; слепая установка запрещена |

## 3. Что не добавлять

- Vault/отдельный secrets platform до появления нескольких hosts/регионов и операционной команды: сейчас
  root-owned systemd credentials + DB-backed org settings по S5, с documented rotation.
- AIDE/второй file-integrity stack поверх `auditd`, пока не доказана недостающая модель detection.
- Runtime npm «security packages» без конкретной уязвимости и архитектурного места.
- Одновременно UFW и nftables как два источника правил.

## 4. Installation gate

Для каждого принятого host package исполнитель обязан:

1. прочитать актуальные `SERVER CONVENTIONS`, `HOST_DEPLOY_README` и существующие host scripts;
2. подтвердить read-only текущий production state без вывода секретов;
3. создать идемпотентный script/config + preflight + rollback;
4. доказать на TEST/disposable host, включая reboot/lockout/restore scenario;
5. получить `G-11`; только затем применить на production;
6. записать non-secret факт и версию в канонический runbook.
