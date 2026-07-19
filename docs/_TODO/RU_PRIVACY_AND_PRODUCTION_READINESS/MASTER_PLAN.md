# Master plan

Статус: `draft`. План не меняет порядок текущих SaaS/Product UX работ.

Taskdb: master `#898`; `PR-00/01 #899`; `SEC-02 #900`; `DR-01/02 #901`; `PR-03 #905`; `SEC-04 #906`;
`PR-02 #907`; `SEC-03 #908`; `PR-04 #909`. Все новые задачи имеют `auto_ok=false`. Security CI остаётся
отдельной существующей задачей `#881`. `CRYPTO-01` и `INFRA-01` до owner review остаются детальными sub-stages
umbrella `#898/#900/#901`; отдельные implementation-задачи создаются только с exact file scope и stable dependency
SHA, чтобы не пересечь активные D3/D4/S5/billing работы.

## 1. Порядок и объём

| Этап | Когда | Основной результат | Оценка |
|---|---|---|---:|
| `PR-00` Scope lock | сейчас | доказательный реестр: уже закрыто / уже запланировано / новый gap / owner question | 1–2 дня |
| `PR-01` Processing register | немедленно, docs/legal | карта обработки, РКН status, interim containment, роли/основания | 2–4 дня + юрист |
| `SEC-01` Security CI | сейчас, параллельно, taskdb `#881` | Gitleaks/Semgrep/Trivy в PR; ZAP/full Trivy по расписанию; первый triage | 2–4 дня |
| `SEC-02` Host and secrets | preflight сейчас; TEST после scope lock; PROD только owner window | SSH/SG/firewall, service users, systemd hardening, secret lifecycle | 4–7 дней + окно |
| `DR-01` Backup and S3 | проектирование сейчас; TEST до production | шифрованные, проверяемые и отдельно хранимые backups | 4–7 дней |
| `DR-02` Disaster recovery | после `DR-01` | измеренный restore VPS/DB/S3, утверждённые RPO/RTO | 2–4 дня |
| `CRYPTO-01` Data/key encryption | ADR сейчас; application после D4/S5-7/legal gates | key lifecycle, S3 client-side encryption, encrypted media migration, выбранные DB fields/secrets | 3–6 недель |
| `INFRA-01` Encrypted PROD migration | disposable proof после owner/provider gates; cutover только после PR-04A | новый зашифрованный VPS, rehearsal, phased cutover/rollback и decommission старого | 1–2 недели + окно |
| `PR-02` Health consent | после D4 + S5-7 + legal text | отдельный versioned consent lifecycle | 4–7 дней |
| `PR-03A/B` Data rights/lifecycle | A после `PR-02` и до launch; B до purge; payment slice после freeze #751 | launch manual containment; затем DSAR/export/reminders/purge/offboarding automation | 1–2 недели |
| `SEC-03` Clinical access audit | после D4 | защищённый audit чувствительных reads/downloads/exports/denies | 4–7 дней |
| `SEC-04` Governance/incidents | после `SEC-03` + log/break-glass gates | JML, vulnerability SLA, protected logs и 24/72 incident drill | 4–7 дней |
| `PR-04A/B` ISPDn release gate | A перед cutover, B после soak/decommission | модель угроз/мер, evidence pack, внешний review, owner go/no-go и closure фактической topology | 3–7 дней + review |

Оценка инженерного объёма без ожидания владельца/юриста и production-окон: **примерно 13–22 человеко-недель**.
При трёх независимых исполнителях календарный путь обычно **8–13 недель** после стабилизации зависимостей. Правовые
решения, закупка/доступы и ожидание активных SaaS стадий могут увеличить календарный срок.

## 2. Dependency gates

```text
сейчас: PR-00 ──> PR-01 ───────────────────────────────┐
        SEC-01/#881 ────────────────────────────────────┤
        SEC-02 preflight ─> TEST rehearsal ─────────────┤
        DR-01 design ─> TEST backup/restore ─> DR-02 ───┤
        CRYPTO-01/C0 ADR ────────────────────────────────┤
D4 + S5-7 closed ─> PR-02 ─> PR-03A ─────┐            gate PR-04A
                              PR-03B ──────┼─> full initiative / purge gate
                    SEC-03 ─> SEC-04 ─────┤
                    CRYPTO-01/C1-C4 ──────┤
owner/provider gates ─> INFRA-01/I1-I4 ──┘
PR-04A GO ─> INFRA-01/I5 cutover ─> soak/I6 ─> PR-04B closure
#751 contract freeze ─> payment retention/offboarding slice of PR-03
```

- `PR-02` не стартует с изменением кода/БД, пока D4 и S5-7 не закрыты стабильным integration SHA. До этого
  `PR-01` обязан закрыть `G-05/G-05A`; новые health-data purposes/vendors/org onboarding не расширяются.
- Retention/export/delete платёжных данных не фиксируется до стабилизации контракта задачи `#751`.
- Первый launch требует `PR-03A`: manual request process + approved retention + доказанный `purge disabled`.
  Автоматизированный large export/reminders/purge/offboarding `PR-03B` может идти после launch, но до его закрытия
  irreversible purge запрещён и инициатива целиком не закрывается.
- `SEC-02` и `DR-01` могут проектироваться сейчас; mutating TEST/production команды появляются только после
  чтения актуальных runbooks, rehearsal и owner gate.
- `CRYPTO-01` ADR/ports/tests можно проектировать сейчас, но media/settings/schema implementation ждёт stable
  D4/S5-7 SHA и свои legal/owner gates.
- `INFRA-01/I1-I4` строит и проверяет dark target без production traffic; `I5` невозможен до `PR-04A` и `G-11`.
- `PR-04` не меняет SaaS `SEQUENCE.md`: `PR-04A` является отдельным release gate после TEST-ready результата,
  `PR-04B` подтверждает фактический post-cutover state.

## 3. Этапы

### PR-00 — Scope lock и baseline

Подробно: [`stages/PR-00_SCOPE_LOCK.md`](stages/PR-00_SCOPE_LOCK.md).

Что: инвентаризировать данные, flows, роли, хранилища, секреты, текущие планы и production controls.

Как: code-search → точечное чтение → read-only host preflight по каноническим runbooks → gap registry. Каждый gap
получает ровно один статус: `covered`, `active_dependency`, `new_stage`, `owner_question`, `not_applicable`.

Результат: нет дублирования активных планов; известен реальный scope следующих этапов.

### PR-01 — Processing register и правовая модель

Подробно: [`stages/PR-01_PROCESSING_REGISTER.md`](stages/PR-01_PROCESSING_REGISTER.md).

Что: цели/субъекты/категории/основания, operator/processor roles, подрядчики, трансграничные flows, немедленная
сверка уведомления РКН, interim containment, retention owner и тексты, требующие согласования.

Как: строить реестр от фактических code/data flows; неизвестное выносить в единый decision sheet. Юридические
выводы не принимает агент.

Результат: утверждённые входные данные для consent, DSAR, договоров и модели угроз.

### SEC-01 — Security CI

Исполняется по существующему [`../SECURITY_CI_STACK_PLAN.md`](../SECURITY_CI_STACK_PLAN.md), taskdb `#881`.
Новая инициатива не копирует его checklist. Закрытие требует не только зелёных jobs, но и первого triage с
назначенными владельцами и сроками исправления.

### SEC-02 — Host hardening и secret lifecycle

Подробно: [`stages/SEC-02_HOST_AND_SECRETS.md`](stages/SEC-02_HOST_AND_SECRETS.md).

Что: Selectel SG + host firewall, SSH/fail2ban, deploy boundary, service users, systemd sandbox, env permissions,
инвентарь/ротация/отзыв секретов и отдельный runtime EDR/HIDS decision `G-06B`.

Как: idempotent scripts, dry-run/preflight, отдельный TEST/disposable proof, rollback и только затем owner-approved
production window. S5 storage split переиспользуется и не переделывается.

Результат: минимальный внешний периметр и процессы без лишних root/deploy прав; каждый секрет имеет owner и
проверенный rotation path.

### DR-01/DR-02 — Backup, S3 и disaster recovery

Подробно: [`stages/DR-01_BACKUP_AND_RECOVERY.md`](stages/DR-01_BACKUP_AND_RECOVERY.md).

Что: permissions/umask, encryption, checksum, российская offsite copy, S3 actual capability/version inventory,
application-managed retention, backup immutability, PITR decision и восстановление при потере VPS/БД/S3.

Как: не считать наличие dump успехом; закрывать этап только восстановлением в disposable environment и сверкой
tenant/critical invariants.

Результат: измеренные RPO/RTO и доказанный полный restore без обращения к production данным в dev.

### CRYPTO-01 — Data-at-rest и key lifecycle

Подробно: [`stages/CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md`](stages/CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md).

Что: threat/key architecture, versioned envelope, client-side S3 encryption, multipart/HLS migration,
version-aware deletion, selected DB fields и restricted settings после S5.

Как: сначала ADR + внешний decision по сертифицированным controls; затем typed ports, backward-compatible dual
reader/migration, tamper/tenant-negative/performance tests и independent adversarial audit.

Результат: потеря bucket/dump не раскрывает защищённые данные без отдельного ключевого контура; ключи можно
rotate/recover/revoke, legacy plaintext write-path выключен.

### INFRA-01 — Новый encrypted PROD и cutover

Подробно: [`stages/INFRA-01_ENCRYPTED_PROD_MIGRATION.md`](stages/INFRA-01_ENCRYPTED_PROD_MIGRATION.md).

Что: новый параллельный Selectel VPS, LUKS/encrypted data boundary, encrypted/no swap, PG checksums, non-root
services, firewall/audit, restore rehearsal, phased cutover/rollback и controlled decommission старого host/copies.

Как: repo-managed idempotent scripts → disposable reboot/recovery proof → dark target → full rehearsal → owner GO →
write freeze/final encrypted sync → phased activation → soak → rotation/deletion evidence. In-place LUKS conversion
живого root не является default path.

Результат: production работает на принятой encrypted topology, старый plaintext VPS не остаётся скрытым вторым PROD.

### PR-02 — Health consent

Подробно: [`stages/PR-02_HEALTH_CONSENT.md`](stages/PR-02_HEALTH_CONSENT.md).

Что: versioned consent evidence, применимое основание, отзыв и запрет новой protected processing без основания.

Как: legal text/contract → backward-compatible schema → service/API/UI → tenant-negative and concurrency tests.

Результат: согласие доказуемо, версионируемо и отзывается без уничтожения audit evidence.

### PR-03A/B — Data rights, retention и offboarding

Подробно: [`stages/PR-03_DATA_RIGHTS_AND_RETENTION.md`](stages/PR-03_DATA_RIGHTS_AND_RETENTION.md).

Что: `A` — launch-safe manual request/retention process и технический запрет purge; `B` — automated
access/export/correction/delete, retention jobs, files/S3/backups, reminders, tenant offboarding и legal exceptions.

Как: domain-by-domain slices после consent contract; strict user purge переиспользуется как primitive, не как полный
DSAR. Payment slice ждёт freeze `#751`.

Результат: на launch запросы исполняются контролируемо без необратимого удаления; до включения purge полный
subject request и org offboarding проходят end-to-end с отчётом об исполнении и исключениях.

### SEC-03 — Clinical access audit

Подробно: [`stages/SEC-03_CLINICAL_ACCESS_AUDIT.md`](stages/SEC-03_CLINICAL_ACCESS_AUDIT.md).

Что: successful/denied clinical reads, downloads and exports без clinical payload в логе.

Как: единый event contract + high-risk endpoint/process census + protected store + negative/redaction tests.

Результат: можно доказать, кто и когда обращался к чувствительным данным.

### SEC-04 — Access governance и incident response

Подробно: [`stages/SEC-04_GOVERNANCE_AND_INCIDENTS.md`](stages/SEC-04_GOVERNANCE_AND_INCIDENTS.md).

Что: security logs/sink, access review/JML, break-glass, vulnerability SLA, evidence preservation и 24/72 timers.

Как: отдельный access review и tabletop/technical drill без реальной рассылки или production ПДн.

Результат: контролируемые доступы и воспроизводимый incident workflow.

### PR-04 — ISPDn evidence и release gate

Подробно: [`stages/PR-04_ISPDN_RELEASE_GATE.md`](stages/PR-04_ISPDN_RELEASE_GATE.md).

Что: границы ИСПДн, модель угроз, уровень защищённости, матрица мер ПП №1119/приказа №21, результаты CI/DAST,
restore/tabletop/access review и открытые риски.

Как: независимый technical audit + внешний legal/ISPDn review + owner acceptance. Не маскировать остаточные риски
словом «соответствует».

Результат: `PR-04A` даёт подписанный pre-cutover GO/NO-GO на точные SHA/topology; `PR-04B` закрывает фактический
post-cutover host/storage state, residual risks, owners и сроки.

## 4. Scope rules для исполнителей

- Разрешённый file scope указывается в stage manifest до `doing`; пересечение с активной стадией блокирует старт.
- Не менять active plan/log ради ссылки. Handoff в них — отдельным коммитом после закрытия владельцем.
- Изменения кода выполняются минимальными vertical slices: schema/ports/service/API/UI/tests/docs.
- Инфраструктурные scripts расширяют существующие `deploy/host/*`; crontab меняется только через cronport.
- Production mutations не входят в обычный worker scope и требуют отдельного taskdb item, rehearsal и owner window.
- Для каждого owner action агент читает [`OWNER_ACTIONS.md`](OWNER_ACTIONS.md), сообщает только текущие незакрытые
  пункты и готовит packet до того, как просит владельца покупать/подписывать/переключать.

## 5. Definition of Done инициативы

- [ ] Все owner/legal gates имеют решение, provenance и дату review.
- [ ] Все технические stages закрыты checks + risk-based audit; открытые риски имеют owner/deadline.
- [ ] Security CI, vulnerability triage и protected audit trail работают на реальных безопасных сценариях.
- [ ] `G-06B` закрыт: EDR/HIDS внедрён и проверен либо достаточность compensating runtime controls принята внешним
      reviewer; у alerts есть owner/SLA.
- [ ] Backup/DR подтверждены restore drill с измеренными RPO/RTO.
- [ ] Client-side media encryption, key recovery/rotation и legacy plaintext migration подтверждены на TEST.
- [ ] Новый encrypted PROD прошёл reboot/restore/cutover/rollback evidence; старые plaintext copies закрыты.
- [ ] Consent/DSAR/retention/offboarding проверены end-to-end и tenant-negative tests зелёные.
- [ ] `FINAL_ACCEPTANCE.md` закрыт владельцем и внешним специалистом в их областях.
- [ ] Перед merge/release checkpoint выполнен один полный `pnpm run ci`; production change остаётся отдельным gate.
