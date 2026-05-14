# Webapp tests: baseline и шарды (оператор)

Цель — зафиксировать **до/после** для PR по оптимизации CI (wall-time, top-slow файлы, равномерность шардов). Правило агентов не раздувать тесты: [`.cursor/rules/webapp-tests-lean-no-bloat.mdc`](../../../.cursor/rules/webapp-tests-lean-no-bloat.mdc).

## Команды (локально, из корня репозитория)

Полный fast-проект с подробным репортом:

```bash
pnpm test:webapp:fast -- --reporter=verbose 2>&1 | tee /tmp/webapp-fast-verbose.log
```

Один шард (как в GHA):

```bash
VITEST_SHARD=1/3 pnpm test:webapp:fast -- --reporter=verbose 2>&1 | tee /tmp/webapp-fast-shard1.log
```

In-process (после прогона на `main` в CI можно снять аналогично):

```bash
pnpm test:webapp:inprocess -- --reporter=verbose 2>&1 | tee /tmp/webapp-inprocess-verbose.log
```

Разбор «кто дольше всех» — по выводу `Duration` у файлов в логе или через `rg` по паттерну Vitest.

## Таблица (заполнять после замеров)

| Дата (UTC) | Окружение | Команда | Wall-time (с) | Примечание |
|------------|-------------|---------|---------------|------------|
| _TBD_      | GHA ubuntu-latest | `test-webapp-core` shard 1/3 | | Заполнить по первому зелёному прогону после merge |
| _TBD_      | GHA | shard 2/3 | | |
| _TBD_      | GHA | shard 3/3 | | |
| _TBD_      | GHA | `test-webapp-inprocess` (×3) | | Только `push` → `main` |

Кэш Vitest: `apps/webapp/node_modules/.vite` и `node_modules/.experimental-vitest-cache` (см. `vitest.config.ts`); в GHA ключ кэша включает **номер шарда**, чтобы не конфликтовать при параллельной записи.
