# Stage 2 — Canonical read/write path (Deploy 2)

**Цель:** любой код integrator, который **эмитит** `projection_outbox` или **пишет** по `users.id`, должен опираться на **canonical** `users.id` (winner), а alias-строки не должны получать новые «живые» данные.

## Ключевые точки кода (ориентиры)

| Область | Файлы |
|---------|--------|
| Enqueue событий | [`apps/integrator/src/infra/db/writePort.ts`](../../apps/integrator/src/infra/db/writePort.ts) |
| Outbox repo | [`apps/integrator/src/infra/db/repos/projectionOutbox.ts`](../../apps/integrator/src/infra/db/repos/projectionOutbox.ts) |
| Создание / upsert пользователей | [`apps/integrator/src/infra/db/repos/channelUsers.ts`](../../apps/integrator/src/infra/db/repos/channelUsers.ts) и связанные repos |

## Алгоритм canonical resolution

1. Ввести helper уровня БД или TS: `resolveCanonicalUserId(db, id) -> bigint` — если `merged_into_user_id` не NULL, следовать к winner (с защитой от циклов, max depth).
2. Перед `enqueueProjectionEvent`: подставлять в payload **`integratorUserId`** = canonical text/id.
3. На write path: если входной user id — alias, либо **редирект** на canonical в той же транзакции, либо **отказ** с явной ошибкой (выбрать одну политику и задокументировать).

## Идемпотентность

- `projectionIdempotencyKey` сейчас завязан на user id и fingerprint payload ([`projectionKeys.test.ts`](../../apps/integrator/src/infra/db/repos/projectionKeys.test.ts)). После canonicalization ключи должны строиться от **canonical** id, иначе возможны дубликаты логического события для alias vs winner — это нужно покрыть тестами.

## Ограничения Stage 2

- **Не** снимать webapp blocker.
- **Не** выполнять merge двух users в этом деплое (только подготовка путей).

## Тесты

- Unit: canonical resolution (alias chain).
- Интеграционные: mock DB или testcontainers по политике проекта.
- Регрессия: существующие тесты `writePort.*.test.ts` на outbox.

## Gate

- Нет регрессии projection-health; новые события не несут loser-only id в payload там, где ожидается canonical.

## Связь с todo «canonical-write-path»

Реализация = PR по перечисленным файлам + тесты; этот документ — чек-лист и контракт поведения.
