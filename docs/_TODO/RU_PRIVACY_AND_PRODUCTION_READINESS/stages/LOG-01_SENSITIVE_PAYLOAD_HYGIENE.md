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

- [ ] Инвентаризировать logger/console error paths, DB/provider/request errors, audit/metrics, queues, retries,
      dead-letter, crash reports и support exports во всех runtime processes.
- [ ] Для каждого store указать payload fields, access, retention/cleanup, canonical source и необходимость копии.
- [ ] Запустить synthetic markers для message, diagnosis, token, phone, filename и provider error без реальных ПДн.
- [ ] Сформировать exact L1/L2 file/schema manifests; active notification/SaaS files не захватывать без coordination.

## L1 — immediate logging guard (`AI`, executable now)

- [x] Удалить raw SQL params и query text из integrator error output/`console.error` (taskdb `#914`,
      `apps/integrator/src/infra/db/client.ts`: все `query`/`tx` error paths и duplicate `console.error` calls).
- [x] Оставить безопасные operation/query fingerprint (sha256/16), PostgreSQL code/class и correlation
      (`dbPrincipalSource` from `getCurrentDbPrincipal()`) where supplied. **Не закрыто:** elapsed timing — не было
      измерено до этого slice (`client.ts` не хранил start/duration), поэтому не заявляется как "оставлено"; добавление
      timing instrumentation осталось за пределами этой узкой правки.
- [x] `cause` не сериализуется вообще — ни целиком, ни через key-blacklist/redaction. Correction round 1
      добавляла `sanitizeErrorCause`/`redactUnknownErrorShape` (key-blacklist по имени), но независимый audit
      (correction round 2) нашёл, что любой ключ вне blacklist (`patientName`, `response.data`, array elements,
      enumerable-свойства кастомного `Error`) по-прежнему копировался — это нарушало "не сериализовать
      неизвестный error/cause целиком". Исправление: `cause` убран из `SerializedError` и из возвращаемого
      значения `serializeError` во всех трёх приложениях (`apps/integrator/src/infra/observability/logger.ts`,
      `apps/webapp/src/infra/logging/logger.ts`, `apps/media-worker/src/logger.ts`); `sanitizeErrorCause`/
      `redactUnknownErrorShape` удалены.
- [x] `serializeError` safe-by-construction, закрытая value-free форма: `SerializedError` = `{ type: string;
      code?: string; class?: string }`. Top-level `Error.message`/`stack`/`JSON.stringify(err)` и любые поля
      `cause` (значения, массивы, enumerable-свойства) никогда не проходят verbatim ни при каком входе.
      Единственное сохранённое явное диагностическое поле сверх `type` — валидированный PostgreSQL SQLSTATE
      `code`/`class`.
- [x] Executable tests (все три app suites) assert marker absence в actual rendered stdout output (не только
      config) при маркере одновременно в top-level `Error.message`/`stack` и в `cause.body.message`/
      `cause.providerError.{message,phone}`, `cause.patientName`, `cause.response.data`, array elements и
      enumerable-свойстве кастомного `Error`; `serializeError`-юнит-тест дополнительно проверяет, что
      `Object.keys(result)` строго `['type']` при такой input-форме (доказывает закрытую форму, не только
      marker absence).
- [x] Диагностика остаётся достаточной для этой узкой правки: query fingerprint + PG code/class + dbPrincipalSource
      корреспондируют без payload; terminal security re-audit `bcb-log01-l1-914-codex-terminal-reaudit-20260719`
      дал PASS по полному L1 checklist после correction round 2.
- [ ] **Уточнение, не claim "готово":** санитизирован только payload сериализатора `err`/`error` (объект,
      переданный как `{ err }`/`{ error }`). Caller-supplied Pino message-строка (`msg` в
      `logger.error(fields, msg)`) — отдельный путь, этот slice его не проверяет и не гарантирует его
      безопасность.

Checks: PASS — targeted logger/DB tests, captured stdout/stderr, nested/error-cause fixtures (including patientName,
response.data, arrays, custom enumerable Error properties), scoped typecheck, `git diff --check`; independent
terminal security audit `bcb-log01-l1-914-codex-terminal-reaudit-20260719` — PASS.

## L2 — queues, attempts and retries (`AI`, after NTF census/retention gate)

- [ ] Когда canonical object существует, queue хранит ID/type/routing metadata и fetches content just-in-time; не
      копирует clinical text.
- [ ] Где payload неизбежен, он минимален, encrypted/tenant-bound, имеет явный TTL и удаляется после terminal state.
- [ ] Delivery attempt хранит status/provider code/fingerprint/timing, но не raw recipient token или body.
- [ ] Reminder/booking/broadcast/support retries не дублируют `{chatId,text}`, `logText`, patient summary или file
      name в error/audit rows.
- [ ] Dead-letter inspection использует controlled privileged fetch; обычная admin diagnostics не показывает
      clinical payload.
- [ ] Schema cleanup/backfill/purge имеет legal retention gate, backward-compatible deploy order и TEST rehearsal.

## L3 — invariants and operations (`AI + owner`)

- [ ] `SENSITIVE_TEST_MARKER` принудительно проходит через DB/provider/queue/retry failures и отсутствует в Pino,
      stdout/stderr, journald-compatible output, delivery attempts, audit, metrics и terminal queue rows.
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

- [ ] Raw SQL params/body/message/clinical fields/secrets не попадают в application/provider/error logs.
- [ ] Queue/attempt/dead-letter data минимизированы и имеют утверждённый retention/cleanup contract.
- [ ] Marker negative tests покрывают каждый runtime process и terminal delivery path.
- [ ] Correlation/status/error-code observability остаётся достаточной для эксплуатации.
- [ ] Targeted checks и независимый security audit зелёные; PROD cleanup закрыт отдельным evidence.
