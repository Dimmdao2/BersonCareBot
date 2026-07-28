> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

> ## 🔴 ПРАВКА 2026-07-27 — компаунд-бокс расщеплён по прямому указанию владельца
>
> **Было:** один пункт L2 покрывал сразу четыре независимых семейства (reminder/booking/broadcast/support), одной
> галочкой на всех — хотя сегодняшняя правка (`fcd956395`, `d99c72d9d`, `e1c6f62a1`, `298c025d7`) закрыла требование
> только для support, а reminder/booking/broadcast остаются как были.
>
> **Стало:** бокс расщеплён на 4 отдельных пункта, по одному на семейство, с сохранённой дословной формулировкой
> и отдельным доказательством/причиной на каждый. Тот же приём применён к ещё двум найденным компаунд-боксам ниже
> (`L3` про `SENSITIVE_TEST_MARKER`, `Definition of Done` про raw SQL/message/clinical fields) — в обоих одна часть
> уже закрыта (`L1`, 2026-07-19), другая нет, и старая формулировка это скрывала.
>
> **Почему:** владелец, 27.07, дословно — «один пункт охватывает сразу четыре семейства - это не честнее а кривее,
> если в одном пункте много подпунктов часть из которых сделана а часть нет - значит изменение не атомарно и
> чек-лист сделан говняно». Разметка состояний — канон `docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md` §6.3.

# LOG-01 — Sensitive payload hygiene in logs and queues

Статус: `planned`; `L0/L1` могут исполняться в DEV после exact file lock.

## Цель

Убрать неконтролируемые вторичные копии сообщений/clinical data/secrets из application logs, SQL error logs,
delivery attempts, retries, dead-letter и очередей. Это отдельный control от disk/DB/backup encryption: зашифрованный
диск не помогает, если plaintext продублирован в journald или долговечной retry row.

## Подтверждённый baseline

- `apps/integrator/src/infra/db/client.ts` при query error пишет raw `sql`, весь `params` и повторяет их через
  `console.error`;
- `dispatchPort.ts` redacts OTP, но non-OTP delivery payload сохраняется в
  `integrator.delivery_attempt_logs.payload_json`;
- `public.outgoing_delivery_queue.payload_json`, reminder/retry jobs и некоторые failure records хранят полный text;
- единой retention/minimization policy для этих копий audit не подтвердил.

## L0 — data-flow census (`AI`)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Инвентаризировать logger/console error paths, DB/provider/request errors, audit/metrics, queues, retries,
      dead-letter, crash reports и support exports во всех runtime processes.
- [ ] Для каждого store указать payload fields, access, retention/cleanup, canonical source и необходимость копии.
- [ ] Запустить synthetic markers для message, diagnosis, token, phone, filename и provider error без реальных ПДн.
- [ ] Сформировать exact L1/L2 file/schema manifests; active notification/SaaS files не захватывать без coordination.

## L1 — immediate logging guard (`AI`, executable now)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [x] Удалить raw SQL params и query text из integrator error output/`console.error` (taskdb `#914`,
      `apps/integrator/src/infra/db/client.ts`: все `query`/`tx` error paths и duplicate `console.error` calls). (✓ verified client.ts:54-85,121-135,170-205 — logs only queryFingerprint/pgCode/pgClass/dbPrincipalSource, no sql/params)
- [x] Оставить безопасные operation/query fingerprint (sha256/16), PostgreSQL code/class и correlation
      (`dbPrincipalSource` from `getCurrentDbPrincipal()`) where supplied. **Не закрыто:** elapsed timing — не было
      измерено до этого slice (`client.ts` не хранил start/duration), поэтому не заявляется как "оставлено"; добавление
      timing instrumentation осталось за пределами этой узкой правки. (✓ verified client.ts:53-65 safeQueryErrorContext/safeErrorCodeContext)
- [x] `cause` не сериализуется вообще — ни целиком, ни через key-blacklist/redaction. Correction round 1
      добавляла `sanitizeErrorCause`/`redactUnknownErrorShape` (key-blacklist по имени), но независимый audit
      (correction round 2) нашёл, что любой ключ вне blacklist (`patientName`, `response.data`, array elements,
      enumerable-свойства кастомного `Error`) по-прежнему копировался — это нарушало "не сериализовать
      неизвестный error/cause целиком". Исправление: `cause` убран из `SerializedError` и из возвращаемого
      значения `serializeError` во всех трёх приложениях (`apps/integrator/src/infra/observability/logger.ts`,
      `apps/webapp/src/infra/logging/logger.ts`, `apps/media-worker/src/logger.ts`); `sanitizeErrorCause`/
      `redactUnknownErrorShape` удалены. (✓ verified: no `cause` in serializeError across integrator/observability/logger.ts:42-59, webapp/infra/logging/logger.ts:37-53, media-worker/src/logger.ts:36-52)
- [x] `serializeError` safe-by-construction, закрытая value-free форма: `SerializedError` = `{ type: string;
    code?: string; class?: string }`. Top-level `Error.message`/`stack`/`JSON.stringify(err)` и любые поля
      `cause` (значения, массивы, enumerable-свойства) никогда не проходят verbatim ни при каком входе.
      Единственное сохранённое явное диагностическое поле сверх `type` — валидированный PostgreSQL SQLSTATE
      `code`/`class`. (✓ verified SerializedError = {type; code?; class?} at observability/logger.ts:16-20,42-59)
- [x] Executable tests (все три app suites) assert marker absence в actual rendered stdout output (не только
      config) при маркере одновременно в top-level `Error.message`/`stack` и в `cause.body.message`/
      `cause.providerError.{message,phone}`, `cause.patientName`, `cause.response.data`, array elements и
      enumerable-свойстве кастомного `Error`; `serializeError`-юнит-тест дополнительно проверяет, что
      `Object.keys(result)` строго `['type']` при такой input-форме (доказывает закрытую форму, не только
      marker absence). (✓ verified logger.test.ts present in integrator/observability, webapp/infra/logging, media-worker/src)
- [x] Диагностика остаётся достаточной для этой узкой правки: query fingerprint + PG code/class + dbPrincipalSource
      корреспондируют без payload; terminal security re-audit `bcb-log01-l1-914-codex-terminal-reaudit-20260719`
      дал PASS по полному L1 checklist после correction round 2. (✓ verified client.ts:58-65 fingerprint+PG code+dbPrincipalSource retained without payload)
- [ ] **Уточнение, не claim "готово":** санитизирован только payload сериализатора `err`/`error` (объект,
      переданный как `{ err }`/`{ error }`). Caller-supplied Pino message-строка (`msg` в
      `logger.error(fields, msg)`) — отдельный путь, этот slice его не проверяет и не гарантирует его
      безопасность.

Checks: PASS — targeted logger/DB tests, captured stdout/stderr, nested/error-cause fixtures (including patientName,
response.data, arrays, custom enumerable Error properties), scoped typecheck, `git diff --check`; independent
terminal security audit `bcb-log01-l1-914-codex-terminal-reaudit-20260719` — PASS.

## L2 — queues, attempts and retries (`AI`, after NTF census/retention gate)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Когда canonical object существует, queue хранит ID/type/routing metadata и fetches content just-in-time; не
      копирует clinical text.
- [ ] Где payload неизбежен, он минимален, encrypted/tenant-bound, имеет явный TTL и удаляется после terminal state.
- [ ] Delivery attempt хранит status/provider code/fingerprint/timing, но не raw recipient token или body.

> **Расщеплено 2026-07-27** (было одним пунктом на 4 семейства — см. header note). Формулировка "не дублируют
> `{chatId,text}`, `logText`, patient summary или file name в error/audit rows" сохранена дословно на каждое
> семейство; изменилось только доказательство/состояние.

- [ ] Reminder retries не дублируют `{chatId,text}`, `logText`, patient summary или file name в error/audit rows.
      **Не сделано.** `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts:812-842` — `reminder_dispatch`
      queue row по-прежнему хранит и полный `intent.payload.message.text`, и отдельное поле `logText: text` (строка
      838); сегодняшние коммиты этот файл не трогали.
- [ ] Booking retries не дублируют `{chatId,text}`, `logText`, patient summary или file name в error/audit rows.
      **Не сделано.** `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts:360-390` —
      `message_retry_jobs` row (`kind=message.deliver`) хранит и рендеренный `message.text` внутри `payloadJson`, и
      отдельный аргумент `messageText` в `enqueueMessageRetryJob`; не тронуто сегодняшними коммитами.
- [ ] Broadcast retries не дублируют `{chatId,text}`, `logText`, patient summary или file name в error/audit rows.
      **Не сделано, и с оговоркой.** `apps/webapp/src/modules/doctor-broadcasts/deliveryJobs.ts:183-249` — очередь
      по-прежнему хранит полный `messengerText`/`smsText` в `payloadJson.intent.payload`. Технически требование не
      выполнено, но по `OWNER_PRODUCT_RULES.md` §15 («текст в рассылке НЕ прячем — это не медицинские данные»)
      содержание рассылки больше не является чувствительным, поэтому дублирование текста в этой очереди не
      privacy-риск того же класса, что для reminder/booking; TTL/minimization общей политики (см. пункт выше) всё
      ещё применим.
- [x] Support retries не дублируют `{chatId,text}`, `logText`, patient summary или file name в error/audit rows.
      **Сделано.** Коммиты `fcd956395`, `e1c6f62a1`, `298c025d7` (2026-07-27): `executeAction.ts` больше не строит
      intent с `message: { text: adminText || draftTextCurrent }` / `message: { text: messageText }` для
      уведомления врачу о сообщении пациента — вместо этого `buildDoctorPatientMessageNotificationIntents`
      (`apps/integrator/src/kernel/domain/executor/handlers/supportRelay.ts:71-149`) либо не шлёт intent вовсе
      (сообщение зеркалится в канонический `support_conversation_messages`, `intents: []`, проверено
      `supportRelay.test.ts:111-112`), либо шлёт только нейтральный `buildDoctorPatientMessageNotificationText`
      ("новое сообщение от …", без текста) — проверено `supportRelay.test.ts:161-167`. Раздельно проверять
      error/audit rows на этом пути больше нечего дублировать: сам intent уже не несёт `text` пациента.
- [ ] Dead-letter inspection использует controlled privileged fetch; обычная admin diagnostics не показывает
      clinical payload.
- [ ] Schema cleanup/backfill/purge имеет legal retention gate, backward-compatible deploy order и TEST rehearsal.

## L3 — invariants and operations (`AI + owner`)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

> **Расщеплено 2026-07-27** — тот же дефект компаунда: одна половина (DB/provider → Pino/stdout/stderr) закрыта
> `L1` ещё 2026-07-19, вторая (queue/retry → delivery attempts/audit/metrics/terminal queue rows) не начата и
> заблокирована на `L2`. Проверено: `grep -rn SENSITIVE_TEST_MARKER` находит маркер только в
> `apps/integrator/src/infra/db/client.test.ts` и трёх `logger.test.ts` (integrator/webapp/media-worker) — ни в одном
> queue/delivery-attempt/retry тесте маркера нет.

- [x] `SENSITIVE_TEST_MARKER` отсутствует в Pino, stdout/stderr, journald-compatible output при DB/provider failures.
      **Сделано.** `L1` closure 2026-07-19: `client.test.ts`, `apps/integrator/src/infra/observability/logger.test.ts`,
      `apps/webapp/src/infra/logging/logger.test.ts`, `apps/media-worker/src/logger.test.ts` — маркер в captured
      stdout/stderr отсутствует при маркере в `Error.message`/`stack`/`cause`; independent audit
      `bcb-log01-l1-914-codex-terminal-reaudit-20260719` PASS.
- [ ] `SENSITIVE_TEST_MARKER` принудительно проходит через queue/retry failures и отсутствует в delivery attempts,
      audit, metrics и terminal queue rows.
      **Не начато.** Нет ни одного теста, использующего маркер вне трёх logger-suite; заблокировано на `L2`
      (queue-минимизация не построена — см. расщеплённый пункт выше: reminder/booking/broadcast queues всё ещё
      хранят рендеренный текст, и `dispatchPort.ts:75` (`sanitizePayloadForLogs`) логирует полный `intent.payload`
      в `delivery_attempt_logs.payload_json` для любого не-OTP intent).
- [ ] Security/clinical access events сохраняют actor/action/resource/result, но не protected value.
- [ ] Retention/cleanup jobs идемпотентны, observable и не удаляют evidence, которое должно храниться по принятой
      policy/legal hold.
- [ ] Runbook объясняет, что можно искать при incident/debug и кто имеет break-glass access.

## Dependencies

- L0/L1 не ждут D4/S5/billing и не требуют DB schema change.
- L2 schema/retention ждёт `G-03`, exact notification queue census и active migration boundaries.
- `CRYPTO-01/C4`, `SEC-03`, `SEC-04` и `PR-04A` используют LOG-01 evidence.
- Production log rotation/purge/apply — отдельный `G-11` window; DEV plan не читает реальные payload/log values.

## Definition of Done

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

> **Расщеплено 2026-07-27** — раньше один пункт смешивал SQL params (закрыто `L1`) с message/clinical
> fields/secrets (не закрыто: `dispatchPort.ts` до сих пор логирует полный non-OTP `intent.payload` в
> `delivery_attempt_logs.payload_json` — см. "Подтверждённый baseline" выше, сегодняшние коммиты этот файл не
> меняли).

- [x] Raw SQL params не попадают в application/provider/error logs.
      **Сделано.** `L1`, `apps/integrator/src/infra/db/client.ts` — все `query`/`tx` error paths логируют только
      `queryFingerprint`/`pgCode`/`pgClass`/`dbPrincipalSource`, без `sql`/`params`; independent audit
      `bcb-log01-l1-914-codex-terminal-reaudit-20260719` PASS.
- [ ] Body/message/clinical fields/secrets не попадают в application/provider/error logs.
      **Не сделано.** `apps/integrator/src/infra/adapters/dispatchPort.ts:30-39,75` (`sanitizePayloadForLogs`)
      редактирует только OTP-intent (`kind: 'otp_redacted'`); любой другой intent логируется в
      `delivery_attempt_logs.payload_json` целиком, включая текущий рендеренный текст (для reminder/booking/broadcast
      — см. расщеплённый пункт L2 выше). Не тронуто сегодняшними коммитами.
- [ ] Queue/attempt/dead-letter data минимизированы и имеют утверждённый retention/cleanup contract.
- [ ] Marker negative tests покрывают каждый runtime process и terminal delivery path.
- [ ] Correlation/status/error-code observability остаётся достаточной для эксплуатации.
- [ ] Targeted checks и независимый security audit зелёные; PROD cleanup закрыт отдельным evidence.
