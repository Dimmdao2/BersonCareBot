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

- [ ] Удалить raw SQL params и query text из integrator error output/`console.error`.
- [ ] Оставить безопасные operation/query fingerprint, PostgreSQL code/class, request/job/correlation ID и timing.
- [ ] Не сериализовать неизвестный error/cause целиком; применить общий allowlist/redaction contract к webapp,
      integrator и media-worker.
- [ ] Logger config redacts token/authorization/cookie/params/payload/message/body nested variants; test доказывает
      не название ключа, а отсутствие marker в фактическом rendered output.
- [ ] Диагностика остаётся достаточной: synthetic failure коррелируется с operation/request без payload.

Checks: targeted logger/DB tests, captured stdout/stderr, nested/error-cause fixtures, lint/typecheck, independent
security audit.

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
