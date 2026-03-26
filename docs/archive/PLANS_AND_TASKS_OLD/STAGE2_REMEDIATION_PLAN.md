# Stage 2 Remediation Plan

План исправления найденных ошибок реализации Stage 2 (`patient master migration`) после review.

Связанные документы:
- [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md)
- [DB_MIGRATION_STAGE2_PATIENT_MASTER.md](./DB_MIGRATION_STAGE2_PATIENT_MASTER.md)

---

## Цель remediation

Довести текущую реализацию Stage 2 до состояния, соответствующего roadmap:
- projection не теряет события;
- idempotency и retry работают предсказуемо;
- person-domain перенос устойчив к out-of-order;
- user ID contract безопасен для `BIGINT`;
- backfill и reconciliation формализованы.

---

## Найденные ошибки (scope remediation)

1. Projection emit в `integrator` реализован как fire-and-forget без durable retry слоя.
2. `contact.linked` / `preferences.updated` могут падать при out-of-order доставке, если master mapping ещё не создан.
3. `integratorUserId` гоняется как JS `number`, что рискованно для `BIGINT/BIGSERIAL`.
4. Для части projection событий idempotency key строится на `Date.now()`, что ломает дедупликацию retries.
5. Нужно явно зафиксировать backfill/reconciliation для уже существующих пользователей.

---

## Приоритизация

### P0 (обязательно до следующего domain move)

1. Durable projection delivery.
2. Out-of-order safe event handling.
3. Bigint-safe ID contract между сервисами.
4. Deterministic idempotency keys.

### P1 (обязательно до read-switch в Stage 3/4)

5. Backfill script + reconciliation pack для person-domain.
6. Операционные runbook/metrics/alerts для projection lag и retry failures.

---

## План работ

## Шаг 1. Durable projection transport (P0)

**Цель:** убрать зависимость от best-effort emit.

Задачи:
- Ввести projection outbox (или переиспользовать существующую job queue с durable storage).
- После domain write в `integrator` сохранять projection-команду в outbox.
- Отдельный worker отправляет в webapp с retry/backoff.
- Добавить dead-letter статус после исчерпания попыток.

DoD:
- Сбой сети/webapp не приводит к потере projection события.
- Событие гарантированно доезжает или попадает в DLQ с наблюдаемой ошибкой.

---

## Шаг 2. Deterministic idempotency keys (P0)

**Цель:** retries дедуплицируются корректно.

Задачи:
- Для `user.upserted`, `contact.linked`, `preferences.updated` перейти на ключи, детерминированные от бизнес-данных.
- Запретить ключи вида `*:${Date.now()}` для projection событий.
- Зафиксировать policy в contract doc.

Пример паттерна:
- `contact.linked:{integratorUserId}:{phoneNormalized}`
- `preferences.updated:{integratorUserId}:{topics_hash}`

DoD:
- Повторная отправка одного и того же события не создаёт дубликатов и не расходится по состоянию.

---

## Шаг 3. Bigint-safe user ID contract (P0)

**Цель:** исключить потерю точности ID.

Задачи:
- В event payload и типах перейти на bigint-safe representation (`string`).
- Убрать `Number(...)` преобразования для canonical user IDs в межсервисных payload.
- Обновить валидацию и docs контракта.

DoD:
- Любой `BIGINT` user id корректно проходит integrator -> webapp без потери точности.

---

## Шаг 4. Out-of-order safe handlers в webapp (P0)

**Цель:** `contact/preferences` события не падают при временном отсутствии master row.

Задачи:
- Для `contact.linked` / `preferences.updated` добавить fallback path:
  - если `findByIntegratorId` не нашёл пользователя, выполнить safe upsert/create mapping;
  - затем применить контакт/настройки.
- Зафиксировать policy в tests: out-of-order sequence считается штатным.

DoD:
- Последовательности `contact -> user` и `preferences -> user` не приводят к устойчивой деградации.

---

## Шаг 5. Backfill + reconciliation для Stage 3 (P1)

**Цель:** закрыть переход существующих пользователей.

Задачи:
- Реализовать одноразовый backfill скрипт:
  - `integrator.users/contacts/identities/telegram_state` -> `webapp.platform_users/...`.
- Реализовать reconciliation скрипты:
  - counts;
  - sampled record matching;
  - mismatch report.
- Подготовить rollback правила для backfill execution window.

DoD:
- До read-switch есть отчёт о совпадении данных по согласованным порогам качества.

---

## Шаг 6. Operability и release gate (P1)

**Цель:** эксплуатационная управляемость projection слоя.

Задачи:
- Метрики: queue depth, retry count, DLQ size, oldest event age (lag).
- Alerts: sustained lag, retry storm, DLQ growth.
- Release gate: запрет read-switch при невыполненных порогах projection health.

DoD:
- Перед cutover есть объективные сигналы здоровья projection контура.

---

## Suggested execution order

1. Шаг 1 -> 2 -> 3 (единый PR/серия PR по transport+contract).
2. Шаг 4 (обработчики и тесты out-of-order).
3. Шаг 5 (backfill + reconciliation dry-run).
4. Шаг 6 (операционные гейты) и только потом read-switch для person-domain.

---

## Критерий закрытия remediation

Remediation считается завершённым, когда одновременно выполнены условия:
- projection delivery durable и наблюдаемый;
- deterministic idempotency включён на person-domain событиях;
- bigint-safe user ID contract внедрён end-to-end;
- out-of-order обработка подтверждена тестами и runtime проверками;
- backfill + reconciliation готовы к выполнению перед read-switch.
