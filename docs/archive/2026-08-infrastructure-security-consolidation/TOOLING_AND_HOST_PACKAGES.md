# Tooling and host packages

Снимок от 2026-07-19. Он разделяет четыре разных состояния: решение в документации, наличие на dev-хосте,
интеграцию в репозиторий/CI и установку на production. Наличие бинарника у пользователя `dev` не означает, что
защита внедрена.

## 1. Security CI: уже не только «в памяти», но ещё не внедрено

Решение сохранено в:

- [`../../ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md`](../../ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md);
- [`SECURITY_CI_STACK_PLAN.md`](SECURITY_CI_STACK_PLAN.md);
- taskdb `#881`;
- commit `7a3b0a840f` от 2026-07-19.

| Инструмент | Dev-host                    | Repo/CI                 | Куда устанавливается               | Решение                                            |
| ---------- | --------------------------- | ----------------------- | ---------------------------------- | -------------------------------------------------- |
| Gitleaks   | `~/.local/bin`, `8.30.1`    | jobs/config отсутствуют | pinned GitHub Action или CI binary | внедрить сейчас, PR + history gate                 |
| Semgrep    | `~/.local/bin`, `1.168.0`   | jobs/ignore отсутствуют | GitHub Action/container            | внедрить сейчас, baseline + triage                 |
| Trivy      | `~/.local/bin`, `0.72.0`    | jobs/ignore отсутствуют | GitHub Action/container            | fast PR + full release scan                        |
| OWASP ZAP  | `zap-baseline.py` не найден | workflow отсутствует    | pinned container/workflow          | weekly + pre-release; active только synthetic TEST |
| Garak      | `~/.local/bin`, `0.15.1`    | отсутствует             | не требуется сейчас                | отложен до появления AI-agent surface в продукте   |

Это **не npm-зависимости приложения** и не причина ставить сканеры в production runtime. Версии в CI пинуются и
обновляются отдельными dependency/security PR.

ZAP baseline отправляет обычные HTTP/spider-запросы; он не является «ничего не отправляющим наблюдением».
Active scan отправляет attack payloads и разрешён только по синтетическому TEST/эфемерной копии. Диапазоны hosted
GitHub runners общие для разных клиентов; временное открытие TEST допускается только узким auto-closing окном,
без реальных ПДн/секретов, после owner-approved threat review.

## 2. Host packages: подтверждённый PROD и target baseline

До этой инициативы утверждённого списка host security packages в репозитории не было. Ниже — предложение для
`SEC-02`/`DR-01`/`INFRA-01`. Read-only production audit выполнен 2026-07-19; полный обезличенный результат —
[`CURRENT_PROD_BASELINE_2026-07-19.md`](../../_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/CURRENT_PROD_BASELINE_2026-07-19.md). Наличие пакета не означает, что control
настроен или принят.

В репозитории уже есть канонический `deploy/postgres/postgres-backup.sh`: unified `pg_dump`, hourly/daily/weekly
retention и `operator_job_status` health tick. `DR-01` усиливает этот путь permissions/encryption/offsite/restore
proof и не создаёт параллельный backup script.

| Package/tool                   | PROD сейчас                                       | Вердикт плана                          | Роль и критерий                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cryptsetup`                   | установлен `2.7`, encrypted devices отсутствуют   | **adopt на новом host**                | LUKS2 только после disposable reboot/unlock/rescue proof; текущий root in-place не конвертировать                                                                                                     |
| `cryptsetup-initramfs`         | не подтверждён                                    | **conditional**                        | только для принятого encrypted-root boot path                                                                                                                                                         |
| `dropbear-initramfs`           | не установлен                                     | **conditional/high-risk**              | только если принят remote unlock; отдельный SSH trust boundary, allowlist и recovery audit                                                                                                            |
| `nftables`                     | установлен, ruleset фактически пуст/default-allow | **adopt**                              | один host firewall под Selectel SG; default-deny, reboot-persistent, rollback-tested                                                                                                                  |
| `ufw`                          | не активен                                        | **reject**                             | не вводить второй frontend рядом с canonical `nftables`                                                                                                                                               |
| `fail2ban`                     | отсутствует/не активен                            | **adopt**                              | SSH brute-force ban; proof без блокировки owner/deploy recovery path                                                                                                                                  |
| `auditd` + `audispd-plugins`   | отсутствуют/не активны                            | **adopt**                              | изменения env/systemd/SSH/backup-конфигов и privileged actions; без секретов в events                                                                                                                 |
| `Wazuh`/эквивалентный EDR/HIDS | не установлен                                     | **decision после `G-06B`**             | не ставить автоматически; если принят — agent только после disposable compatibility/load proof, manager/index/log storage в отдельном российском security-контуре, alert owner и rollback обязательны |
| `osquery`                      | не установлен                                     | **candidate, не второй default stack** | использовать только если `G-06B` выберет query/telemetry-модель вместо полного HIDS; не дублировать Wazuh без отдельной причины                                                                       |
| `age`                          | не установлен                                     | **adopt**                              | потоковое шифрование dump до offsite; recovery key отдельно от VPS/repository                                                                                                                         |
| `restic`                       | не установлен                                     | **adopt после G-07**                   | encrypted checksum-verifiable offsite copy в отдельное российское object storage                                                                                                                      |
| `pgbackrest`                   | не установлен                                     | **decision в DR-01**                   | WAL/PITR только если утверждённый RPO не закрывается dumps; не запускать второй неуправляемый backup path                                                                                             |
| `awscli`/repo SDK diagnostic   | AWS CLI не установлен                             | **admin/rehearsal only**               | capability/policy/version inventory; unsupported API фиксируется как `unsupported`, runtime не зависит от CLI                                                                                         |
| `apparmor` + utils             | не активен                                        | **compatibility proof**                | включать profile-by-profile после TEST; не блокировать сервисы вслепую                                                                                                                                |
| `postgresql-16-pgaudit`        | не установлен                                     | **proof before adopt/reject**          | не заменяет clinical access audit; сначала volume/performance/redaction proof                                                                                                                         |

## 3. Что не добавлять

- Vault/отдельный secrets platform не внедрять по умолчанию. `CRYPTO-01/C0`, `G-06/G-13` могут потребовать
  независимый KEK/key-management контур; тогда решение, threat coverage и операционная модель фиксируются до кода.
- AIDE/второй file-integrity stack поверх `auditd`, пока не доказана недостающая модель detection.
- Runtime npm «security packages» без конкретной уязвимости и архитектурного места.
- Одновременно UFW и nftables как два источника правил.
- Gitleaks/Semgrep/Trivy/ZAP/Garak на production runtime: они остаются CI/admin tooling.
- Wazuh/osquery нельзя устанавливать «для галочки»: без отдельного manager/sink, alert owner и response SLA это
  привилегированный источник шума, а не закрытый control.

## 4. Installation gate

Для каждого принятого host package исполнитель обязан:

1. прочитать актуальные `SERVER CONVENTIONS`, `HOST_DEPLOY_README` и существующие host scripts;
2. подтвердить read-only текущий production state без вывода секретов;
3. создать идемпотентный script/config + preflight + rollback;
4. доказать на TEST/disposable host, включая reboot/lockout/restore scenario;
5. получить `G-11`; только затем применить на production;
6. записать non-secret факт и версию в канонический runbook.
