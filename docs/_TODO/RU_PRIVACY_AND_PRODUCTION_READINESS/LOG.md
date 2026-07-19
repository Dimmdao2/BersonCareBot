# Execution log

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
