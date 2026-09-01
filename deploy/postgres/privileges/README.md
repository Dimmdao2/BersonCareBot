# `deploy/postgres/privileges/` — единая декларация прав БД

## Что является источником истины

[`declaration.ts`](./declaration.ts) — исполняемый источник DEV/TEST для:

- общих capability/seam-owner ролей;
- четырёх login на среду: webapp staff, patient, global admin и integrator;
- точных memberships, CONNECT и schema usage;
- ACL таблиц, колонок, последовательностей и функций;
- FORCE RLS и точных policy;
- transaction-bound port context и каталога допустимых вызовов.

Обычный deploy/migrate после schema/data migrations запускает
[`reconcile-access.mjs`](./reconcile-access.mjs). Он одной транзакцией приводит target к декларации и затем
двусторонне проверяет каталог. Schema migrations не выдают и не отзывают права.

Верхняя часть `declaration.ts` хранит нейтральный инвентарь объектов, из которого Revision 10 строит текущую
модель. Исторические `revoke`, старые owner-gates, прежняя очередь `CODE_MUST_CHANGE`, старые login и роли в
исполняемый объект не переносятся. `zeroState.legacyRoles` пуст: DEV/TEST не сохраняют карантинные роли.

PROD не входит в текущий объект декларации. Его переход из старого снимка A в B0 — отдельная атомарная миграция
с rollback после явного разрешения владельца; DEV/TEST-конфигурацию нельзя молча выдать за PROD target.

## Проверки

Типы:

```bash
./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges
```

Синхронизация закоммиченных артефактов:

```bash
node deploy/postgres/privileges/generate-cli.mjs --check
```

Перепись production callsites против объявленных relation surfaces:

```bash
node deploy/postgres/privileges/generate-cli.mjs --census
```

Полная быстрая группа DB-гейтов:

```bash
pnpm run test:db-privileges
```

Генерация после намеренной правки декларации:

```bash
node deploy/postgres/privileges/generate-cli.mjs --all
node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only
```

Генератор пишет только в [`deploy/postgres/generated`](../generated). Пароли и приватные ключи туда не попадают:
login-render получает их из env во время применения.

## Текущая форма

На обеих управляемых базах объявлено 221 физическое отношение: 208 активных, 10 ожидающих удаления и три уже
снятых записи инвентаря. Текущая Revision 10 содержит:

- 0 табличных `revoke` из старого снимка;
- 0 `grantMatrix: G2-pending`;
- 0 открытых owner-gates;
- 0 пунктов старой очереди `CODE_MUST_CHANGE`;
- 0 карантинных legacy-ролей.

Сами числа экспортирует `DECLARATION_STATS`, поэтому документация не должна поддерживать второй ручной счётчик.

## Границы

- `saas_telemetry_operator` — действующая узкая SET-role внутри общего webapp staff pool, не отдельный login.
- `app_seam_public_clinic_card_owner` — отдельный владелец шва карточки клиники; он не объединяется с владельцем
  slug, потому что это расширило бы права.
- Исторические migrations и evidence не переписываются. Они объясняют переход, но не являются ordinary deploy.
- Новый доступ добавляется только от доказанной потребности человека к точному relation/function surface.
- Неизвестный relation, login, membership, ACL или policy должен красить генератор/каталожный verifier, а не
  приниматься как совместимость.

## Связанные документы

- [`SCHEME.md`](../../../docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md) — действующая архитектура слоя;
- [`PLAN.md`](../../../docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md) — актуальный статус и внешние live-гейты.

Промежуточные модели, findings и audit logs удалены из checkout; история остаётся в Git.
