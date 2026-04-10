# Audit — Stage 2 (canonical integrator write path + projection outbox)

**Дата аудита:** 2026-04-10  
**Follow-up (закрытие FINDING §2.2):** 2026-04-10 — см. [§6](#6-follow-up-2026-04-10--fingerprint-support-событий).  
**Повторный аудит (pass 2):** 2026-04-10 — см. [§7](#7-повторный-аудит-stage-2-pass-2).  
**Источник требований:** [`STAGE_2_CANONICAL_READ_WRITE_PATH.md`](STAGE_2_CANONICAL_READ_WRITE_PATH.md), [`MASTER_PLAN.md`](MASTER_PLAN.md) (Deploy 2 / подготовка путей без merge)

**Проверяемые артефакты (код):**

- [`apps/integrator/src/infra/db/repos/canonicalUserId.ts`](../../apps/integrator/src/infra/db/repos/canonicalUserId.ts) (`canonicalizeIntegratorUserIdKeysInObject` для appointment `payloadJson`)
- [`apps/integrator/src/infra/db/writePort.ts`](../../apps/integrator/src/infra/db/writePort.ts)
- [`apps/integrator/src/infra/db/repos/channelUsers.ts`](../../apps/integrator/src/infra/db/repos/channelUsers.ts) (`setUserPhone`)
- Единственный production-путь enqueue: `writePort.ts` (поиск `enqueueProjectionEvent` по репозиторию integrator — скрипты/тесты исключены)

---

## 1) Canonical resolution до `enqueueProjectionEvent`

### 1.1 События с `integratorUserId` (или эквивалентом в payload)

| Событие / ветка `writePort` | Разрешение перед enqueue | Статус |
|----------------------------|---------------------------|--------|
| `user.upsert` → `user.upserted` | `resolveCanonicalIntegratorUserId(txDb, integratorUserId)` | **PASS** |
| `user.phone.link` → `contact.linked` | `resolveCanonicalIntegratorUserId(txDb, uid)` | **PASS** |
| `conversation.open` → `support.conversation.opened` | `resolveCanonicalUserIdFromIdentityId(txDb, rawIdentityId)` (identity → user → merge chain) | **PASS** |
| `question.create` → `support.question.created` | `resolveCanonicalUserIdFromIdentityId(txDb, userIdentityId)` | **PASS** |
| `notifications.update` → `preferences.updated` | `resolveCanonicalIntegratorUserId(txDb, uid)` | **PASS** |
| `reminders.rule.upsert` → `reminder.rule.upserted` | `resolveCanonicalIntegratorUserId(txDb, userId)`; доменный upsert с тем же canonical `userId` | **PASS** |
| `reminders.occurrence.markSent` / `markFailed` → `reminder.occurrence.finalized` | `resolveCanonicalIntegratorUserId(txDb, ctx.userId)` | **PASS** |
| `reminders.delivery.log` → `reminder.delivery.logged` | `resolveCanonicalIntegratorUserId(txDb, ctx.userId)` | **PASS** |
| `content.access.grant.create` → `content.access.granted` | `resolveCanonicalIntegratorUserId(txDb, userId)`; grant INSERT с тем же id | **PASS** |
| `user.subscription.upsert` → `user.subscription.upserted` | `resolveCanonicalIntegratorUserId(txDb, String(userId))` | **PASS** |
| `mailing.log.append` → `mailing.log.sent` | `resolveCanonicalIntegratorUserId(txDb, String(userId))`; INSERT `mailing_logs` с каноническим numeric id | **PASS** |

### 1.2 События без поля `integratorUserId` в payload

| Событие | Комментарий | Статус |
|---------|-------------|--------|
| `booking.upsert` → `appointment.record.upserted` | Top-level без `integratorUserId`; в **projection** копия `payloadJson` проходит `canonicalizeIntegratorUserIdKeysInObject` (ключи `integratorUserId`, `integrator_user_id`). Исходный `payload_json` в `rubitime_records` без изменений. | **PASS** (pass 2 §7) |
| `support.conversation.message.appended` | Нет user id в payload | **PASS (N/A)** |
| `support.conversation.status.changed` | Нет user id в payload | **PASS (N/A)** |
| `support.question.message.appended` / `support.question.answered` | Нет user id в payload | **PASS (N/A)** |
| `support.delivery.attempt.logged` | Нет user id в payload | **PASS (N/A)** |
| `mailing.topic.upserted` | Нет user id | **PASS (N/A)** |

**Вывод §1:** для всех путей, где в projection-payload передаётся идентификатор integrator-пользователя (`integratorUserId` или его логический смысл после identity→user), канонизация выполняется **в той же транзакции**, до вызова `enqueueProjectionEvent`.

---

## 2) Idempotency key: alias vs winner и устойчивость

### 2.1 Стабильный идентификатор содержит numeric user id

| Ключ | Поведение после Stage 2 | Статус |
|------|-------------------------|--------|
| `user.upserted` | `projectionIdempotencyKey(..., canonicalUserId, hashPayload(payload))` — стабильная часть и payload согласованы с winner | **PASS** |
| `contact.linked` | Стабильная часть = `canonicalUid`; payload с тем же `integratorUserId` | **PASS** |
| `preferences.updated` | Стабильная часть = `canonicalUid` | **PASS** |
| `user.subscription.upserted` | Сегмент `` `${canonicalUserId}:${topicId}` `` + fingerprint с canonical в payload | **PASS** |
| `mailing.log.sent` | Сегмент `` `${canonicalUserIdStr}:${mailingId}` `` + fingerprint с canonical | **PASS** |

**Следствие:** для одного и того же бизнес-события, если ранее в стабильную часть попадал loser id, а теперь — winner, ключ **намеренно** становится тем же, что и при изначальной записи с winner (при идентичном fingerprint), что устраняет дубликаты логического события alias/winner для этих типов.

### 2.2 Стабильный идентификатор — entity id; fingerprint и `integratorUserId`

| Ключ | Поведение | Статус |
|------|-----------|--------|
| `support.conversation.opened` | Стабильно `integratorConversationId`; fingerprint = `hashPayloadExcludingKeys(payload, ['integratorUserId'])` — поле `integratorUserId` остаётся в **payload** для webapp (канонический `users.id`), но **не** входит в idempotency-fingerprint. Одно и то же открытие диалога не получает разный ключ из‑за смены представления user id (identity vs canonical и т.д.). | **PASS** (после follow-up §6) |
| `support.question.created` | Аналогично: стабильно `integratorQuestionId`; fingerprint без `integratorUserId`. | **PASS** (после follow-up §6) |
| `reminder.rule.upserted` | Стабильно `ruleId`; fingerprint включает `integratorUserId` (canonical). Старые правила на loser `user_id` дают другой fingerprint, чем после переноса на winner — ожидаемо при смене владельца правила. | **PASS / осознанная семантика** |
| `reminder.occurrence.finalized` / `reminder.delivery.logged` / `content.access.granted` | Стабильно occurrence / log / grant id; fingerprint обновлён на canonical user — согласовано внутри одной версии кода. | **PASS** |

**Вывод §2:** расхождение alias/winner для user-scoped стабильных ключей устранено (§2.1). Для `support.conversation.opened` / `support.question.created` fingerprint больше не зависит от `integratorUserId` в payload.

**Операционное замечание:** при выкатке версии с `hashPayloadExcludingKeys` pending-строки в `projection_outbox`, посчитанные **старой** формулой fingerprint (с `integratorUserId` внутри hash), могут иметь **другой** `idempotency_key`, чем новые вставки для того же бизнес-события — типичный one-time cutover; при необходимости — drain/reconcile по `integratorConversationId` / `integratorQuestionId`.

---

## 3) «Silent resurrection» loser id на write path

### 3.1 Явно защищённые пути (новые доменные записи на `users.id`)

| Путь | Механизм | Статус |
|------|----------|--------|
| `setUserPhone` | Редирект на `resolveCanonicalIntegratorUserId` перед `INSERT` в `contacts` | **PASS** |
| `reminders.rule.upsert` | Canonical `userId` в `upsertReminderRule` | **PASS** |
| `content.access.grant.create` | Canonical в `createContentAccessGrant` | **PASS** |
| `mailing.log.append` | Canonical в `insertMailingLog`; при нечисловом canonical после resolve — **warn + ранний return** (не silent запись на некорректный id) | **PASS** |

### 3.2 Пути без канонизации `users.id` (остаточный scope Stage 2)

| Путь | Поведение | Статус |
|------|-----------|--------|
| `user.upsert` → `upsertUser` | Профиль/состояние ведётся по **identity** и `telegram_state`; identity может оставаться на **alias** `users.id` до Stage 3 (repoint / merge). Новые «живые» данные на строке `users` loser не создаются через отдельные таблицы в §3.1, но **telegram_state** привязан к identity loser — обновления профиля/state не проходят через `resolveCanonicalIntegratorUserId`. | **GAP (документировать / Stage 3)** |
| `user.state.set` / `updateNotificationSettings` | Запись в `telegram_state` по identity, без редиректа на canonical user | **GAP (тот же класс)** |
| `insertConversation`, drafts, вопросы | Ключи — `user_identity_id` / identity; не пишут напрямую в `contacts` / `user_reminder_rules` с сырым loser из новых API без merge | **PASS с оговоркой** (merge identity→canonical user — Stage 3) |

**Вывод §3:** **нет** обнаруженных путей, где после Stage 2 в **контакты / reminder rules / content grants / mailing_logs** тихо пишется **loser** `users.id` при известной цепочке merge — эти пути редиректятся. Остаётся класс **identity-scoped** записей (`upsertUser`, state, notifications), где loser «оживает» только в смысле subgraph identity до merge — это вне заявленного полного закрытия Stage 2 без Stage 3.

---

## 4) CI evidence

| Проверка | Результат (на момент аудита) |
|----------|------------------------------|
| Полный pipeline из корня | `pnpm run ci` — **exit 0** |
| Integrator tests | **630 passed**, 6 skipped (vitest `--run`; после pass 2 §7) |
| Webapp tests | **1391 passed** (в составе `pnpm run ci`) |
| Сборки | `apps/integrator` + `apps/webapp` production build — **OK** |
| Audit prod dependencies | `pnpm audit --prod` — **No known vulnerabilities** (в конце `pnpm run ci`) |

**Воспроизведение:** из корня репозитория:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

Журнал агента с тем же контрактом: [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) — запись «2026-04-10 — Stage 2».

---

## 5) Gate verdict (Stage 2 — репозиторий + CI)

| Критерий пользователя | Вердикт |
|------------------------|---------|
| (1) Canonical resolution до enqueue | **PASS** по таблице §1 |
| (2) Idempotency alias/winner | **PASS** (§2.1–§2.2, в т.ч. support-события после §6) |
| (3) Нет silent resurrection loser на user_id–таблицах §3.1 | **PASS**; **GAP** на identity/state path (§3.2) — не silent в смысле отдельного INSERT на `contacts`/rules/grants/logs |
| (4) CI evidence | **PASS** (§4) |

**Итог:** **PASS (repository + CI)** для объёма Stage 2; **GAP** по identity/state (§3.2) остаётся вне закрытия Stage 2 — Stage 3.

---

## 6) Follow-up 2026-04-10 — fingerprint support-событий

**Цель:** устранить FINDING первоначального аудита §2.2 (fingerprint зависел от `integratorUserId` при смене identity id → canonical `users.id`).

**Код:**

- [`apps/integrator/src/infra/db/repos/projectionKeys.ts`](../../apps/integrator/src/infra/db/repos/projectionKeys.ts) — `hashPayloadExcludingKeys(payload, exclude)`.
- [`apps/integrator/src/infra/db/writePort.ts`](../../apps/integrator/src/infra/db/writePort.ts) — для `support.conversation.opened` и `support.question.created` idempotency fingerprint строится через `hashPayloadExcludingKeys(..., ['integratorUserId'])`; полный `payload` для доставки в webapp без изменений.

**Тесты:** `projectionKeys.test.ts` — стабильность fingerprint при разных `integratorUserId` при исключении ключа.

**CI (после follow-up):** `pnpm run ci` — **OK** (integrator 628 / webapp 1391 tests).

**Gate:** FINDING §2.2 закрыт; cutover-замечание по старым pending ключам — см. конец §2.2.

---

## 7) Повторный аудит Stage 2 (pass 2)

**Цель:** закрыть пробел относительно [`STAGE_2_CANONICAL_READ_WRITE_PATH.md`](STAGE_2_CANONICAL_READ_WRITE_PATH.md) — явная **политика redirect** в документе; отсутствие loser-only id в **вложенном** `payloadJson` у `appointment.record.upserted` (webapp читает `integratorUserId` / `integrator_user_id` из JSON).

### 7.1 Сверка со спекой Stage 2

| Критерий | Статус |
|----------|--------|
| П. «выбрать политику и задокументировать» (redirect vs reject) | **PASS** — раздел «Политика write path» в [`STAGE_2_CANONICAL_READ_WRITE_PATH.md`](STAGE_2_CANONICAL_READ_WRITE_PATH.md) |
| CHECKLISTS Deploy 2 «зафиксировать в коде и STAGE_2» | **PASS** |
| `appointment.record.upserted` не несёт alias id внутри `payloadJson` в projection | **PASS** — `canonicalizeIntegratorUserIdKeysInObject` + тест `writePort.appointments.test.ts` |

### 7.2 Код (pass 2)

- [`canonicalUserId.ts`](../../apps/integrator/src/infra/db/repos/canonicalUserId.ts) — `canonicalizeIntegratorUserIdKeysInObject`.
- [`writePort.ts`](../../apps/integrator/src/infra/db/writePort.ts) — `booking.upsert`: клон `payloadJson` для projection, канонизация ключей, затем `enqueueProjectionEvent`.

### 7.3 CI (pass 2)

`pnpm run ci` из корня — **OK** (integrator 630 / webapp 1391 tests, build, `pnpm audit --prod`).

### 7.4 Gate verdict (pass 2)

**PASS** — замечание первого прогона по незафиксированной политике и риску nested integrator id в appointment projection устранены в границах Stage 2; §3.2 (identity/state) по-прежнему Stage 3.

---

## MANDATORY FIX INSTRUCTIONS

Инструкции обязательны для любого последующего PR, который трогает integrator projection / user id writes.

1. **Новый вызов `enqueueProjectionEvent` в integrator**  
   Если в `payload` есть `integratorUserId` (или семантически то же — webapp ждёт `users.id`), **до** сборки `idempotencyKey` и **до** `enqueueProjectionEvent` вызвать `resolveCanonicalIntegratorUserId` или `resolveCanonicalUserIdFromIdentityId` (если на входе `identities.id`). Запрещено копировать сырой loser id из БД в outbox для user-scoped событий. Для `appointment.record.upserted` при наличии в **копии** `payloadJson` полей `integratorUserId` / `integrator_user_id` — `canonicalizeIntegratorUserIdKeysInObject` (см. `booking.upsert` в `writePort.ts`).

2. **Составной стабильный ключ с user id**  
   Любой шаблон вида `` `${userId}:...` `` в `projectionIdempotencyKey` должен использовать **тот же** строковый canonical `users.id`, что и поле `integratorUserId` в payload (после resolve).

3. **Новые INSERT/UPDATE по `users.id`** в таблицах домена (`contacts`, `user_reminder_rules`, `content_access_grants`, `mailing_logs`, и аналоги)  
   В той же транзакции подставлять canonical id (как в `setUserPhone` / `writePort` для rules, grants, mailing log). Не добавлять обходные INSERT с сырым `identities.user_id` без resolve.

4. **Support-события с fingerprint-only idempotency** (`support.conversation.opened`, `support.question.created`)  
   Fingerprint **не** должен включать `integratorUserId` — использовать `hashPayloadExcludingKeys(payload, ['integratorUserId'])` (или эквивалент). При смене формулы fingerprint на выкатке учитывать возможный one-time рассинхрон с уже pending строками outbox (см. §2.2 операционное замечание).

5. **Identity/state path (`upsertUser`, `setUserState`, `updateNotificationSettings`)**  
   До Stage 3 не считать закрытым требование «никаких обновлений на alias»; любой PR, который должен это закрыть, должен явно реализовать политику (редирект canonical user + согласованный projection) и обновить этот аудит.

6. **Перед merge в main**  
   Выполнить из корня: `pnpm install --frozen-lockfile && pnpm run ci` (как в [`pre-push-ci`](../../.cursor/rules/pre-push-ci.mdc)); не полагаться только на частичный lint/test.

---

## Связанные документы

- [`STAGE_2_CANONICAL_READ_WRITE_PATH.md`](STAGE_2_CANONICAL_READ_WRITE_PATH.md)
- [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md)
- [`CHECKLISTS.md`](CHECKLISTS.md) (Deploy 2 — пункт про canonical перед enqueue)
