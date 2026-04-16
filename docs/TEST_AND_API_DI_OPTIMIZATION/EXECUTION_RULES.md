# Execution rules (будущий исполнитель)

Жёсткие ограничения для агентов и разработчиков, продолжающих инициативу после discovery.

## Запреты

1. **Не удалять тесты** без documented mapping: `old path` → `replacement path(s)` + краткое обоснование (почему coverage сохраняется).
2. **Не снижать critical behavioral coverage** — семейства сценариев из `test-optimization/PLAN.md` (auth exchange, integrator signed/idempotency, messaging/reminders, media contracts, merge/purge) должны оставаться проверяемыми.
3. **Не смешивать эффекты метрик:** улучшение `pnpm test:webapp` после трека A не может быть засчитано как результат трека B и наоборот. Фиксировать отдельные замеры в соответствующих `LOG.md`.
4. **Не переносить business logic в `route.ts`** — только parse/validate/auth/HTTP mapping и вызов сервисов/портов.
5. **Не делать ad-hoc wiring в `route.ts`**, если сборка зависимостей должна жить в app-layer / `buildAppDeps` / выделенной фабрике (см. исключения ниже).
6. **Не менять семантику CI и не трогать GitHub deploy flow:** не редактировать `.github/workflows/ci.yml`, job **Deploy** и связанные шаги без отдельного решения команды — пайплайн считается корректным. Любое исключение — только с явной записью в `LOG.md` и вне scope обычного PR по этой инициативе. Локально: между коммитами руководствоваться `.cursor/rules/test-execution-policy.md`; полный `pnpm run ci` — сценарий **пуша** (`.cursor/rules/pre-push-ci.mdc`).

## DI и «чистые» хелперы

- **Pure stateless helpers** не нужно насильно проводить через DI.
- **Исключения из import policy** (например оставить прямой `verifyIntegratorGetSignature` в роуте или логгер) должны быть **явно перечислены** в `api-di-boundary-normalization/PLAN.md` с обоснованием.

## Предлагаемая целевая политика импортов API-слоя (ориентир)

Согласовать с кодом после рефакторинга; не объявлять «новую религию» врозь с `api.md`:

- **Allowed (обычно):** `next/server`, `@/app-layer/*`, `@/modules/*`, `@/shared/*` (типы/чистые утилиты), относительные импорты внутри `app/api` если это только HTTP-обвязка.
- **Restricted в `route.ts`:** прямые `@/infra/db/client`, `@/infra/repos/*`, `@/infra/s3/*`, `@/infra/idempotency*`, тяжёлые `@/infra/*` клиенты — переносить за фасад, собираемый из composition root.
- **Кандидаты на исключение (confirmed в коде сегодня):** тонкие обёртки вроде `verifyIntegratorGetSignature` / `verifyIntegratorGetSignature` из `@/infra/webhooks/verifyIntegratorSignature`; `logger` / `logServerRuntimeError` — решить, остаются ли в роуте как cross-cutting (зафиксировать в PLAN трека B).

## Валидация (уровни, не «всё всегда»)

Между коммитами — **не** норма гонять полный монорепо CI и **не** обязательно полные `pnpm test` + `pnpm test:webapp` после каждого микрошага. Использовать:

- **Step:** таргетированный Vitest, узкий lint/typecheck затронутого приложения (см. `.cursor/rules/test-execution-policy.md`).
- **Phase:** полный набор тестов **того** приложения, где закрыт логический кусок работы (`pnpm test:webapp` или `pnpm test` с корня — по факту изменений).
- **Full CI:** `pnpm install --frozen-lockfile && pnpm run ci` — перед **пушем** в remote, при repo-уровневых изменениях (shared, lockfile, корневые конфиги, **если бы** меняли workflow — в этой инициативе workflow не меняем), или по явной просьбе «как в CI».

Повторный тот же прогон без новых изменений кода — не делать (reuse rule в test-execution-policy).

Перед пушем (обязательное правило репозитория):

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

## Отчётность

- Каждый значимый шаг: дата, команды, краткий итог, ссылки на коммиты — в соответствующий `LOG.md`.
- Любое изменение `docs/ARCHITECTURE/*` или `apps/webapp/src/app/api/api.md` — только **сверка с фактическим кодом** (пути, имена функций, статусы HTTP).

## Синхронизация с архитектурной документацией

- Правки в `docs/ARCHITECTURE/*` — точечные, с указанием «что устарело / что стало».
- Не вводить абстрактные политики без ссылки на файл в репозитории.

## Пошаговые промпты для агента

Готовые блоки для чата — в `PROMPTS_EXEC_AUDIT_FIX.md` (тот же каталог, что и этот файл).
