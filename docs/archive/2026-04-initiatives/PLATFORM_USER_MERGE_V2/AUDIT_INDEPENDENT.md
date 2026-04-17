# Audit — Independent Review (Platform User Merge v2)

**Дата:** 2026-04-10  
**Scope:** независимый повторный аудит всего пакета v2 после `AUDIT_FINAL.md` / `STAGE_C_CLOSEOUT.md` / Stage 1–5 implementation.  
**Метод:** отдельная сверка code-paths, operator/docs package и evidence chain; цель — не повторить уже закрытые замечания, а выделить residual issues и зоны для усиления.

---

## Verdict

**Исторический verdict на момент независимого прогона:** **PASS, но с обязательным усилением**.  
**Текущий статус после follow-up:** **PASS, hardening findings closed**.  

Критических release-blocker’ов по текущему `Platform User Merge v2` не найдено; findings ниже сохранены как исторический audit trail того, что было дополнительно усилено, чтобы:

- убрать race между gate и apply;
- сделать integrator M2M path более надёжным;
- улучшить воспроизводимость и operator traceability evidence package.

## Follow-up status (2026-04-10)

Замечания этого аудита закрыты в актуальном audited repository tree:

- **Finding 1:** gate теперь возвращает snapshot проверенной пары, а `mergePlatformUsersInTransaction(...)` сверяет его под `FOR UPDATE` и при drift возвращает `integrator_ids_changed_since_gate`.
- **Finding 2:** `POST /api/doctor/clients/integrator-merge` читает пару в транзакции `FOR UPDATE` и удерживает row lock до исхода M2M вызова.
- **Finding 3:** в [`AUDIT_FINAL.md`](AUDIT_FINAL.md) и [`STAGE_C_CLOSEOUT.md`](STAGE_C_CLOSEOUT.md) добавлен `Evidence baseline` с `git rev-parse` и literal `git status --short --branch`.
- **Finding 4:** [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) унифицирован: production evidence хранится в ticket / ops record, а [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) остаётся repo-level журналом.
- **Finding 5:** `integratorUserMergeM2mClient.ts` получил timeout/abort, а webapp routes — явный mapping timeout case.
- **Finding 6:** merge-транзакция теперь переносит и `media_upload_sessions.owner_user_id`.
- **Finding 7:** индекс в [`README.md`](README.md) уже был обновлён во время этого аудита и сохраняется актуальным.
- **Finding 8:** в [`STAGE_C_CLOSEOUT.md`](STAGE_C_CLOSEOUT.md) добавлен явный caveat, что `payload::text LIKE` check — heuristic.

---

## Findings

Ниже — **исторические findings независимого прогона**, уже закрытые follow-up правками в audited repository tree.

### 1. `major` — relaxed merge в webapp не привязан к той же паре integrator id, которую проверил gate

- **Где:** `apps/webapp/src/infra/manualMergeIntegratorGate.ts`, `apps/webapp/src/app/api/doctor/clients/merge/route.ts`, `apps/webapp/src/infra/repos/pgPlatformUserMerge.ts`
- **Суть:** `verifyManualMergeIntegratorIntegratorGate()` после `checkIntegratorCanonicalPair(...)` возвращает только `allowDistinctIntegratorUserIds: true/false`. В `mergePlatformUsersInTransaction(...)` под `FOR UPDATE` повторно читается уже **текущая** пара `integrator_user_id`, но relaxed-путь разрешается по одному лишь boolean, без проверки, что это **та же самая** пара id, которую gate верифицировал в integrator.
- **Риск:** при конкурентном изменении `platform_users.integrator_user_id` между preview/gate и apply можно применить relaxed merge к другой non-null паре, чем та, которую integrator подтвердил как canonical-aligned.
- **Что усилить:** gate должен возвращать snapshot проверенной пары (`targetIntegratorUserId`, `duplicateIntegratorUserId`), а merge под lock должен сверять его с фактическими `iA/iB` перед тем, как honor `allowDistinctIntegratorUserIds`.

### 2. `major` — `POST /api/doctor/clients/integrator-merge` читает winner/loser без row lock

- **Где:** `apps/webapp/src/app/api/doctor/clients/integrator-merge/route.ts`
- **Суть:** route делает обычный `SELECT ... FROM platform_users WHERE id IN (...)`, извлекает `integrator_user_id` и сразу вызывает `callIntegratorUserMerge(...)`.
- **Риск:** если `integrator_user_id` на одной из строк поменяется конкурентно, integrator M2M merge может уйти по stale snapshot, уже не соответствующему состоянию webapp DB.
- **Что усилить:** либо читать строки через короткую транзакцию с `FOR UPDATE`, либо повторно подтверждать, что ids не изменились непосредственно перед M2M вызовом.

### 3. `major` — independent evidence package всё ещё не привязан к immutable git revision

- **Где:** `docs/PLATFORM_USER_MERGE_V2/AUDIT_FINAL.md`, `docs/PLATFORM_USER_MERGE_V2/STAGE_C_CLOSEOUT.md`
- **Суть:** документы уже говорят про `audited repository tree`, но не содержат literal baseline вроде `git rev-parse HEAD` / `git rev-parse --short HEAD` / сохранённого блока `git status --short --branch`.
- **Риск:** через время аудит остаётся датированным и narrative-bound, но не полностью воспроизводимым на уровне конкретного commit SHA.
- **Что усилить:** добавить в `AUDIT_FINAL.md` и, опционально, в `STAGE_C_CLOSEOUT.md` отдельный блок `Evidence baseline` с commit SHA и зафиксированным git-status snapshot.

### 4. `major` — `CUTOVER_RUNBOOK.md` просит писать production per-merge evidence в `AGENT_EXECUTION_LOG.md`, а остальной пакет ориентирует на ticket

- **Где:** `docs/PLATFORM_USER_MERGE_V2/CUTOVER_RUNBOOK.md`, `docs/PLATFORM_USER_MERGE_V2/STAGE_C_CLOSEOUT.md`, `docs/PLATFORM_USER_MERGE_V2/AGENT_EXECUTION_LOG.md`
- **Суть:** `CUTOVER_RUNBOOK.md` для Deploy 3 говорит “зафиксировать в `AGENT_EXECUTION_LOG.md` время merge, пары id, результат SQL gate-запросов”, тогда как `STAGE_C_CLOSEOUT.md` и `AGENT_EXECUTION_LOG.md` уже трактуют production evidence как обязанность оператора в **тикете**, а не как обязательный repo-commit после каждого merge.
- **Риск:** operator workflow остаётся двусмысленным: нужно ли коммитить репозиторий после каждого production merge или достаточно вести ticket evidence.
- **Что усилить:** унифицировать правило: для production per-merge evidence primary source = ticket / incident record; `AGENT_EXECUTION_LOG.md` — только для инженерных milestone/follow-up изменений пакета.

### 5. `minor` — integrator M2M `fetch` не ограничен timeout

- **Где:** `apps/webapp/src/infra/integrations/integratorUserMergeM2mClient.ts`
- **Суть:** `integratorM2mPostJson(...)` вызывает `fetch(...)` без `AbortSignal`/timeout.
- **Риск:** зависший integrator или сетевая деградация может подвесить preview/gate/integrator-merge request дольше, чем это приемлемо для admin flow.
- **Что усилить:** добавить bounded timeout (`AbortSignal.timeout(...)`) и явный mapping timeout в `integrator_merge_status_unavailable` / `integrator_canonical_status_failed`.

### 6. `minor` — merge переводит `media_files.uploaded_by`, но не `media_upload_sessions.owner_user_id`

- **Где:** `apps/webapp/src/infra/repos/pgPlatformUserMerge.ts`, `apps/webapp/src/infra/repos/mediaUploadSessionsRepo.ts`, `apps/webapp/src/app/api/media/multipart/complete/route.ts`
- **Суть:** merge переносит владельца у `media_files`, но active multipart sessions по-прежнему привязаны к duplicate user через `media_upload_sessions.owner_user_id`. Completion-route требует точного совпадения `owner_user_id = session.user.userId`.
- **Риск:** после merge активная multipart-сессия, начатая duplicate-пользователем, может перестать завершаться под canonical user до истечения/cleanup.
- **Что усилить:** либо репоинтить `media_upload_sessions.owner_user_id` в merge-транзакции, либо явно запретить merge при active multipart sessions и задокументировать это как operator precondition.

### 7. `minor` — package `README.md` не индексирует итоговый независимый/финальный audit artifact полностью

- **Где:** `docs/PLATFORM_USER_MERGE_V2/README.md`
- **Суть:** в оглавлении пакета нет явной строки для `AUDIT_FINAL.md`; без неё итоговый cross-stage verdict менее discoverable, чем stage-specific audits.
- **Что усилить:** добавить строки для `AUDIT_FINAL.md` и этого `AUDIT_INDEPENDENT.md`.

### 8. `minor` — production outbox check в closeout опирается на heuristic `payload::text LIKE` без caveat

- **Где:** `docs/PLATFORM_USER_MERGE_V2/STAGE_C_CLOSEOUT.md`
- **Суть:** шаблон проверки `pending_rows_with_loser` использует `payload::text LIKE` по quoted `"integratorUserId":"LOSER_ID"`.
- **Риск:** оператор может воспринимать zero rows как абсолютное доказательство, хотя это best-effort check и он не покрывает все возможные future payload shapes.
- **Что усилить:** рядом с шаблоном явно подписать, что это heuristic signal, а при сомнении нужно дополнительно смотреть `projection-health.mjs` и sample raw payload по relevant event types.

---

## MANDATORY FIX INSTRUCTIONS

### §1 Gate/apply race for distinct integrator ids

1. Вернуть из `verifyManualMergeIntegratorIntegratorGate()` не только boolean, а snapshot проверенной пары integrator ids.
2. В `mergePlatformUsersInTransaction()` сверять snapshot с фактическими `iA/iB` после `FOR UPDATE`.
3. При mismatch падать отдельной ошибкой вроде `integrator_ids_changed_since_gate`.

### §2 Integrator-merge stale snapshot

1. Обернуть чтение пары в `integrator-merge/route.ts` в транзакцию с `FOR UPDATE`, либо эквивалентно ввести read-then-verify step перед M2M вызовом.
2. Добавить тест на защиту от changed `integrator_user_id` между initial read и merge call.

### §3 Immutable evidence baseline

1. Добавить в `AUDIT_FINAL.md` блок с `git rev-parse HEAD`, `git rev-parse --short HEAD` и literal `git status --short --branch`.
2. В `STAGE_C_CLOSEOUT.md` сослаться на этот baseline явно.

### §4 Operator workflow consistency

1. Исправить `CUTOVER_RUNBOOK.md`: production per-merge evidence хранится в тикете/ops record.
2. Оставить `AGENT_EXECUTION_LOG.md` только для repo-level engineering updates.

### §5 M2M timeout hardening

1. Добавить timeout/abort в `integratorM2mPostJson(...)`.
2. Отразить timeout case в route-level error mapping и тестах.

### §6 Multipart ownership after merge

1. Решить политику: repoint `media_upload_sessions.owner_user_id` или explicit precondition “no active multipart during merge”.
2. После выбранной политики — обновить код и docs.

### §7 Docs discoverability / caveats

1. Добавить `AUDIT_FINAL.md` и `AUDIT_INDEPENDENT.md` в `README.md` пакета v2.
2. В `STAGE_C_CLOSEOUT.md` обозначить heuristic nature of `payload::text LIKE` check.

---

## Где зафиксировано

- Основной независимый аудит: `docs/PLATFORM_USER_MERGE_V2/AUDIT_INDEPENDENT.md`
- Закрытие findings зафиксировано в:
  - `docs/PLATFORM_USER_MERGE_V2/AGENT_EXECUTION_LOG.md`
  - `docs/PLATFORM_USER_MERGE_V2/STAGE_C_CLOSEOUT.md`
  - `docs/PLATFORM_USER_MERGE_V2/AUDIT_FINAL.md`
  - `docs/PLATFORM_USER_MERGE_V2/CUTOVER_RUNBOOK.md`
  - `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md`
  - `apps/webapp/src/app/api/api.md`
