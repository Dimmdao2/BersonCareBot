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
