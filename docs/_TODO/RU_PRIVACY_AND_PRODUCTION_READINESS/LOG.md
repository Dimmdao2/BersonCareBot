# Execution log

## 2026-07-22 — current owner/legal action register reconciled

- `OWNER_ACTIONS.md` §0 now separates inputs needed now, inputs needed only before their stage, lawyer/PDn decisions,
  TEST authorization and production `G-11` windows. The full `G-01…G-15` registry remains in
  `OWNER_AND_LEGAL_GATES.md`; open gates are not all presented as immediate work.
- Stale taskdb owner questions `#90/#206/#213/#215/#821` were removed from the current waiting set without deleting
  their scope. Current BCB owner-waiting denominator is exactly `#796/#848/#881/#899`; future TEST/production gates
  are raised only with a current SHA, packet and runbook.
- No code, DB, host, provider, TEST/PROD or deploy action was performed.

## 2026-07-21 — NTF-01/N1A auth-channel policy repository closure (`#929`)

- Integrated and pushed through `00d3b2240`: four platform-global Email/SMS/Telegram/MAX auth/binding flags,
  platform-admin controls, public fail-closed discovery/UI and webapp/integrator execution guards. Existing provider
  configuration, bindings, password email login and dev bypass remain intact; product notifications are unchanged.
- The first whole-stage audit found two P1 gaps: request-contact bypassed the TG/MAX policy and SMS still depended on
  the legacy fallback flag. One coherent correction closed both server paths; the re-audit found the remaining
  disabled-MAX Mini App bot fallback. The second/final bounded correction removed it. Terminal re-audit passed
  `0 P0 / 0 P1 / 0 P2`.
- Evidence: email `128`; integrated webapp `62` and integrator `32`; UI `92` plus one existing skip; correction
  webapp `28`, integrator `7`, final Mini App `8`; affected typechecks, scoped lint and diff checks passed. Full CI
  was not repeated and remains the accumulated milestone gate.
- No DB apply, deploy, TEST/PROD, provider call, real send or binding deletion occurred. Taskdb `#929` remains
  `doing` until milestone full CI and live owner/TEST acceptance.

## 2026-07-21 — U9A platform-settings prerequisite integrated (`#929`)

- Integrated `7c9d94bea` + `f48c4b8af`: dedicated no-organization platform principal/guard, whitelisted global
  settings API and the existing service/UoW/audit/mirror path.
- One correction closed the first audit's Drizzle role setup/cleanup, guard-matrix and root-gate findings. It also
  kept mirror fallback reliable through an exact-key SECURITY DEFINER function without direct platform-role outbox
  DML. Terminal re-audit passed `0 P0 / 0 P1 / 0 P2`.
- Evidence: db-principal `7/7`, targeted webapp `82/82`, typecheck, scoped lint, static DB gates and a disposable
  PostgreSQL 16 real-role matrix. No working DB, role apply, deploy, TEST/PROD, provider or real send was touched.
- N1A remains active: Email/SMS/Telegram/MAX policy flags, UI/discovery and server enforcement are not U9A scope.

## 2026-07-21 — N1B editor boundary synchronized with independent Tiptap task (`#930/#931`)

- `#931` owns only current markdown write-surfaces and preserves markdown storage. It is independent and cannot
  block N1B or replace the existing notification-template store/editor.
- N1B keeps simple variable-based notification content plus platform/org resolution. Email presentation is rendered
  through a fixed server-owned safe envelope; the organization changes typed branding fields/layout choice only.
  Raw HTML/CSS, external resources and a visual email builder are not accepted inputs.
- The prior intermediate wording that allowed editing HTML source was replaced. No runtime code, DB, provider,
  deploy, TEST/PROD or real send changed in this documentation correction.

## 2026-07-21 — NTF-01/N1A launch checkpoint and U9 platform-settings dependency (`#929`)

- Current code confirms `/api/admin/settings` is deliberately clinic-membership-scoped. Replacing its guard would
  mix platform and organization authority, while `requirePlatformOperationsPage()` is page-only and leaves a
  bootstrap DB principal which cannot write restricted settings in locked mode.
- N1A therefore consumes one bounded U9 prerequisite: dedicated platform-operations API guard, least-privilege
  global-settings DB principal/role and a platform-only whitelisted API. It reuses the existing registry,
  `systemSettings.updateSetting`, transaction/UoW, audit and integrator mirror; no org borrowing, generic null-org
  `app_staff`, direct SQL, route-level sync or second settings store is allowed.
- The subsequent four flags remain exactly Email OTP, SMS OTP, Telegram auth/link and MAX auth/link. Discovery and
  crafted execution are both denied before identity lookup; provider readiness is separate; bindings and existing
  SMTP/SMSC/bot modules remain stored. Repository-only work is authorized; DB apply, deploy, TEST/PROD, env, real
  sends and binding/account mutation are not.
- Base `3ee1537bd`; taskdb `#929=doing`. Targeted auth/role/settings tests, typecheck and scoped lint are the step
  gate; full CI is deferred to the accumulated milestone. This prerequisite does not complete U9/#808.

## 2026-07-21 — NTF-01/N1 central egress guard integrated (`#913`)

- Integrated `671ac2127` on `feat/doctor-ui-rebuild`. Central typed policy runs before redirect, adapter selection,
  provider or delivery-attempt logging. Telegram/MAX accept only auth code/contact handshake; Email/SMS accept only
  auth code; Web Push accepts the canonical product classes. Generic relay cannot forge auth capability.
- Persisted outgoing-delivery and legacy booking rows cannot restore caller-supplied auth markers. Policy denial is
  terminal without retry or payload/body logging. Existing callback/edit/delete intents remain until N4.
- The first critical audit reported seven P1s. One coherent correction closed all seven; terminal audit
  `bcb-ntf01-n1-terminal-audit-20260721` passed `0 P0 / 0 P1 / 0 P2`. The audited patch id
  `b5212dd13df01d0a3b37a895ff516147d0252db8` was unchanged after rebase onto current owner docs.
- Validation: 13 targeted Vitest files / 136 tests PASS; integrator typecheck PASS; integrator lint PASS; diff-check
  PASS. Full CI was intentionally not repeated. No DB/schema/provider/env/deploy/TEST/PROD/queue drain or real send.
- SMS OTP modules/settings were retained. N1A `#929` now owns platform admin channel flags; N1B `#930` owns the
  existing template-editor evolution. N3/N4/N6 and owner/legal gates remain open.

## 2026-07-21 — Owner additions: platform auth-channel policy and template editor (`#929/#930`)

- Source census confirmed there is no independent Email/SMS/Telegram/MAX auth enable policy. Provider configuration
  is mixed with behavior; public SMS is hard-disabled in one path; `sms_fallback_enabled` is a legacy doctor/global
  compatibility setting. N1A now owns four global admin flags, public discovery plus server enforcement and a
  compatibility-preserving migration. Existing providers/settings/bindings are retained.
- Source census also found the existing notification-template base: `notifTemplatesService`, admin/doctor routes,
  `notif_template:*` global-fallback/per-org settings and the schedule editor. N1B extends this mechanism rather than
  creating a parallel roadmap/store. It separates platform defaults from org owner/admin overrides, adds per-channel
  safe-variable enforcement and email HTML+plain/messenger rendering, and binds concrete builders only in N3.
- Branding presentation is entitlement/readiness-gated; custom sender remains a separate branding-domain contract.
  Individual per-specialist template overrides remain undecided and are not part of the first foundation slice.

## 2026-07-21 — Owner ruling: exact safe email/push rows

- Appointment reminders may be delivered by an exact email template with date/time, specialist, location/online
  mode and a safe app link; diagnosis, complaint and arbitrary clinical/free text are forbidden there.
- Exercise reminders are generic app push; message/comment events use neutral push and optionally neutral email
  without the message body, patient name or clinical payload. These are subtype/template allowlist rows, not a
  generic email relay permission.
- Platform SMS remains no product fallback. A later specialist-funded SMS provider integration is separately gated.
- N1 still establishes typed default-deny topology only; concrete appointment/exercise/conversation builders and
  their safe-copy tests remain in their N3 children.

## 2026-07-21 — Owner correction: booking reminder defaults are not fixed `24h/2h`

- `24h/2h` in the N0 census names the current legacy jobs only. Target ownership is now explicit: each specialist
  configures the reminder choices/default proposed for their appointments; after confirmation the client may change
  or disable reminders per concrete appointment, and that per-appointment choice wins.
- N1 remains a transport-policy stage and does not change reminder scheduling. N3/booking cutover must not freeze
  the legacy timing; the product authority is synchronized in `OWNER_REVIEW_2026-07-18.md` §15.
- Current code already has `AppointmentReminderSettingsSection`, but its raw numeric offset input and `per_org`
  setting are not the final UX/ownership. The later booking-reminder contract must reuse that surface, replace the
  technical input with a human-readable selector and add the per-specialist/per-appointment ownership explicitly.

## 2026-07-21 — NTF-01/N1 central egress policy launch checkpoint (`#913`)

- N0 integrated and pushed at `8d693b5d4`; the retained C5A evidence branch has no changed-file overlap with N1.
  N1 is one integrator-only high-security slice: typed auth capabilities, fail-closed external-channel policy at the
  existing dispatch chokepoint, auth/request-contact preservation and a direct-bypass checker.
- The exact file lock is recorded in the stage. No webapp product route/UI, provider client, DB/schema, queue drain,
  runtime setting, TEST/PROD/host or real send is authorized. `MOB-O9`, `G-04B`, account-service templates and later
  cutover remain open; full CI waits the next cross-plan milestone unless repo-level shared contracts are introduced.

## 2026-07-21 — NTF-01/N0 notification-egress census (`#913`, docs-only)

- Completed the existing N0 checklist in `stages/NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md` in place. The census
  has no unclassified required family: chat, program notes, patient reminders/warmups, specialist tasks, booking
  lifecycle/24h/2h/payment, broadcasts, intake, public/patient support, account services, operator/security and
  auth/login/bind are each classified with producer/resolver/queue/dispatch/provider/in-app evidence, status,
  class and `T0–T3` safe-default tier.
- Canonical current-runtime evidence is `NOTIFICATION_CHANNELS`, `OUTGOING_DELIVERY_QUEUE` and
  `PATIENT_SUPPORT_CHAT_INBOX`; target policy is `NTF-01` under decided `G-15`. `MOB-O9` and `G-04B` remain open:
  the field-level preview matrix, service email/SMS allowlist and Apple/Google/APNs/FCM legal review were not
  inferred or closed.
- `codeq` was attempted first but its semantic backend returned `no DSN (secrets/storage.env)`; lexical
  `code-search`, scoped exact search and targeted repository reads then traced the relay, durable queue, worker,
  adapters, canonical in-app records and family tests. No PII/secret values, live logs, environment, DB, host,
  provider or network state were accessed; adapter presence is explicitly not treated as PROD activation.
- The stage now contains exact, non-overlapping proposed manifests for N1 and N3 family slices, with owned file
  scopes, dependency SHA, gates, acceptance and risk. They are triage input only: no taskdb task was created or
  updated, no active SaaS/Product UX/billing/FIO/Doctor DNA plan was edited, and no N1+ runtime code was changed.
- Validation: every cited source path exists; relative Markdown links resolve; `git diff --check` is clean. No
  tests, lint, build, full CI, DB/server/network/deploy/send command was run because this was a docs/read-only
  census.
- The first independent N0 audit (`bcb-ntf01-n0-audit-20260721`) found one owner-mapped P1: the booking 24h/2h
  `message.deliver` jobs in `integrator.rubitime_create_retry_jobs` were absent from the queue map and booking child
  manifest. The bounded correction adds their retained field categories, state/retry/dispatch path, no-live-state
  boundary and exact queue/adapter/executor ownership. No second correction scope was opened.
- Terminal re-audit `bcb-ntf01-n0-final-audit-20260721` passed `0 P0 / 0 P1` with no P2 recommendations. It verified
  the complete required-family census, current/target separation, legacy queue cutover inventory, exact
  non-overlapping manifests, source/link validity and the continuing `MOB-O9`/`G-04B`/later drain gates. N0 is
  engineering-closed; N1 is the next repository runtime slice and no production activation or cutover is implied.

## 2026-07-21 — PR-01 factual register independent audit PASS (`#899`)

- Commit `999099355` is patch-equivalent to the audited worker commit `9ea341e47` after rebase onto the current
  feature branch. The one permitted independent docs-stage audit
  `bcb-pr01-899-processing-register-audit-20260721` passed `0 P0 / 0 P1 / 0 P2`.
- The audit confirmed all `34` rows have valid source paths, an accountable/decision owner and exactly one PR-00
  taxonomy status; no parallel roadmap/register, PII/secret values, runtime/production claims or legal conclusions
  were introduced. Relative links and scoped diff-check passed.
- Engineering work for the factual packet is complete. `G-01/G-02/G-03/G-04/G-04A/G-05/G-05A` remain open for
  dated owner/legal/PD-responsible provenance; no DEV/TEST/PROD, DB, host, deploy, external-provider or legal action
  was performed by this stage.

## 2026-07-21 — PR-01 factual processing register (taskdb `#899`, docs-only)

- Expanded the existing `stages/PR-01_PROCESSING_REGISTER.md` in place; no parallel register or roadmap was
  created. Exact writable scope: that stage, `OWNER_AND_LEGAL_GATES.md`, `OWNER_ACTIONS.md` and this append-only log.
- Evidence method: repository-only code-search/codeq attempt followed by targeted read of schema, adapter,
  configuration, S3, payment, queue, logging, retention and backup sources. The register records only source paths
  and category-level engineering facts; it contains no real PII, account identifiers, secret values, connection
  strings, live logs or runtime queries.
- Covered factual categories: account/auth and organization ownership paths; appointments; clinical record and
  patient-file/health candidates; DB `public`/`integrator` boundary; S3/files; logs/queues/retries/backups;
  Telegram, MAX, email/SMTP, SMS/SMSC, payment, Selectel/S3 and OAuth/Google Calendar candidate surfaces; and a
  secret-name/access-surface inventory without values.
- Open, not closed: `G-01`, `G-02`, `G-03`, `G-04`, `G-04A`, `G-05`, `G-05A` and related operations/security gates.
  In particular, live provider activation, contracts, regions/transborder flows, subprocessors, RKN notice status,
  legal roles/bases, consent, retention periods, actual DB grants, backup/offsite state and production topology are
  unconfirmed and assigned to owner/legal/operations review.
- Not done: no DB/host/ENV/secret/log inspection; no DEV/TEST/PROD action; no network, deploy, migration, app/schema
  change, taskdb mutation, active SaaS/Product UX/FIO plan edit, external message or provider contact. `O-02` remains
  the owner-only Selectel written-answer action; public provider pages do not close `G-04A`.

Append-only журнал. Планирование не переводит ни один implementation stage в `doing`.

## 2026-07-19 — initiative authored

- Прочитаны core docs, plan/orchestration rules, SaaS sequence/roadmaps, активные логи и taskdb.
- Зафиксированы защищённые active scopes: D3/D4, S4/S5, billing, TEST fixes, Product UX и Doctor DNA.
- Подтверждено: Security CI решения уже сохранены коммитом `7a3b0a840f` и taskdb `#881`, но jobs/configs ещё
  отсутствуют.
- На dev-хосте найдены Gitleaks/Semgrep/Trivy/Garak; ZAP script отсутствует. Это не production inventory.
- Подтверждён канонический `deploy/postgres/postgres-backup.sh`: unified dump, retention и health tick уже есть;
  DR-план усиливает его, а не создаёт второй backup path.
- Создан отдельный roadmap без изменения активных планов и без production mutations.
- В taskdb созданы draft-задачи `#898–904`, все с `auto_ok=false`; `#881` синхронизирован техническим уточнением
  по ZAP hosted-runner allow-window.

Проверки планирования записываются отдельной следующей записью после независимого аудита и link validation.

## 2026-07-19 — owner direction: recoverable account deletion

- Владелец зафиксировал обязательный product invariant для `PR-03`: удаление аккаунта не удаляет клиентские
  данные и файлы немедленно; сначала действует recovery window с возможностью реактивации, затем контролируемый
  purge/anonymize.
- Предварительный product target окна — 90 дней. Точная retention matrix и legal exceptions остаются открытой
  частью `G-03`; это уточнение не подменяет owner+legal acceptance и не разрешает ранний DB/API/job implementation.
- Техническая выгрузка данных отложена из первого deletion/retention slice и остаётся будущей DSAR capability.
- Изменение синхронизировано только с существующими `PR-03` и `OWNER_AND_LEGAL_GATES`; новый roadmap/task не создан.
- Последующее уточнение владельца: purge не может быть тихим. До него обязательны несколько email reminders и
  возможность скачать export bundle с исходными файлами практики/пациентов и исходными видео; внутренние HLS-
  производные/previews/служебные transcripts не считаются отдельными пользовательскими originals.
- Recovery/reminder/export/purge policy должна быть отражена в оферте/договоре и privacy policy. Export остаётся
  технически отложенным до `PR-03`, но без него необратимый purge не может быть включён.
- Large-export UX может быть реализован после первого production launch в пределах recovery window. Для объёмов в
  несколько гигабайт требуется возобновляемая/частичная загрузка или эквивалентный надёжный механизм; до его
  готовности purge остаётся выключенным, а 90-дневный target не запускает удаление автоматически.

## 2026-07-19 — independent audit correction round 1

- Первый auditor process упал по capacity; повторный read-only аудит выполнен отдельным plan reviewer.
- Исправлен major: `G-05`/уведомление РКН перенесено в немедленный PR-01; добавлен `G-05A` interim containment
  для новых health-data purposes/vendors/org onboarding до legal decision.
- Исправлен major: consent, data rights/retention, clinical audit и governance/incidents разделены на самостоятельные
  stages/tasks `#907/#905/#908/#906` с отдельными checks/audit. Первичные draft-задачи `#902–904` заменены
  задачами `#907–909`, чтобы их основной block не содержал устаревшие имена файлов.
- Исправлены minor: официальный URL портала РКН и явный allowed/out-of-scope gate во всех stage manifests.
- Correction re-audit: PASS после исправления stale stage references.
- Validation: 18 файлов инициативы прошли relative-link check; `git diff --check` clean; taskdb blocks/paths
  сверены после замены первичных draft-задач.

## 2026-07-19 — real PROD, encryption and migration plan expansion

- Выполнен read-only audit текущего PROD и Selectel S3 без вывода значений секретов/ПДн. Зафиксированы: plain
  ext4 root и swap; PostgreSQL/secret/log/backup data на root; 93 plaintext dumps с небезопасными modes; private,
  но не client-side encrypted S3; disabled versioning/Object Lock; root/deploy/systemd/firewall/audit gaps.
- Добавлен обезличенный [`CURRENT_PROD_BASELINE_2026-07-19.md`](CURRENT_PROD_BASELINE_2026-07-19.md). Provider-side
  physical encryption оставлено `unknown` до письменного ответа Selectel.
- Добавлен [`OWNER_ACTIONS.md`](OWNER_ACTIONS.md): конкретные действия `O-01…O-12`, сроки, evidence, тикет Selectel,
  brief внешнему специалисту и запреты на ручной in-place/cutover flow.
- Добавлен `CRYPTO-01`: threat/key ADR, versioned envelope, S3 multipart/HLS client-side encryption, legacy migration,
  selected DB field/settings protection и key rotation/recovery.
- Добавлен `INFRA-01`: новый параллельный encrypted VPS, disposable reboot/recovery proof, dark target, phased
  cutover/rollback, secret rotation и decommission старого host/copies.
- Исправлен недостижимый Selectel S3 gate: Bucket Encryption, Lifecycle и Public Access Block не считаются
  поддерживаемыми AWS controls; plan требует client-side encryption, actual anonymous deny, application retention,
  version-aware deletion и отдельный backup Object Lock proof.
- Legal audit усилил `G-02`: обычный checkbox не объявляется достаточным письменным согласием на health data;
  форму/ЭП/основание/представителей/legacy data до кода определяет юрист. Добавлены `G-04A`, `G-06A`, `G-13`, `G-14`.
- Уточнено: 24/72 workflow относится не к любому event, а к применимой установленной неправомерной/случайной
  передаче/доступу с нарушением прав; добавлен ГосСОПКА gate. 90 days/reminders/resumable export отмечены как
  product/contract commitments, не буквальное требование 152-ФЗ.
- Active SaaS/Product UX/billing/DNA/FIO plans и логи не менялись. `CRYPTO-01`/`INFRA-01` остаются sub-stages
  `#898/#900/#901` до owner review; implementation tasks создаются позже с exact file scope и stable D4/S5-7 SHA.

## 2026-07-19 — final plan audit correction

- Независимый infra/plan auditor дал FAIL из-за риска stale-DB rollback и четырёх major gaps; исправления выполнены
  одним интегрированным docs-pass без второго nit-picking audit round.
- `INFRA-01` теперь запрещает возврат DNS на stale source после первой записи на target: target writers freeze →
  новый encrypted backup/delta → restore rollback host → invariants → только затем traffic switch.
- Убран циклический gate: `I0-I4` не ждут `O-10/G-11`; production window требуется только `I5` после rehearsal и
  `PR-04A`.
- `PR-03` разделён на обязательный pre-launch `PR-03A` (manual requests, retention, purge disabled) и pre-purge
  `PR-03B` (export/reminders/purge/offboarding automation). Launch deferral не закрывает инициативу целиком.
- `DR-01` получил отдельную вторую российскую failure domain для encrypted S3 media ciphertext + manifests и
  сценарий потери bucket/account, а не только versioning в primary bucket.
- Owner wording исправлен: необходимость certified СЗИ/СКЗИ определяет внешний специалист; владелец заказывает
  заключение и принимает бюджет/остаточный риск. Отдельный secrets platform не запрещён до crypto ADR.
- Оценка `CRYPTO-01` увеличена до 3–6 недель; общая инженерная оценка — 13–22 человеко-недель.

## 2026-07-19 — explicit EDR/HIDS decision gate

- По вопросу владельца подтверждён gap: `auditd`, central logs и threat-model review были записаны, но отдельного
  обязательного решения по Wazuh/EDR/HIDS не было.
- Добавлены `G-06B` и `O-08A`: до target acceptance нужно явно выбрать `adopt` либо `not required with compensating
  controls`; неизвестное/подразумеваемое решение не проходит `PR-04A`.
- Wazuh не выбран заранее. Агенты сравнивают coverage/privileges/load/RU storage/operations, проверяют кандидата на
  disposable VPS; при adopt manager/sink находится отдельно от единственного PROD, alerts имеют owner/SLA.

## 2026-07-19 — owner activation and PR-00 DEV execution registry

- Владелец активировал юридико-технический план: всё безопасно реализуемое в repository/DEV выполняется сейчас;
  production-host encryption/hardening/secrets, реальные данные и cutover остаются на подготовку нового PROD.
- Зафиксирована граница: перенос host controls не откладывает application security, consent, audit, retention,
  crypto или Security CI. Они стартуют сразу после собственных D4/S5/legal gates.
- Taskdb и foundation evidence сверены на integration SHA `2f8147e91`: S5-0…S5-3 технически done/tested/audited,
  owner acceptance/provenance отдельно подтверждает lead; D3 остаётся blocked на доказанном 16/17 TEST smoke;
  D4 и S5-4…S5-7 не закрыты. Payment retention зависит от C5B `#844/#845`, а `#751` — C5A.
- `PR-00` переведён на taxonomy `covered / active_dependency / executable_now / owner_or_legal_gate /
  prod_host_later` и получил launch manifests для SEC-01, PR-01, repository SEC-02/DR-01, CRYPTO C0, negative
  purge guard и SEC-03 contract/census design.
- Production FIO backfill сохранён в едином финальном full cutover: ручные решения владельца не пересчитываются,
  parser retirement идёт только после apply/evidence. Эта инициатива не создаёт параллельный FIO migration.
- Никаких application/schema/DB/deploy/TEST/PROD mutations в PR-00 не выполнялось.

## 2026-07-19 — PR-00 audit correction: existing account purge

- Independent audit нашёл существующий reachable account hard-delete: doctor admin-mode permanent-delete route
  вызывает `runStrictPurgePlatformUser` и необратимо удаляет DB+S3 data. Предыдущее утверждение «purge уже
  недоступен» было фактически неверным и заменено existing-gap classification.
- Owner decision уже однозначен: immediate client hard-delete запрещён. `PR-03A0` теперь является цельным DEV code
  stage: baseline checker ожидаемо FAIL → administrative API/UI/operational entrypoints fail-closed → checker PASS.
- Strict-purge implementation и media-specific pending-delete cleanup сохраняются. 90-day state machine, emails,
  export, schema, timers и новый purge flow остаются за PR-02/G-03 и не проектируются в correction.
- Уточнены evidence labels: S5-0…S5-3 — technical done/tested/audited до отдельного lead confirmation owner
  acceptance; payment-retention dependency — C5B `#844/#845`, не C5A `#751`.

## 2026-07-19 — owner direction: native app push and messenger auth-only

- Владелец зафиксировал новый product boundary: Telegram/MAX остаются только для login/bind codes; reminders и
  product notifications переходят в push приложения. Полная нейтрализация всех push-текстов отвергнута.
- Владелец отверг blanket masking: push должен сохранять разумный полезный контекст. Агенты предложили tiered safe
  default: routine appointment/payment/subscription/reminder details остаются полезными, а arbitrary chat/clinical/
  intake/task/file/secret payload — внутри authenticated app. Exact event/field matrix ждёт `MOB-O9/G-04B`.
- Технический audit подтвердил текущий gap: Web Push сейчас лишь primary, а Telegram/MAX/email/SMS остаются fan-out/
  fallback в chat, reminders, booking, broadcasts, tasks, intake/support и operator paths; часть booking push зависит
  от messenger jobs.
- Добавлены `NTF-01` и `LOG-01`: central egress guard, feature/bot/settings/queue cutover и устранение raw SQL params/
  message payload copies из logs/attempts/retries. Active SaaS/S5/Product UX/billing/Doctor DNA планы не менялись.
- Уточнение владельца про полноценное приложение вынесено в отдельный
  [`NATIVE_MOBILE_APP_INITIATIVE`](../NATIVE_MOBILE_APP_INITIATIVE/README.md): Capacitor ADR, mobile session,
  APNs/FCM, deep links, device/store/privacy gates. Web Push теперь migration/browser transport, не конечная native
  архитектура.
- `G-15` закрывает product direction; `G-04B` остаётся обязательным внешним review Apple/Google/APNs/FCM. Нельзя
  утверждать, что все push copies физически остаются в РФ: provider получает token/metadata и разрешённый payload.

## 2026-07-19 — PR-03A0 worker: immediate account purge fail-closed

- На base `d1fad7c65` добавлен статический account-purge checker. Первый запуск до runtime correction ожидаемо дал
  `FAIL`: legacy admin route вызывал strict purge, UI показывал destructive action, `purge-by-id` вызывал strict
  purge, а `reset-user` напрямую удалял `platform_users`.
- Legacy `POST .../permanent-delete` после существующих admin/workspace guards теперь всегда возвращает
  `409 account_purge_disabled`; destructive UI action и вызов endpoint удалены. Архив/возврат из архива сохранены.
- Operational `reset-user` и `purge-by-id` сохранены как распознаваемые команды, но fail-closed до принятой
  retention state machine. Остальные ограниченные repair/reassign команды этого CLI не менялись.
- `runStrictPurgePlatformUser`, `platformUserFullPurge` и `internal/media-pending-delete/purge` не менялись. Checker
  отдельно требует наличие strict core и resource-specific media cleanup, поэтому PR-03A0 не выдаёт себя за
  отключение удаления отдельного media resource.
- PASS: `pnpm --dir apps/webapp run check:account-purge-disabled`; PASS negative fixture:
  `pnpm --dir apps/webapp run check:account-purge-disabled:test` (2 tests); PASS targeted Vitest permanent-delete +
  workspace audit (2 files / 60 tests); PASS webapp typecheck; PASS scoped ESLint; `git diff --check` clean.
- Не делались schema/DB/DEV DB/TEST/PROD/deploy, 90-day state, timers/jobs, emails, export, offboarding или изменения
  strict-purge/media cleanup semantics. Независимый security/data-lifecycle audit и integration commit выполняет lead.

## 2026-07-19 — PR-03A0 correction round 1: integrator account-delete bypasses

- Critical audit подтвердил два оставшихся operational bypass: `integrator-clear-phone` удалял integrator account
  и связанные Rubitime records/events, а `integrator-purge-user-id` выполнял прямой account delete с CASCADE.
- Обе команды теперь используют тот же fail-closed `ACCOUNT_PURGE_DISABLED`, что `reset-user` и `purge-by-id`;
  destructive helper/call graph и account-level SQL удалены. Ограниченные webapp projection/message/appointment
  cleanup и reassign не расширялись и не переклассифицировались как account purge.
- Checker требует fail-closed dispatch всех четырёх command names, запрещает их прежние вызовы и account-delete SQL
  во всех operational scripts. Negative fixture теперь отдельно доказывает FAIL для integrator delete call + SQL.
- PASS после correction: checker; node test 3/3; scoped ESLint; webapp typecheck; `git diff --check`. Strict core,
  `platformUserFullPurge` и media pending-delete по-прежнему имеют zero diff. DB/TEST/PROD/deploy не выполнялись.

## 2026-07-19 — LOG-01/L1 immediate logging guard (taskdb `#914`)

- `apps/integrator/src/infra/db/client.ts`: убраны raw `sql`/`params` и duplicate `console.error(err, sql, params)`
  dumps из всех `query`/`tx` error paths (query, tx-connect, tx-query, tx-rollback, pool `error` event). Заменены на
  безопасный контекст: `queryFingerprint` (sha256 от текста запроса, 16 hex), `pgCode`/`pgClass` (SQLSTATE, если у
  ошибки валидный `code`) и `dbPrincipalSource` (уже существующий ambient DB-principal source — без изменения
  `DbPort`/`kernel/contracts`). Единая `logDbError()` логирует через `logger`, а если сам логгер бросает — safe
  console fallback печатает только `queryFingerprint`/`pgCode`/`pgClass`, никогда исходную ошибку/sql/params.
- `apps/integrator/src/infra/observability/logger.ts` и `apps/webapp/src/infra/logging/logger.ts`: `serializeError`
  больше не прокидывает `err.cause`/`e.cause` целиком. Добавлен `sanitizeErrorCause` + `redactUnknownErrorShape` —
  рекурсивный redaction по имени ключа (token/authorization/cookie/secret/apikey/password/phone/sql/query/param(s)/
  payload/body/message/detail/hint/cause/filename/providerError/value(s)) на любой глубине вложенности. Логика
  дублирована per-app (не единая cross-package абстракция), как разрешено launch-manifest.
- `apps/media-worker/src/logger.ts`: тот же `serializeError`/redaction contract добавлен в `createLogger` (`err`/
  `error` serializers) — до этого был bare `pino()` без serializers, поэтому `log.error({ err })` в `main.ts` мог
  напечатать `err.cause` целиком (own-enumerable свойства проходят JSON-сериализацию pino по умолчанию). `main.ts` и
  другие DB/queue файлы media-worker не менялись.
- Новые executable marker-negative тесты (captured actual rendered stdout через `process.stdout.write` spy, не
  только redact-конфигурация): `apps/integrator/src/infra/db/client.test.ts` (query error, tx query error, logger-
  throws console fallback), `apps/integrator/src/infra/observability/logger.test.ts`, `apps/webapp/src/infra/logging/
  logger.test.ts`, `apps/media-worker/src/logger.test.ts`. Все используют `SENSITIVE_TEST_MARKER_bcb914` в SQL params
  и в nested `cause.{body.message, providerError.{message,phone}, filename, token}`; assert marker отсутствует в
  рендере, а `pgCode`/`requestId` остаются видимы (safe diagnostics preserved). **Исправлено correction round 1
  (см. ниже)**: изначально top-level `Error.message` (`"outer failure"`) целиком проходил в рендер — это была
  отдельная утечка от nested-cause redaction.
- **Не тронуто:** `dispatchPort.ts`, `delivery_attempt_logs`, `outgoing_delivery_queue`, queue/retry/dead-letter
  schema, retention/cleanup, NTF-01/notification routing, DB migrations, deploy/env/servers, taskdb. Elapsed-time
  instrumentation не добавлена (не было "already available" до этой правки — см. stage doc note).
- PASS: `apps/integrator` full `test` (172 files / 1270 tests) и `typecheck`/`lint`; `apps/webapp` full `test:webapp`
  (1416 files / 8141 tests) и `typecheck`/`lint`; `apps/media-worker` full `test` (14 files / 58 tests) и
  `typecheck`. `git diff --check` clean на изменённых файлах. Независимый security audit ещё предстоит.

## 2026-07-19 — LOG-01/L1 correction round 1: `serializeError` top-level message/stack leak (taskdb `#914`)

- Lead review диффа нашёл gap до independent audit: `serializeError` во всех трёх приложениях по-прежнему
  прокидывал `err.message`/`err.stack` (и `JSON.stringify(err)` для non-Error значений) **дословно** на верхнем
  уровне. Nested-key redaction (`sanitizeErrorCause`/`redactUnknownErrorShape`) защищала только `cause`/вложенные
  поля; сам top-level `Error.message`/`stack` мог содержать raw provider response, SQL detail, patient data,
  телефон, filename, token или body, если они когда-либо оказывались в тексте исключения (например, PostgreSQL
  unique-constraint ошибка вида `Key (phone)=(...) already exists.`). Тесты это маскировали: `serializeError`/
  logger rendered-output тесты во всех трёх апп намеренно использовали безобидное сообщение (`"outer failure"`,
  `"x"`) и assert'или, что оно остаётся видимым — то есть проверяли redaction только вложенных полей.
- Исправление — `SerializedError` теперь safe-by-construction: тип сузился до `{ type; code?; class?; cause? }`.
  Raw `message`/`stack`/`JSON.stringify(err)` больше не попадают в возвращаемую форму ни при каком входе (`Error`,
  error-like object, primitive). Единственное сохранённое диагностическое поле помимо `type`/`cause` — валидированный
  PostgreSQL SQLSTATE `code`/`class` (regex `^[0-9A-Z]{5}$`, первые 2 символа как class), извлекаемый безопасно из
  `err.code`, если формат совпадает; иначе поля просто отсутствуют. Логика (`safePgErrorCode`) дублирована per-app
  (не единая cross-package абстракция), тем же паттерном, что и существующий `sanitizeErrorCause`/
  `redactUnknownErrorShape`. `requestId`/`dbPrincipalSource`/`queryFingerprint`/`pgCode`/`pgClass` в `client.ts`
  остаются sibling-полями лога (не частью `err`) и не менялись.
- Обновлены `apps/integrator/src/infra/observability/logger.test.ts`, `apps/webapp/src/infra/logging/logger.test.ts`,
  `apps/media-worker/src/logger.test.ts`: `serializeError`-юнит-тесты и rendered-output тесты теперь кладут
  `SENSITIVE_TEST_MARKER_bcb914` **одновременно** в top-level `Error.message` (что автоматически попадает и в
  `Error.stack`, т.к. V8 включает message в текст stack trace) и в nested `cause.{body.message, providerError.
  {message,phone}, filename, token}`; assert'ится реальное отсутствие маркера в captured stdout, а не только
  redact-конфигурация. Отдельный тест проверяет, что `code`/`class` (`23505`/`23`) сохраняются как safe explicit
  поля. Прежний assert `expect(s.message).toBe(...)`/`rendered.toContain("outer failure")` удалён — это была
  проверка утечки, а не безопасности. `apps/integrator/src/infra/db/client.test.ts`: `buildSensitiveError()` теперь
  тоже кладёт маркер в top-level `Error.message` (реалистичный PostgreSQL constraint-error текст) — раньше тест
  проверял только nested/nested-SQL пути, не сам DB-driver message.
- **Не тронуто:** `serverRuntimeLog.ts` (`errMessage`/`ServerRuntimeLogResult.message` — pre-existing, отдельный от
  `serializeError` путь, не модифицировался в этом slice; не входил в исходный diff и не относится к найденному
  gap), L2 queues/schema/notification файлы, DB/deploy/prod, `.env.example`/`deploy/env` (git status их не изменял
  сверх уже отмеченного baseline diff — здесь новых изменений нет).
- PASS (targeted only, per correction scope — full package test/lint/build не перезапускались): `apps/integrator`
  `vitest run src/infra/observability/logger.test.ts src/infra/db/client.test.ts` (2 files / 8 tests) и `tsc --noEmit`;
  `apps/webapp` `vitest run src/infra/logging/logger.test.ts src/infra/logging/serverRuntimeLog.test.ts` (2 files /
  6 tests) и `tsc --noEmit`; `apps/media-worker` `vitest run src/logger.test.ts` (1 file / 4 tests) и `tsc --noEmit`.
  `git diff --check` clean на изменённых файлах (в т.ч. игнорируя pre-existing corrupted `.env.example` character-
  device artifacts вне scope этой правки). Независимый security audit по-прежнему предстоит.

## 2026-07-19 — LOG-01/L1 correction round 2: arbitrary `cause` serialization (taskdb `#914`)

- Независимый security audit (`codex`, read-only) дал **FAIL** по P1: во всех трёх сериализаторах
  `sanitizeErrorCause`/`redactUnknownErrorShape` из correction round 1 по-прежнему рекурсивно копировали
  значения всех НЕ-blacklisted ключей и элементов массивов из произвольной формы `cause` — это key-blacklist,
  а не allowlist/safe-by-construction. Synthetic in-memory rendered-output probe аудитора подтвердил утечку
  маркера через `patientName`, `response.data`, элементы массива и enumerable-свойства кастомного `Error`
  (любой ключ вне жёстко заданного blacklist проходил как есть). Это прямое нарушение LOG-01 L1 requirement
  "не сериализовать неизвестный error/cause целиком".
- Исправление — произвольная сериализация `cause` убрана полностью, а не сужена до более широкого blacklist.
  `SerializedError` теперь закрытая value-free форма: `{ type: string; code?: string; class?: string }` —
  поле `cause` удалено из типа и из возвращаемого значения `serializeError` во всех трёх приложениях
  (`apps/integrator/src/infra/observability/logger.ts`, `apps/webapp/src/infra/logging/logger.ts`,
  `apps/media-worker/src/logger.ts`). Удалены `sanitizeErrorCause`, `redactUnknownErrorShape`,
  `SENSITIVE_ERROR_SHAPE_KEYS`, `normalizeErrorShapeKey`, `isSensitiveErrorShapeKey`,
  `MAX_ERROR_SHAPE_REDACT_DEPTH` — редактирования по имени ключа для `cause` больше нет, потому что самого
  копирования `cause` больше нет. Единственные сохранённые поля сверх `type` — валидированный PostgreSQL
  SQLSTATE `code`/`class` (не изменялись). Logger-level `redact.paths` (`headers.authorization`, `*.token` и
  т.д.) и `client.ts`/`logDbError` — не тронуты, они не относятся к `cause` внутри `err`.
- Обновлены `apps/integrator/src/infra/observability/logger.test.ts`, `apps/webapp/src/infra/logging/
  logger.test.ts`, `apps/media-worker/src/logger.test.ts`: общий `buildLeakyCause()` кладёт
  `SENSITIVE_TEST_MARKER_bcb914` одновременно в top-level `Error.message`/`stack`, nested `cause.body.message`/
  `cause.providerError.{message,phone}`, ранее непроверенные `cause.patientName`, `cause.response.data`,
  элементы массива (`cause.items`) и enumerable-свойство кастомного `Error` (`cause.wrappedError.patientName`
  на `Object.assign(new Error(marker), { patientName: marker })`). `serializeError`-юнит-тест дополнительно
  проверяет `Object.keys(s)` строго равен `['type']` при таком input — доказывает закрытую форму, а не только
  отсутствие маркера. Rendered-output тесты подтверждают отсутствие маркера в фактическом captured stdout при
  сохранении `pgCode`/`requestId`/correlation-полей. `apps/integrator/src/infra/db/client.test.ts` не менялся
  (raw SQL/params/fallback assertions вне scope этой правки, marker-negative assertions там продолжают
  проходить без изменений).
- **Уточнение claim (было неточно в предыдущих записях этого файла и в stage doc):** этот и предыдущие L1
  slices санитизируют только payload сериализатора `err`/`error` (то, что передаётся как `{ err }`/`{ error }`
  в `logger.error(...)`). Caller-supplied Pino message-аргумент (строка `msg` в `logger.error(fields, msg)`)
  — отдельный, несанитизированный путь; этот slice не проверяет и не гарантирует его безопасность.
- **Не тронуто:** `client.ts` raw SQL/params/fallback logic, `serverRuntimeLog.ts`, L2 queues/schema/dispatch/
  retries/retention, C4/SaaS/registration файлы, DB/deploy/env/DEV/TEST/PROD/taskdb. L2 и полный LOG-01 остаются
  open.
- PASS (targeted only, per correction scope): `apps/integrator` `vitest run src/infra/observability/
  logger.test.ts src/infra/db/client.test.ts` (2 files / 8 tests) и `tsc --noEmit -p .`; `apps/webapp`
  `vitest run src/infra/logging/logger.test.ts` (1 file / 5 tests) и `tsc --noEmit -p .`; `apps/media-worker`
  `vitest run src/logger.test.ts` (1 file / 4 tests) и `tsc --noEmit -p .`. `git diff --check` clean на
  изменённых tracked-файлах (`apps/integrator/src/infra/observability/logger.ts`, `apps/webapp/src/infra/
  logging/logger.ts`, `apps/webapp/src/infra/logging/logger.test.ts`, `apps/media-worker/src/logger.ts`).
  Full package test/lint/build не перезапускались (вне scope этой узкой правки). Следующий независимый audit —
  терминальный по этому P1.

## 2026-07-19 — LOG-01/L1 terminal security re-audit PASS (taskdb `#914`)

- Независимый cross-model terminal re-audit
  `bcb-log01-l1-914-codex-terminal-reaudit-20260719` проверил полный L1 diff и предыдущий P1; verdict **PASS**.
- Подтверждены закрытая форма `{ type, code?, class? }` во всех трёх runtime serializers, применение к `err` и
  `error`, marker-negative rendered-output coverage для top-level message/stack, unknown cause keys, массивов и
  enumerable custom Error properties, а также отсутствие raw SQL/params/duplicate console dump во всех query/tx
  error paths integrator DB client.
- Переиспользованы зелёные targeted tests/typechecks correction round 2; read-only auditor сверил их фактическое
  покрытие. Его собственный повтор Vitest не стартовал из-за read-only `.vite-temp` (`EROFS`), что классифицировано
  как ограничение audit sandbox, а не test failure.
- L1 immediate logging guard закрыт. Caller-supplied Pino message strings, `serverRuntimeLog.ts`, L2 queues/retention,
  production cleanup и broad L0/L3 census остаются явно отложенными и не приписываются этому PASS.

## 2026-07-19 — DR-01 repository backup-safety file lock (taskdb `#901`)

- После code-search подтверждён единственный canonical path: `deploy/postgres/postgres-backup.sh`; второй backup
  mechanism не создаётся. Repository-only slice не запускает `pg_dump`/`psql` против реальной БД, не читает
  TEST/PROD env, не создаёт dumps/keys и не меняет cron/host.
- Exact implementation scope: `deploy/postgres/postgres-backup.sh`, один синтетический test harness рядом с ним,
  `deploy/postgres/README.md`, точечные backup-contract абзацы в `deploy/HOST_DEPLOY_README.md`,
  `docs/ARCHITECTURE/SERVER CONVENTIONS.md` и `deploy/env/README.md`, этот LOG и DR-01 stage status.
- Acceptance: default `umask 077`, directories `0700`, final artifacts `0600`; credential-bearing `DATABASE_URL`
  отсутствует в `pg_dump`/`psql` argv; `pg_dump` поток шифруется через `age` до atomic final artifact; checksum и
  partial-file cleanup fail closed; retention учитывает encrypted artifact + manifest как одну backup generation;
  вывод не содержит secret/PII markers.
- Protected: реальные dumps, ключи/recipient values, cron, TEST/PROD DB/S3/host, offsite/restic/PITR/restore drill,
  `deploy/db/backup-*.sh`, deploy entrypoints и любые application/SaaS/FIO files. `age` отсутствует на DEV host,
  поэтому проверка использует fake binaries/synthetic data; установка пакета и recovery-key path остаются
  отдельным owner-gated host rehearsal.
- Targeted checks only: synthetic success/failure/corruption/cleanup/retention tests, `shellcheck` если доступен,
  `bash -n`, `git diff --check` и один независимый security audit. Full CI не запускается для этого isolated slice.

## 2026-07-19 — DR-01 repository backup-safety worker: implementation (taskdb `#901`, L4)

- `deploy/postgres/postgres-backup.sh` rewritten in place (same canonical script, no second mechanism): `umask 077`
  at top; `BACKUPS_ROOT` (now overridable only via `BERSONCAREBOT_BACKUPS_ROOT`, default unchanged
  `/opt/backups/postgres`) and every mode's output dir created `0700` via `ensure_dir_0700`. `DATABASE_URL` is no
  longer passed to `pg_dump`/`psql` argv anywhere (removed from `dump_one`, `tick_job_success`, `tick_job_failure`);
  it is injected only via the libpq `PGDATABASE` environment variable, which accepts a full `postgres://` conninfo
  string and preserves host/port/user/db/sslmode without re-parsing.
- `pg_dump -Fc --no-owner --no-acl` is piped directly into `age -R "$AGE_RECIPIENTS_FILE" -o "$partial"`; no
  plaintext dump file is ever created, final or temporary. New `require_backup_prereqs()` checks `pg_dump`, `psql`,
  `sha256sum`, `age` on `PATH` and that the age recipients file (`BERSONCAREBOT_BACKUP_AGE_RECIPIENTS_FILE`, default
  `/opt/backups/age-recipients.txt`, non-secret public-key list) is readable and non-empty — called before
  `load_database_url`, so a missing prerequisite fails closed before any `pg_dump` invocation and before any env
  file is even read.
- Artifact is `<label>_<dbname>_<ts>.dump.age`; the sha256 digest is computed **while the ciphertext is still the
  tracked `.partial` file** (not after rename) so a checksum failure can never strand a final-named artifact
  without a manifest. Both the artifact and its `<artifact>.sha256` manifest are written to `.partial` paths in the
  same output directory, `chmod 0600`, best-effort `sync`'d, then `mv -f` renamed into place — each rename's exit
  status is checked explicitly (the surrounding call runs with `set -e` disabled to let the caller capture rc, so an
  unchecked `mv` failure would otherwise fall through as a false success). A single `EXIT` trap
  (`cleanup_partials`) removes only this run's tracked `.partial` paths, scoped to `BACKUPS_ROOT`; it never touches
  an earlier valid generation because it never globs — only exact tracked paths.
- Split-URL mode: `run_backup_dumps` now explicitly captures the exit status of *both* the `integrator` and
  `webapp` `dump_one` calls (`rc=1` if either fails) instead of returning only the last call's status — the
  original single-URL-equal-check logic (one unified dump vs. two) is otherwise unchanged.
- Failure text sent to `operator_job_status.last_error` and echoed to stdout is passed through a new
  `redact_secrets()` (`postgres(ql)://...` → `postgres://[redacted]`) before storage/printing, covering the
  realistic case where a `pg_dump`/`age` error message echoes the conninfo string.
- Retention: `ARTIFACT_NAME_ARGS` now includes `*.dump.age` alongside the legacy plaintext suffixes; a new
  `prune_delete_generation()` deletes a primary artifact and its `.sha256` companion together, and the companion
  is never itself matched by `find` (so it can never be double-counted as a separate generation in the
  keep-newest-20 pre-migrations rule). All prune paths reuse the existing `BACKUPS_ROOT`-prefix guard.
- Adjacent synthetic test harness: `deploy/postgres/test-postgres-backup.sh`. Runs the real script only against a
  temporary `BACKUPS_ROOT` and temporary env files, with fake `pg_dump`/`age`/`psql` on `PATH` (never system
  `pg_dump`/`psql`, never a real `DATABASE_URL`); `sha256sum` is the real system binary (no DB/secret dependency)
  so the documented verify command (`sha256sum -c`) is exercised faithfully, including a corruption-detection
  assertion. 9 scenarios / 41 assertions, all passing: unified success, split-URL success (two generations),
  missing-`age` fail-closed (proves `pg_dump` never invoked, `BACKUPS_ROOT` never created), empty-recipients-file
  fail-closed, injected `pg_dump` failure (clean partials + redacted failure tick — this is what caught the
  split-URL masked-failure bug above), injected `age` failure (clean partials), injected checksum failure (no
  orphaned artifact, no leftover partial — this is what caught the checksum-after-rename bug), hourly-generation
  prune (primary+companion removed together, decoy file outside `BACKUPS_ROOT` untouched), and pre-migrations
  keep-newest-20 with 21 synthetic generations (exactly 20 kept, oldest generation's both files removed, no
  double-count). No secret marker appears in argv, stdout/stderr, tick text, or filenames in any scenario.
- Docs updated to the exact allowed paragraphs: `deploy/postgres/README.md` (encryption contract, age
  recipients/recovery-key separation, verify command, synthetic-test description, retention generation wording),
  `deploy/HOST_DEPLOY_README.md` §Backup contract (pre-migrations), `docs/ARCHITECTURE/SERVER CONVENTIONS.md`
  §Database / backup facts (both mentions) and the host-facts table row, `deploy/env/README.md`
  §Backup PostgreSQL. All now state `.dump.age` + `.sha256`, the `age`/recipients prerequisite and fail-closed
  behavior, `PGDATABASE`-only credential passing, and that this DEV/repository slice has no real
  install/application/rehearsal on TEST/PROD.
- Checks run: `bash -n` on both shell files (clean); `deploy/postgres/test-postgres-backup.sh` itself (9/9
  scenarios, 41/41 assertions PASS); `git diff --check` on the two script files (clean); `shellcheck` confirmed
  absent on this DEV host per the existing tooling census, not installed, not run.
- Not done / explicitly deferred: real `age` install and recipient/recovery-key provisioning on any host; real
  `pg_dump`/`psql` execution against `bcb_webapp_dev`, TEST, or PROD; `restic`/offsite copy, `pgbackrest`/PITR
  decision, S3 media ciphertext/manifest failure-domain copy (DR-01 items outside the `postgres-backup.sh` scope);
  DR-02 restore drills and RPO/RTO measurement; disposition of the 93 existing legacy plaintext PROD dump copies
  (`CURRENT_PROD_BASELINE_2026-07-19.md`) — those remain open and unaffected by this repository-only change, since
  this slice changes only what the script produces going forward. Independent security audit of this diff is the
  next step before any lead/integration commit.

## 2026-07-20 — DR-01 consolidated correction completion (repository-only)

- This is completion of the same first correction after the provider lost authentication; it is not a new DR round.
  The provisional worker wording above is superseded where it said `mv -f`, captured/redacted provider output, or
  9 scenarios/41 assertions.
- Stateful `run_backup_dumps` now executes in the current shell, not command substitution. Its active partial,
  manifest-pending and current-run final pair paths survive to the signal trap; split failure rolls back every pair
  published by this logical run. Raw `pg_dump`/`age` stderr is suppressed at source and failure tick text is the
  safe generic `backup dump failed`, never captured to a file.
- Pair publication is manifest then artifact using same-directory atomic no-clobber hard links. A failed/colliding
  artifact publication removes the manifest linked by this run; it never overwrites an earlier generation. Backup
  roots must be absolute, normalized and non-root; every existing component is checked for symlinks before
  mkdir/chmod/write/prune.
- The data-only env parser accepts exactly one valid `DATABASE_URL` assignment, rejects command/malformed target
  syntax, leaves unrelated dotenv entries inert, and does not use inherited `DATABASE_URL`. Recipient and command
  prerequisites remain fail-closed before `pg_dump`; retention remains pair-aware and NUL-safe.
- Synthetic proof only, no real DB/network/host/key/dump/restore action: `bash -n` passed and the full adjacent
  harness reached `ALL SYNTHETIC TESTS PASSED`; the superseding entry below records its current coverage. Host
  installation, real `age`/recipient/recovery-key provisioning, offsite/PITR and DR-02 restore proof
  remain owner-gated and unclaimed.

## 2026-07-20 — DR-01 terminal re-audit consolidated correction (repository-only)

- Supersedes the earlier synthetic overclaim that a prefix/shape scan was sufficient for recipients and that the
  harness had only scenarios 1–26. Before any `pg_dump`, the configured `age -R` binary parses the entire recipients
  file against empty input; synthetic malformed `age1` and SSH records prove parser failure and no dump call.
- The script disables inherited `bash -x` before dotenv parsing or provider invocation. The adjacent harness invokes
  it with `bash -x`, proves the synthetic credential marker is absent from captured output, and proves parser plus
  providers were reached.
- Manifest and artifact ownership is registered before publication; cleanup retains source partials as inode witnesses
  until the whole logical set succeeds and removes finals only when the exact inode proves ownership. Split failure and
  TERM scenarios prove no current-run pair/orphan remains. Pre-migrations ranks only complete encrypted pairs; a fresh
  incomplete artifact stays inside manifest-first grace but cannot consume a keep-20 slot.
- Evidence remains synthetic only: fake `pg_dump`/`age`/`psql`, isolated temporary roots/env files, no real age,
  database, host, TEST/PROD, key, dump, restore, network, package or deployment action. `bash -n` and the full
  adjacent harness pass; host installation and DR-02/offsite/PITR work remain owner-gated.
