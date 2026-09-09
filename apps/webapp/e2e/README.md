# Webapp test topology

Каноническая схема новых тестов:

- `src/**/*.unit.test.ts` → Vitest project `unit`, environment `node`;
- `src/**/*.route.test.ts` → project `route`, environment `node`;
- `src/**/*.postgres.integration.test.ts` → зарезервировано для одноразовой PostgreSQL и намеренно не входит
  ни в один DB-free project до готовности G0/T1.

`fast` — временный legacy-project на период cutover. Он не подхватывает новые suffix-категории и legacy
`*.devDb.integration.test.ts`. Новые тесты в `fast` не добавляются.

Категории unit/route запускаются отдельными командами, а `test:webapp:behavior` вызывает их последовательно.
Поэтому отсутствие файлов в любой активной категории завершает её команду ошибкой вместо зелёного «0 tests».
В CI это отдельный обязательный job на каждом push/PR.

## Границы

- Route-тест вызывает публичную HTTP-границу (`Request`/route handler/proxy) и проверяет HTTP outcome.
- Автоматизированные UI-тесты запрещены; интерфейс принимается только live по `AGENTS.md` §10a.
- Тяжёлый импорт `page.tsx` не является нормальным способом unit/route-тестирования. Выносите публичное
  поведение в более узкую границу; редкий настоящий e2e-сценарий должен быть обоснован отдельно.
- `USE_REAL_DATABASE=1` — явный legacy opt-in. Без него Vitest не читает `.env.dev`, не подключается к DEV и
  не запускает миграции.

## Команды

- `pnpm test:webapp:unit`
- `pnpm test:webapp:route`
- `pnpm test:webapp:behavior` — обе активные категории с отдельным zero-file fail;
- `pnpm test:webapp:fast` — только временный legacy-shard;
- `pnpm test:webapp` — полный текущий webapp-набор.
