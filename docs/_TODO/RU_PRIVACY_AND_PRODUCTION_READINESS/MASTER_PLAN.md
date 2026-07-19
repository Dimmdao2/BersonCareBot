# Master plan

Статус: `draft`. План не меняет порядок текущих SaaS/Product UX работ.

Taskdb: master `#898`; `PR-00/01 #899`; `SEC-02 #900`; `DR-01/02 #901`; `PR-03 #905`; `SEC-04 #906`;
`PR-02 #907`; `SEC-03 #908`; `PR-04 #909`. Все новые задачи имеют `auto_ok=false`. Security CI остаётся
отдельной существующей задачей `#881`.

## 1. Порядок и объём

| Этап | Когда | Основной результат | Оценка |
|---|---|---|---:|
| `PR-00` Scope lock | сейчас | доказательный реестр: уже закрыто / уже запланировано / новый gap / owner question | 1–2 дня |
| `PR-01` Processing register | немедленно, docs/legal | карта обработки, РКН status, interim containment, роли/основания | 2–4 дня + юрист |
| `SEC-01` Security CI | сейчас, параллельно, taskdb `#881` | Gitleaks/Semgrep/Trivy в PR; ZAP/full Trivy по расписанию; первый triage | 2–4 дня |
| `SEC-02` Host and secrets | preflight сейчас; TEST после scope lock; PROD только owner window | SSH/SG/firewall, service users, systemd hardening, secret lifecycle | 4–7 дней + окно |
| `DR-01` Backup and S3 | проектирование сейчас; TEST до production | шифрованные, проверяемые и отдельно хранимые backups | 4–7 дней |
| `DR-02` Disaster recovery | после `DR-01` | измеренный restore VPS/DB/S3, утверждённые RPO/RTO | 2–4 дня |
| `PR-02` Health consent | после D4 + S5-7 + legal text | отдельный versioned consent lifecycle | 4–7 дней |
| `PR-03` Data rights/lifecycle | после `PR-02`; payment slice после freeze #751 | DSAR, correction, retention/delete и org offboarding | 1–2 недели |
| `SEC-03` Clinical access audit | после D4 | защищённый audit чувствительных reads/downloads/exports/denies | 4–7 дней |
| `SEC-04` Governance/incidents | после `SEC-03` + log/break-glass gates | JML, vulnerability SLA, protected logs и 24/72 incident drill | 4–7 дней |
| `PR-04` ISPDn release gate | перед production SaaS cutover | модель угроз/мер, evidence pack, внешний review, owner go/no-go | 3–7 дней + review |

Оценка инженерного объёма без ожидания владельца/юриста и production-окон: **примерно 8–13 человеко-недель**.
При трёх независимых исполнителях календарный путь обычно **5–8 недель** после стабилизации зависимостей. Правовые
решения, закупка/доступы и ожидание активных SaaS стадий могут увеличить календарный срок.

## 2. Dependency gates

```text
сейчас: PR-00 ──> PR-01 ───────────────────────────────┐
        SEC-01/#881 ────────────────────────────────────┤
        SEC-02 preflight ─> TEST rehearsal ─────────────┤
        DR-01 design ─> TEST backup/restore ─> DR-02 ───┤
                                                     release
D4 + S5-7 closed ─> PR-02 ─> PR-03 ──────┐            gate PR-04
                    SEC-03 ─> SEC-04 ─────┴─────────────┘
#751 contract freeze ─> payment retention/offboarding slice of PR-03
```

- `PR-02` не стартует с изменением кода/БД, пока D4 и S5-7 не закрыты стабильным integration SHA. До этого
  `PR-01` обязан закрыть `G-05/G-05A`; новые health-data purposes/vendors/org onboarding не расширяются.
- Retention/export/delete платёжных данных не фиксируется до стабилизации контракта задачи `#751`.
- `SEC-02` и `DR-01` могут проектироваться сейчас; mutating TEST/production команды появляются только после
  чтения актуальных runbooks, rehearsal и owner gate.
- `PR-04` не меняет SaaS `SEQUENCE.md`: он является отдельным production release gate после TEST-ready результата.

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
инвентарь/ротация/отзыв секретов.

Как: idempotent scripts, dry-run/preflight, отдельный TEST/disposable proof, rollback и только затем owner-approved
production window. S5 storage split переиспользуется и не переделывается.

Результат: минимальный внешний периметр и процессы без лишних root/deploy прав; каждый секрет имеет owner и
проверенный rotation path.

### DR-01/DR-02 — Backup, S3 и disaster recovery

Подробно: [`stages/DR-01_BACKUP_AND_RECOVERY.md`](stages/DR-01_BACKUP_AND_RECOVERY.md).

Что: permissions/umask, encryption, checksum, российская offsite copy, S3 versioning/lifecycle/immutability,
retention, PITR decision, восстановление при потере VPS/БД/S3.

Как: не считать наличие dump успехом; закрывать этап только восстановлением в disposable environment и сверкой
tenant/critical invariants.

Результат: измеренные RPO/RTO и доказанный полный restore без обращения к production данным в dev.

### PR-02 — Health consent

Подробно: [`stages/PR-02_HEALTH_CONSENT.md`](stages/PR-02_HEALTH_CONSENT.md).

Что: versioned consent evidence, применимое основание, отзыв и запрет новой protected processing без основания.

Как: legal text/contract → backward-compatible schema → service/API/UI → tenant-negative and concurrency tests.

Результат: согласие доказуемо, версионируемо и отзывается без уничтожения audit evidence.

### PR-03 — Data rights, retention и offboarding

Подробно: [`stages/PR-03_DATA_RIGHTS_AND_RETENTION.md`](stages/PR-03_DATA_RIGHTS_AND_RETENTION.md).

Что: access/export/correction/delete, retention jobs, files/S3/backups, tenant offboarding и legal exceptions.

Как: domain-by-domain slices после consent contract; strict user purge переиспользуется как primitive, не как полный
DSAR. Payment slice ждёт freeze `#751`.

Результат: subject request и org offboarding проходят end-to-end с отчётом об исполнении и исключениях.

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

Результат: подписанный go/no-go пакет с evidence links, residual risks, owners и сроками.

## 4. Scope rules для исполнителей

- Разрешённый file scope указывается в stage manifest до `doing`; пересечение с активной стадией блокирует старт.
- Не менять active plan/log ради ссылки. Handoff в них — отдельным коммитом после закрытия владельцем.
- Изменения кода выполняются минимальными vertical slices: schema/ports/service/API/UI/tests/docs.
- Инфраструктурные scripts расширяют существующие `deploy/host/*`; crontab меняется только через cronport.
- Production mutations не входят в обычный worker scope и требуют отдельного taskdb item, rehearsal и owner window.

## 5. Definition of Done инициативы

- [ ] Все owner/legal gates имеют решение, provenance и дату review.
- [ ] Все технические stages закрыты checks + risk-based audit; открытые риски имеют owner/deadline.
- [ ] Security CI, vulnerability triage и protected audit trail работают на реальных безопасных сценариях.
- [ ] Backup/DR подтверждены restore drill с измеренными RPO/RTO.
- [ ] Consent/DSAR/retention/offboarding проверены end-to-end и tenant-negative tests зелёные.
- [ ] `FINAL_ACCEPTANCE.md` закрыт владельцем и внешним специалистом в их областях.
- [ ] Перед merge/release checkpoint выполнен один полный `pnpm run ci`; production change остаётся отдельным gate.
