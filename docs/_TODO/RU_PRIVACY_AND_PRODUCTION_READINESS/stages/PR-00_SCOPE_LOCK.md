> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

# PR-00 — Scope lock

Статус: owner-activated DEV execution, baseline SHA `2f8147e91`. Реестр сверён с taskdb и foundation logs
2026-07-19. Это разрешение на перечисленные repository/DEV slices, но не на TEST/PROD/deploy/secrets.

## Вход

- Активные taskdb/ветки/логи прочитаны.
- `SERVER CONVENTIONS`, deploy/backup/S3 runbooks и relevant architecture docs найдены через code-search.

## Работа

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Инвентаризировать категории ПДн и clinical data по таблицам, files/S3, messages, logs, backups и exports.
- [ ] Построить карту process → principal → DB role → schema/table → external recipient.
- [ ] Инвентаризировать auth, MFA/session, admin/break-glass, SSH, GitHub, Selectel, DB и S3 access surfaces.
- [ ] Инвентаризировать secrets по имени/owner/storage/rotation без значений.
- [ ] Выполнить read-only production preflight строго по каноническим runbooks; неизвестное оставить `unconfirmed`.
- [x] Для каждого gap назначить `covered`, `active_dependency`, `executable_now`, `owner_or_legal_gate` или
      `prod_host_later`. (✓ verified «Реестр исполнения» table below — each row carries exactly one taxonomy status)
- [ ] Независимый аудитор проверяет отсутствие дублей и вмешательства в active scope.

## Реестр исполнения

У каждого пункта ровно один текущий статус. `executable_now` означает: оркестратор сначала назначает taskdb scope,
проверяет пересечения worktree и запускает отдельного исполнителя; это не разрешение менять integration worktree
напрямую.

| Control / stage                                                    | Статус                | Факт, зависимость и следующий переход                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S5-0…S5-3                                                          | `covered`             | `#890/#891/#892/#897` технически done/tested/audited; commits `8e7574363`, `f928c63d0`, `bd38c37be`, `d34f17def`. Owner acceptance/provenance отдельно подтверждает lead через taskdb.                                                                                                                                                                              |
| D3 hard-mode exit                                                  | `active_dependency`   | `#773–775` blocked; последний доказанный live TEST smoke — 16/17, не 17/17. Не объявлять D3 закрытым по наличию commit.                                                                                                                                                                                                                                             |
| D4 tenant write matrix                                             | `active_dependency`   | Не стартовал; блокирует tenant-aware application changes в PR-02, SEC-03 и CRYPTO C2-C4.                                                                                                                                                                                                                                                                            |
| S5-4…S5-7                                                          | `active_dependency`   | Не закрыты; S5-7 нужен для consent/settings/crypto application slices.                                                                                                                                                                                                                                                                                              |
| Billing lifecycle `#844/#845`                                      | `active_dependency`   | Только payment-retention slice PR-03 ждёт C5B freeze; `#751` теперь C5A constructor/quotas/trial, остальные домены этим не блокируются.                                                                                                                                                                                                                             |
| PR-01 processing register / РКН containment (`#899`)               | `executable_now`      | Фактическая code/data-flow карта и список legal inputs могут строиться без ПДн; юридические выводы остаются gate.                                                                                                                                                                                                                                                   |
| SEC-01 static Security CI (`#881`)                                 | `executable_now`      | Gitleaks, Semgrep и быстрый Trivy в repository CI; первый triage обязателен. ZAP active не направлять на PROD.                                                                                                                                                                                                                                                      |
| SEC-02 repository safety slice (`#900`)                            | `executable_now`      | Read-only census + reversible preflight/rollback/shell tests в существующих deploy paths; не применять host changes.                                                                                                                                                                                                                                                |
| DR-01 repository backup slice (`#901`)                             | `executable_now`      | Усилить единственный canonical `deploy/postgres/postgres-backup.sh` и его тесты без dumps/keys/real restore.                                                                                                                                                                                                                                                        |
| CRYPTO-01/C0 (`#898`, до отдельной child task)                     | `executable_now`      | Data-at-rest map, threat/key ADR, typed boundary proposal и test vectors; C1 только после принятого C0.                                                                                                                                                                                                                                                             |
| NTF-01/N0 (`#913`)                                                 | `executable_now`      | Полный outbound/event/channel/content/queue census и exact manifests; current multi-channel runtime не меняется в docs slice.                                                                                                                                                                                                                                       |
| NTF-01/N1 и Web Push routing (`#913`, exact child scopes later)    | `executable_now`      | Central auth-only messenger guard и push-only resolver slices могут идти после exact dispatch/feature file locks; не зависят от billing.                                                                                                                                                                                                                            |
| NTF-01 native APNs/FCM                                             | `owner_or_legal_gate` | Ждёт `MOB-00/MOB-02`, `G-04B`, provider accounts и restricted setting/key architecture.                                                                                                                                                                                                                                                                             |
| LOG-01/L0-L1 (`#914`)                                              | `executable_now`      | Census + exact-scoped removal raw SQL params/body from logs; queue/schema retention waits `G-03`.                                                                                                                                                                                                                                                                   |
| PR-03A0 disable + negative invariant (`#905`, узкий child scope)   | `executable_now`      | Worker + correction на base `d1fad7c65` закрыли legacy API/UI и четыре operational account-delete команды, включая integrator account/Rubitime deletion paths; baseline checker FAIL → PASS, targeted tests/typecheck/lint PASS. Статус остаётся `executable_now` до независимого audit и integration commit; strict-purge core и media pending-delete не менялись. |
| SEC-03 event contract/census (`#908`)                              | `executable_now`      | Только docs/generated inventory/checker design; подключение clinical endpoints и audit store ждёт D4.                                                                                                                                                                                                                                                               |
| PR-02 consent implementation (`#907`)                              | `owner_or_legal_gate` | Ждёт D4, S5-7 и `G-02`/утверждённую форму; обычный checkbox не является safe default.                                                                                                                                                                                                                                                                               |
| PR-03A manual retention/request flow                               | `owner_or_legal_gate` | Ждёт PR-02 и `G-03`; 90 дней — product target, не разрешение включить таймер удаления.                                                                                                                                                                                                                                                                              |
| CRYPTO-01 C1-C4                                                    | `owner_or_legal_gate` | C1 ждёт принятого C0; C2-C4 дополнительно D4/S5-7 и `G-06/G-13/G-14`.                                                                                                                                                                                                                                                                                               |
| SEC-04 / PR-04                                                     | `owner_or_legal_gate` | Ждут upstream evidence и решения `G-06B/G-09/G-10/G-12`.                                                                                                                                                                                                                                                                                                            |
| Production FIO backfill                                            | `prod_host_later`     | Только единый финальный full cutover по FIO runbook; ручные owner decisions не пересчитывать парсером. Parser retirement — после apply/evidence.                                                                                                                                                                                                                    |
| LUKS, production firewall/SSH/systemd/packages/secrets             | `prod_host_later`     | Подготовка к новому production-хосту; каждое применение — отдельный rehearsal + `G-11`.                                                                                                                                                                                                                                                                             |
| Реальные backups/restores, offsite/PITR и encrypted PROD migration | `prod_host_later`     | Repository implementation сейчас, реальные данные/targets — только approved cutover; `G-07/G-11/G-13`.                                                                                                                                                                                                                                                              |

## Launch manifests для `executable_now`

Общие запреты: не менять active SaaS/Product UX/billing/FIO планы; не читать secret values; не подключаться к PROD;
не запускать второй Next server; DB только через существующие Drizzle/ports; taskdb только через `taskdb.mjs`.

### L1 — SEC-01 static CI, taskdb `#881`

- Outcome: PR jobs для Gitleaks/Semgrep/Trivy, датированные точечные allowlists, первый PII-free triage.
- Allowed: `.github/workflows/ci.yml`, `.github/actions/**` только если переиспользование требует; новые scanner configs,
  их fixtures/tests; [`../../INFRASTRUCTURE_SECURITY_PLAN.md` §I5](../../INFRASTRUCTURE_SECURITY_PLAN.md#i5--ci-и-поиск-уязвимостей) и tooling decision log.
- Protected: deploy workflows, app code, TEST/PROD targets. ZAP active/live — отдельный serialized gate.
- Checks: workflow syntax/action pin review, локальные scanner runs, synthetic fake-secret negative, один независимый
  security audit; full CI только на integration milestone.
- Gate: нет для static scanners. GitHub/network installation changes и ZAP target/rules отдельно согласуются.

### L2 — PR-01 factual register, taskdb `#899`

- Outcome: process → principal → organization ownership → DB/schema/files/S3/log/backup → recipient map; vendor,
  transborder, secret-name и access-surface inventories без значений и ПДн.
- Allowed: только файлы этой инициативы. Census начинает с `code-search`/`codeq`; runtime unknown остаётся
  `unconfirmed`, а не заменяется догадкой.
- Checks: каждая строка имеет source path, owner и один статус; relative-link check; независимый legal/architecture
  review отделяет инженерный факт от правового вывода.
- Gates: `G-01/G-02/G-03/G-04/G-05/G-05A`; агент готовит вопросы, но не закрывает их.

### L3 — SEC-02 repository preflight, taskdb `#900`

- Outcome: один reversible preflight/rollback contract для permissions, SSH/firewall/systemd/secret-name census,
  без применения к host.
- Перед file lock: `code-search "deploy host hardening ssh firewall systemd rollback" --repo bcb`, затем exact list
  существующих `deploy/host/*`, tests и runbooks фиксируется в taskdb/LOG. Не создавать второй deploy mechanism.
- Checks: dry-run, idempotency, rollback-path test, `shellcheck`; никаких live port/firewall/session mutations.
- Ownership: host/deploy control, application DB ownership отсутствует. `G-06B/G-08` блокируют выбор runtime controls;
  любое TEST/PROD применение остаётся вне slice и PROD требует `G-11`.

### L4 — DR-01 repository backup safety, taskdb `#901`

- Outcome: canonical backup перестаёт создавать permissive/plaintext final artifacts; credential не попадает в argv;
  format/checksum/encryption/cleanup contract покрыт synthetic tests.
- Allowed candidate scope: `deploy/postgres/postgres-backup.sh`, `deploy/postgres/README.md`, существующие backup
  tests/smokes, privacy stage/log. Exact paths сначала подтвердить `code-search "postgres-backup.sh backup test"`.
- Protected: реальные dumps, keys, cron, PROD/TEST DB/S3, второй backup script. Cron — только через cronport и не в
  repository-only slice.
- Checks: `shellcheck`, synthetic fake-data encrypt/decrypt/corruption/cleanup tests, no-secret/no-PII output,
  independent security audit.
- Gate: repository implementation сейчас; выбор RPO/RTO/offsite/PITR и реальные restore drills ждут `G-07`,
  disposable environment и для PROD `G-11`.

### L5 — CRYPTO-01/C0 packet, umbrella `#898`

- Outcome: принятый data-class/threat/control matrix, versioned envelope contract, KEK/DEK custody/rotation/recovery
  ADR, performance budget и точный C1 module manifest. Никаких key values.
- Allowed: privacy initiative docs и read-only discovery. Exact census:
  `code-search "s3 upload multipart hls presigned system_settings encryption" --repo bcb` и
  `codeq "where media and secrets are stored and read" --repo bcb --k 20`.
- Protected: app/schema/storage workers, secrets, live buckets/DB. Не писать crypto primitives.
- Checks: threat completeness, wrong-tenant/tamper/truncation test-vector plan, independent critical security review.
- Gates: C0 можно подготовить сейчас; его acceptance требует `G-06/G-13/G-14` и external reviewer. Только после
  acceptance создаётся exact C1 child task.

### L6 — PR-03A0 close current admin hard-delete, child scope taskdb `#905`

- Existing gap: `POST /api/doctor/clients/[userId]/permanent-delete` доступен в admin mode и вызывает
  `runStrictPurgePlatformUser`, который необратимо удаляет client DB data и S3 objects. Это противоречит уже
  принятому owner invariant: сначала recoverable period (ориентир 90 дней), предупреждения и реактивация.
- Outcome: census/checker сначала воспроизводит текущий FAIL, затем administrative hard-delete временно
  fail-closed отключён в API/UI/операционных entrypoints до утверждённой retention state machine; repository после
  correction проходит negative invariant. Strict-purge core остаётся в коде как будущий controlled primitive.
- Перед file lock: `code-search "permanent-delete runStrictPurgePlatformUser purge-by-id" --repo bcb`. Candidate
  scope: doctor permanent-delete route+test, `DoctorClientLifecycleActions.tsx` и связанные card/page props/tests,
  `apps/webapp/scripts/user-phone-admin.ts`, новый standalone checker/test, minimal package/CI wiring и privacy log.
  Executor фиксирует exact paths и единый disable/gate contract до `doing`; второй purge mechanism запрещён.
- Protected: strict-purge implementation/DB+S3 cleanup semantics, archive behavior, media pending-delete cleanup,
  schema, deletion timers/jobs, billing, emails, export и retention state machine. Media pending-delete остаётся
  отдельным resource cleanup и не классифицируется как account purge.
- Checks: первый census/checker run ожидаемо FAIL на текущем route/CLI; после correction API не вызывает purge,
  destructive UI action отсутствует, operational entrypoint fail-closed, checker PASS. Negative fixture возвращает
  FAIL; targeted route/UI/script tests + typecheck/lint и один independent audit.
- Gate: owner решение отключить immediate hard-delete уже зафиксировано; `G-03` не нужен для safe disable, потому
  что slice ничего не удаляет и не задаёт срок. Любая 90-day state machine, notification/export/schema/timer/purge
  logic остаётся blocked до PR-02/G-03 и отдельного manifest.

### L7 — SEC-03 contract/census design, taskdb `#908`

- Outcome: typed field/event vocabulary and generated high-risk endpoint/process inventory proposal without
  clinical payload; no runtime emission/store.
- Allowed: privacy initiative docs и новый standalone census/checker only after exact path lock. Discovery:
  `code-search "clinical audit event audit log access patient" --repo bcb`.
- Protected: endpoint adapters, DB/schema, audit repository and active D4 files.
- Checks: endpoint classes covered or explicitly excluded; forbidden payload field/redaction fixtures; architecture
  review. Runtime implementation remains `active_dependency` on stable D4 and approved retention/access model.

### L8 — NTF-01/N0 notification egress census, taskdb `#913`

- Outcome: producer → resolver → queue → dispatch → provider → in-app map for chat/program notes/reminders/tasks/
  booking/payment/broadcast/intake/support/operator events; every event has message class and `T0–T3` tier.
- Allowed: privacy/mobile initiative docs and read-only discovery. Current notification architecture docs are
  baseline facts and receive only a target-plan pointer until runtime changes.
- Protected: application routing, bot scripts, settings UI, queues/schema, active SaaS/Product UX/billing/DNA files.
- Checks: no unclassified family; current copied fields/retention/tests cited; independent architecture/security
  review; exact N1/N3 child scopes proposed without code mutations.

### L9 — LOG-01/L0-L1 immediate log guard, taskdb `#914`

- Outcome: exact log/queue census; raw SQL/params and unknown message/body payload no longer printed by scoped DB/
  logger error paths; safe fingerprint/code/correlation remains.
- Before file lock: code-search `db query error sql params logger console.error delivery_attempt_logs payload_json`
  and exact runtime/logger tests. Do not absorb queue schema/retention or active notification feature code.
- Checks: captured stdout/stderr and nested error fixtures with `SENSITIVE_TEST_MARKER`; targeted tests, lint/typecheck,
  independent security audit. Real production logs and payload values are not read in this DEV slice.

## Разрешённый scope

Только файлы этой инициативы и read-only команды. Любая правка application/deploy/active plans вне scope.
Launch manifest является разрешением оркестратору сформировать отдельный isolated worker scope. Если manifest
содержит census command вместо exact path, исполнитель сначала возвращает exact list и только затем получает
`doing`; это не повод сканировать/править весь репозиторий.

## Checks

- code-search по каждому заявленному control и точечная ссылка на источник;
- `git diff --check` и relative-link validation;
- сверка taskdb непосредственно перед закрытием, чтобы scope не устарел.

## Выход

- Реестр полный, у каждого gap один owner/stage/status из новой пятизначной taxonomy.
- Ни одна active stage не получила незапрошенный diff.
- Владелец получает единый список `owner_or_legal_gate`; решения фиксируются только в каноническом gate sheet.
