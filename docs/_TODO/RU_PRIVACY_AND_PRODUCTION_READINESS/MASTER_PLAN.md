> STATUS (verified 2026-07-23, code-reconciled): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md
> verified 2026-07-23: ~277 open across stages; ~112 agent-doable backend (DR-01/02 restore drill, LOG-01 L0/L2, CRYPTO-01 C0 draft, NTF-01 census, SEC-02/03 repo slices), rest (~165) owner/legal-gated incl. all of FINAL_ACCEPTANCE.

# Master plan

> **ВЫТЕСНЕНО ТОЛЬКО: push-only топология каналов. Остальное действует.** Все нижеописанные push-only/auth-only channel-topology results и DoD заменены строкой **«Уведомления»** в [`CURRENT_AUTHORITY_MAP.md`](../../CURRENT_AUTHORITY_MAP.md) (`OWNER_PRODUCT_RULES.md` §2, §15, §21–§25); исторический план сохраняется.

Статус: `owner_activated_dev_execution` с 2026-07-19. План не меняет порядок текущих SaaS/Product UX работ.

Taskdb: master `#898`; `PR-00/01 #899`; `SEC-02 #900`; `DR-01/02 #901`; `PR-03 #905`; `SEC-04 #906`;
`PR-02 #907`; `SEC-03 #908`; `PR-04 #909`; `NTF-01 #913` (`N1A #929`, `N1B #930`); `LOG-01 #914`. Отдельный native mobile roadmap —
`#915`. Security CI остаётся отдельной существующей задачей `#881`. `CRYPTO-01` и `INFRA-01` до выделения exact implementation scopes остаются
sub-stages umbrella `#898/#900/#901`; отдельные implementation-задачи создаются только с exact file scope и stable
dependency SHA, чтобы не пересечь активные D3/D4/S5/billing работы.

Owner activation не снимает gates: `auto_ok` и `doing` меняются оркестратором через taskdb только для конкретного
launch manifest. DEV/repository-only implementation разрешён по реестру `PR-00`; реальные TEST/PROD/host changes,
production data и secrets этим решением не разрешены.

## 1. Порядок и объём

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

| Этап                                    | Когда                                                                                                                                   | Основной результат                                                                                                                |            Оценка |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------: |
| `PR-00` Scope lock                      | сейчас                                                                                                                                  | доказательный реестр по пяти статусам + launch manifests                                                                          |           1–2 дня |
| `PR-01` Processing register             | немедленно, docs/legal                                                                                                                  | карта обработки, РКН status, interim containment, роли/основания                                                                  |   2–4 дня + юрист |
| `SEC-01` Security CI                    | сейчас, параллельно, taskdb `#881`                                                                                                      | Gitleaks/Semgrep/Trivy в PR; ZAP/full Trivy по расписанию; первый triage                                                          |           2–4 дня |
| `SEC-02` Host and secrets               | preflight сейчас; TEST после scope lock; PROD только owner window                                                                       | SSH/SG/firewall, service users, systemd hardening, secret lifecycle                                                               |   4–7 дней + окно |
| `DR-01` Backup and S3                   | проектирование сейчас; TEST до production                                                                                               | шифрованные, проверяемые и отдельно хранимые backups                                                                              |          4–7 дней |
| `DR-02` Disaster recovery               | после `DR-01`                                                                                                                           | измеренный restore VPS/DB/S3, утверждённые RPO/RTO                                                                                |           2–4 дня |
| `CRYPTO-01` Data/key encryption         | ADR сейчас; application после D4/S5-7/legal gates                                                                                       | key lifecycle, S3 client-side encryption, encrypted media migration, выбранные DB fields/secrets                                  |        3–6 недель |
| `NTF-01` App push / messenger auth-only | N1 guard; затем N1A auth-channel admin policy и N1B template foundation; native leg после MOB gates                                     | product push-only, auth-only bots, admin channel controls, safe editable/branded templates, no hidden fallback                    |        3–6 недель |
| `LOG-01` Payload hygiene                | L0/L1 сейчас; queue/schema после retention gate                                                                                         | no raw SQL params/clinical text in logs, attempts, retries and queues                                                             |        1–3 недели |
| `INFRA-01` Encrypted PROD migration     | disposable proof после owner/provider gates; cutover только после PR-04A                                                                | новый зашифрованный VPS, rehearsal, phased cutover/rollback и decommission старого                                                | 1–2 недели + окно |
| `PR-02` Health consent                  | после D4 + S5-7 + legal text                                                                                                            | отдельный versioned consent lifecycle                                                                                             |          4–7 дней |
| `PR-03A/B` Data rights/lifecycle        | A0 disable/gate существующего admin hard-delete сейчас; остальной A после `PR-02`; B до purge; payment slice после C5B freeze #844/#845 | сначала закрытый destructive path и negative guard; затем manual containment и DSAR/export/reminders/purge/offboarding automation |        1–2 недели |
| `SEC-03` Clinical access audit          | после D4                                                                                                                                | защищённый audit чувствительных reads/downloads/exports/denies                                                                    |          4–7 дней |
| `SEC-04` Governance/incidents           | после `SEC-03` + log/break-glass gates                                                                                                  | JML, vulnerability SLA, protected logs и 24/72 incident drill                                                                     |          4–7 дней |
| `PR-04A/B` ISPDn release gate           | A перед cutover, B после soak/decommission                                                                                              | модель угроз/мер, evidence pack, внешний review, owner go/no-go и closure фактической topology                                    | 3–7 дней + review |

Оценка инженерного объёма без native mobile UI, ожидания владельца/юриста и production-окон: **примерно 17–30
человеко-недель**. При трёх независимых исполнителях календарный путь обычно **10–16 недель** после стабилизации
зависимостей. Отдельный native roadmap оценивается в своём `MASTER_PLAN`. Правовые
решения, закупка/доступы и ожидание активных SaaS стадий могут увеличить календарный срок.

## 2. Dependency gates

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

```text
сейчас: PR-00 ──> PR-01 ───────────────────────────────┐
        SEC-01/#881 ────────────────────────────────────┤
        SEC-02 preflight ─> TEST rehearsal ─────────────┤
        DR-01 design ─> TEST backup/restore ─> DR-02 ───┤
        CRYPTO-01/C0 ADR ────────────────────────────────┤
        NTF-01/N0 ─> N1 guard ─> N1A/N1B0 ─────────────┤
        LOG-01/L0 ─> L1 guard ──────────────────────────┤
D4 + S5-7 closed ─> PR-02 ─> PR-03A ─────┐            gate PR-04A
                              PR-03B ──────┼─> full initiative / purge gate
                    SEC-03 ─> SEC-04 ─────┤
                    CRYPTO-01/C1-C4 ──────┤
MOB-00/02 + G-04B ─> NTF-01 native push ──┤
                    NTF-01 + LOG-01 ───────┤
owner/provider gates ─> INFRA-01/I1-I4 ──┘
PR-04A GO ─> INFRA-01/I5 cutover ─> soak/I6 ─> PR-04B closure
#844/#845 C5B freeze ─> payment retention/offboarding slice of PR-03
```

- `PR-02` не стартует с изменением кода/БД, пока D4 и S5-7 не закрыты стабильным integration SHA. До этого
  `PR-01` обязан закрыть `G-05/G-05A`; новые health-data purposes/vendors/org onboarding не расширяются.
- Retention/export/delete платёжных данных не фиксируется до стабилизации C5B billing contracts `#844/#845`;
  `#751` остаётся C5A constructor/quotas/trial и не является владельцем billing lifecycle.
- Первый launch требует `PR-03A`: manual request process + approved retention + доказанный `purge disabled`.
  Автоматизированный large export/reminders/purge/offboarding `PR-03B` может идти после launch, но до его закрытия
  irreversible purge запрещён и инициатива целиком не закрывается.
- `SEC-02` и `DR-01` могут проектироваться сейчас; mutating TEST/production команды появляются только после
  чтения актуальных runbooks, rehearsal и owner gate.
- `CRYPTO-01` ADR/ports/tests можно проектировать сейчас, но media/settings/schema implementation ждёт stable
  D4/S5-7 SHA и свои legal/owner gates.
- `NTF-01/N0-N1` и `LOG-01/L0-L1` не ждут billing. Feature routing получает отдельные exact scopes; settings UI
  ждёт stable S5-7/свободный Doctor DNA scope. APNs/FCM leg ждёт `MOB-00/MOB-02` и `G-04B`.
- `PR-03A0` сначала фиксирует ожидаемый FAIL: сейчас существует admin `POST .../permanent-delete`, вызывающий
  `runStrictPurgePlatformUser`. Затем slice временно закрывает administrative hard-delete, добавляет checker/test и
  получает PASS. Ядро strict purge не удаляется; deletion state, таймер, job, schema, emails и export не добавляются.
- `INFRA-01/I1-I4` строит и проверяет dark target без production traffic; `I5` невозможен до `PR-04A` и `G-11`.
- `PR-04` не меняет SaaS `SEQUENCE.md`: `PR-04A` является отдельным release gate после TEST-ready результата,
  `PR-04B` подтверждает фактический post-cutover state.

## 3. Этапы

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### PR-00 — Scope lock и baseline

Подробно: [`stages/PR-00_SCOPE_LOCK.md`](stages/PR-00_SCOPE_LOCK.md).

Что: инвентаризировать данные, flows, роли, хранилища, секреты, текущие планы и production controls.

Как: code-search → точечное чтение → read-only host preflight по каноническим runbooks → gap registry. Каждый gap
получает ровно один статус: `covered`, `active_dependency`, `executable_now`, `owner_or_legal_gate` или
`prod_host_later`.

Результат: нет дублирования активных планов; известен реальный scope следующих этапов.

### PR-01 — Processing register и правовая модель

Подробно: [`stages/PR-01_PROCESSING_REGISTER.md`](stages/PR-01_PROCESSING_REGISTER.md).

Что: цели/субъекты/категории/основания, operator/processor roles, подрядчики, трансграничные flows, немедленная
сверка уведомления РКН, interim containment, retention owner и тексты, требующие согласования.

Как: строить реестр от фактических code/data flows; неизвестное выносить в единый decision sheet. Юридические
выводы не принимает агент.

Результат: утверждённые входные данные для consent, DSAR, договоров и модели угроз.

### INFRA-SEC — инфраструктура и эксплуатационная безопасность

Единственный исполняемый checklist:
[`../INFRASTRUCTURE_SECURITY_PLAN.md`](../INFRASTRUCTURE_SECURITY_PLAN.md).

Он объединяет прежние `SEC-01`, `SEC-02`, `DR-01/02`, `CRYPTO-01`, `INFRA-01` и инфраструктурную часть `SEC-04`:
host/LUKS/S3/backups/secrets/TLS/logs/incident response/security CI/vulnerability scanning/cutover. Исторические
stage-планы сохранены в архиве и больше не являются параллельными источниками работы.

DB logins/roles/grants/RLS и DB-port contract остаются только в отдельном каноническом
[`DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`](../DB_PRIVILEGE_LAYER_REBUILD/PLAN.md) и здесь не дублируются.

### NTF-01 — App push и messenger auth-only

Подробно: [`stages/NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md`](stages/NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md).

Что: Telegram/MAX остаются только login/bind code channel; product chat/reminders/booking/broadcast/support идут в
in-app source + push. Web Push — browser migration transport, APNs/FCM — native transport после mobile/provider gates.

Как: central typed egress guard → provider-neutral push → vertical feature migration → bot retirement → settings/
queue cutover. Content tiers сохраняют полезные даты/статусы, но исключают arbitrary clinical/free text.

Результат: никакого скрытого messenger/email/SMS fallback; без push target событие остаётся in-app и наблюдаемым.

### LOG-01 — Logs, attempts and queue payload hygiene

Подробно: [`stages/LOG-01_SENSITIVE_PAYLOAD_HYGIENE.md`](stages/LOG-01_SENSITIVE_PAYLOAD_HYGIENE.md).

Что: убрать raw SQL params, message/clinical bodies, tokens и filenames из logs/delivery attempts/retries/dead-letter;
минимизировать очереди и задать retention/cleanup.

Как: census → немедленный logger/DB error guard → queue/schema slices после retention gate → marker-negative tests.

Результат: техническая диагностика сохраняет correlation/status/error codes, но не создаёт новые plaintext copies.

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
DSAR. Payment slice ждёт freeze C5B `#844/#845`; C5A `#751` остаётся отдельной зависимостью только там, где
retention действительно касается tariff/trial configuration.

Результат: на launch запросы исполняются контролируемо без необратимого удаления; до включения purge полный
subject request и org offboarding проходят end-to-end с отчётом об исполнении и исключениях.

### SEC-03 — Clinical access audit

Подробно: [`stages/SEC-03_CLINICAL_ACCESS_AUDIT.md`](stages/SEC-03_CLINICAL_ACCESS_AUDIT.md).

Что: successful/denied clinical reads, downloads and exports без clinical payload в логе.

Как: единый event contract + high-risk endpoint/process census + protected store + negative/redaction tests.

Результат: можно доказать, кто и когда обращался к чувствительным данным.

### SEC-04 — Access governance и incident response

Инфраструктурная часть перенесена в
[`INFRASTRUCTURE_SECURITY_PLAN.md` §I4 и §I6](../INFRASTRUCTURE_SECURITY_PLAN.md#i4--секреты-и-инфраструктурные-доступы).
Clinical access events остаются в `SEC-03`; правовая квалификация инцидента и release evidence — в `PR-04`.

### PR-04 — ISPDn evidence и release gate

Подробно: [`stages/PR-04_ISPDN_RELEASE_GATE.md`](stages/PR-04_ISPDN_RELEASE_GATE.md).

Что: границы ИСПДн, модель угроз, уровень защищённости, матрица мер ПП №1119/приказа №21, результаты CI/DAST,
restore/tabletop/access review и открытые риски.

Как: независимый technical audit + внешний legal/ISPDn review + owner acceptance. Не маскировать остаточные риски
словом «соответствует».

Результат: `PR-04A` даёт подписанный pre-cutover GO/NO-GO на точные SHA/topology; `PR-04B` закрывает фактический
post-cutover host/storage state, residual risks, owners и сроки.

## 4. Scope rules для исполнителей

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- Разрешённый file scope указывается в stage manifest до `doing`; пересечение с активной стадией блокирует старт.
- Не менять active plan/log ради ссылки. Handoff в них — отдельным коммитом после закрытия владельцем.
- Изменения кода выполняются минимальными vertical slices: schema/ports/service/API/UI/tests/docs.
- Инфраструктурные scripts расширяют существующие `deploy/host/*`; crontab меняется только через cronport.
- Production mutations не входят в обычный worker scope и требуют отдельного taskdb item, rehearsal и owner window.
- Для каждого owner action агент читает [`OWNER_ACTIONS.md`](OWNER_ACTIONS.md), сообщает только текущие незакрытые
  пункты и готовит packet до того, как просит владельца покупать/подписывать/переключать.

## 5. Definition of Done инициативы

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Все owner/legal gates имеют решение, provenance и дату review.
- [ ] Все технические stages закрыты checks + risk-based audit; открытые риски имеют owner/deadline.
- [ ] Security CI, vulnerability triage и protected audit trail работают на реальных безопасных сценариях.
- [ ] `G-06B` закрыт: EDR/HIDS внедрён и проверен либо достаточность compensating runtime controls принята внешним
      reviewer; у alerts есть owner/SLA.
- [ ] Backup/DR подтверждены restore drill с измеренными RPO/RTO.
- [ ] Client-side media encryption, key recovery/rotation и legacy plaintext migration подтверждены на TEST.
- [ ] Product notifications доставляются только через app push; Telegram/MAX ограничены auth-code allowlist;
      APNs/FCM vendor/legal gate закрыт.
- [ ] Raw clinical/message/SQL-param markers отсутствуют в logs, attempts, queues and retries.
- [ ] Новый encrypted PROD прошёл reboot/restore/cutover/rollback evidence; старые plaintext copies закрыты.
- [ ] Consent/DSAR/retention/offboarding проверены end-to-end и tenant-negative tests зелёные.
- [ ] `FINAL_ACCEPTANCE.md` закрыт владельцем и внешним специалистом в их областях.
- [ ] Перед merge/release checkpoint выполнен один полный `pnpm run ci`; production change остаётся отдельным gate.
