# Webapp tests: baseline и шарды (оператор)

Цель — зафиксировать **до/после** для PR по оптимизации CI (wall-time, top-slow файлы, равномерность шардов). Правило агентов не раздувать тесты: [`AGENTS.md` §11](../../../AGENTS.md#11-webapp-тесты-компактность).

## Команды (локально, из корня репозитория)

Полный fast-проект с подробным репортом:

```bash
pnpm test:webapp:fast -- --reporter=verbose 2>&1 | tee /tmp/webapp-fast-verbose.log
```

Один шард (как в GHA):

```bash
VITEST_SHARD=1/3 pnpm test:webapp:fast -- --reporter=verbose 2>&1 | tee /tmp/webapp-fast-shard1.log
```

Поведенческий набор (projects `unit`+`route`+`ui`, job `test-webapp-behavior` в GHA — гоняется на каждом push и PR,
не только на `main`):

```bash
pnpm test:webapp:behavior -- --reporter=verbose 2>&1 | tee /tmp/webapp-behavior-verbose.log
```

Разбор «кто дольше всех» — по выводу `Duration` у файлов в логе или через `rg` по паттерну Vitest.

## Таблица (заполнять после замеров)

| Дата (UTC) | Окружение         | Команда                      | Wall-time (с) | Примечание                                        |
| ---------- | ----------------- | ---------------------------- | ------------- | ------------------------------------------------- |
| _TBD_      | GHA ubuntu-latest | `test-webapp-core` shard 1/3 |               | Заполнить по первому зелёному прогону после merge |
| _TBD_      | GHA               | shard 2/3                    |               |                                                   |
| _TBD_      | GHA               | shard 3/3                    |               |                                                   |
| _TBD_      | GHA               | `test-webapp-behavior`       |               | Каждый push и PR, не только `main`                |

Кэш Vitest: `apps/webapp/node_modules/.vite` и `node_modules/.experimental-vitest-cache` (см. `vitest.config.ts`); в GHA ключ кэша включает **номер шарда**, чтобы не конфликтовать при параллельной записи.
