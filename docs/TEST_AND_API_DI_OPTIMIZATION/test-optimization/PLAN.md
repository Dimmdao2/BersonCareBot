# PLAN — test optimization track (исполнительский)

**Scope:** только тесты и (при необходимости) конфигурация Vitest **без** изменения семантики CI jobs без явного решения. Прод-код **не** менять в этом треке.

## Цель

- Сократить wall time и стоимость сопровождения **webapp** Vitest suite (primary), сохранив критичные контракты.
- Вторично: оценить integrator suite (**~7.6s** wall на baseline) — возможно, только классификация без удалений.

## Non-goals

- Рефакторинг `route.ts` / DI (**трек B**).
- Изменение продуктового поведения.
- Удаление или ослабление security assertions без замены.
- «Оптимизация» за счёт отключения flaky тестов без диагностики.

## Baseline commands (confirmed)

Из root репозитория:

```bash
pnpm test
pnpm test:webapp
```

Полный контракт перед пушем:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

Дополнительно (не в CI script, но в root `package.json` есть):

```bash
pnpm webapp:typecheck
```

**Примечание:** root `pnpm run ci` **не** вызывает `webapp:typecheck` автоматически — **confirmed** по [`package.json`](../../../package.json); имеет смысл гонять вручную при изменениях типов в webapp.

## Типология тестов (адаптация под репозиторий)

| Уровень | Где | Примеры путей | Примечание |
|---------|-----|---------------|------------|
| **Unit / module** | `apps/webapp/src/**/*.test.ts(x)` вне `app/api` | `modules/*`, `infra/*.test.ts`, UI `*.test.tsx` | Большой объём; трогать осторожно |
| **Route colocated** | `apps/webapp/src/app/api/**/route.test.ts` | **105** файлов | Основной контракт HTTP |
| **In-process workflow** | `apps/webapp/e2e/**/*.test.ts` | `api-routes-inprocess.test.ts`, `messaging-inprocess.test.ts`, … | Запускаются в том же `vitest --run`, что и весь `src/` |
| **Live / dev** | `e2e/live-dev.test.ts` | Требует `E2E_LIVE_DEV=1` для script `test:e2e:live` | **likely** не в дефолтном CI пути — проверить include |

## Критерии low-value duplicate (кандидат на review)

- Повторяет **те же assertion’ы** на те же статусы/JSON keys, что colocated `route.test.ts`, без дополнительного состояния (cookie chain, multi-step).
- «Smoke» на импорт модуля без поведенческой проверки — **needs verification** файл за файлом.

## Критерии «нельзя удалять» (первая волна)

- Единственный тест на семейство: integrator **signature + idempotency** (`integrator/events`, `messenger-phone/bind`, `reminders/dispatch`).
- Auth: `auth/exchange`, `telegram-init`, `max-init`, OAuth callbacks, pin/phone flows.
- Media: presign/multipart/confirm/`GET media/[id]`.
- Merge/purge: `doctor/clients/merge`, `integrator-merge`, `permanent-delete`, merge-preview/candidates.
- Любой тест, единственный в файле на регрессию из **docs/** или production incident log.

## Кандидаты на review / merge / remove (**likely**, не утверждено)

Проверить построчно против соответствующих `route.test.ts`:

| Файл | Почему кандидат |
|------|-----------------|
| `apps/webapp/e2e/api-routes-inprocess.test.ts` | Может дублировать множество colocated route tests |
| `apps/webapp/e2e/api-health.test.ts` | Тонкий smoke рядом с `health/route` tests — **needs verification** |
| `apps/webapp/e2e/api-auth-exchange.test.ts` | Пересечение с `auth/exchange/route.test.ts` — **needs verification** |
| `apps/webapp/e2e/messaging-inprocess.test.ts` | Workflow vs `doctor/messages/*` route tests |
| `apps/webapp/e2e/cms-media-inprocess.test.ts` | Workflow vs media/admin media route tests |
| `apps/webapp/e2e/api-integrator-subscriptions-inprocess.test.ts` | Сравнить с `integrator/subscriptions/*/route.test.ts` |

**Не трогать до аудита:** `live-dev.test.ts` (внешняя среда), крупные `doctor-*-inprocess`, `stage13-legacy-cleanup.test.ts` без понимания legacy контракта.

## Порядок работ по пакетам

1. **Инвентаризация e2e** — заполнить `INVENTORY.md` (классификация + overlap).
2. **Сравнение с route tests** — grep по путям API или ручной diff assertion’ов.
3. **Пилот:** один низкорисковый файл (если найден истинный дубликат) → удалить или слить → проверка по `.cursor/rules/test-execution-policy.md`: после точечной правки **step** (таргетированный Vitest на затронутые тесты), не обязательно весь webapp suite → зафиксировать mapping.
4. **Integrator** — только если найдены явные дубликаты (малый выигрыш по времени на текущем baseline).

## Checkpoint после трека A

- Локально: перед пушем не требуется гонять полный CI после каждого коммита; перед **пушем** в remote — `pnpm install --frozen-lockfile && pnpm run ci` (`.cursor/rules/pre-push-ci.mdc`). Между коммитами — step / phase (см. `EXECUTION_RULES.md`).
- `pnpm test` / `pnpm test:webapp` зелёные **когда выполняется phase** или перед пушем (полный CI включает оба).
- `BASELINE.md` дополнен столбцом «after» (median или 3 прогона) **когда сравниваешь производительность**, не после каждого мелкого изменения.
- `LOG.md` содержит список удалённых/объединённых файлов с mapping.

## Обязательные контракты (должны остаться покрытыми)

- **Auth:** exchange, telegram/max init, OAuth flows, logout, pin/phone где есть prod маршруты.
- **Integrator:** signed POST/GET families, idempotency keys, channel-link complete, messenger-phone bind.
- **Messaging / reminders / communication** (patient + doctor + integrator reads).
- **Media:** upload/presign/multipart/confirm/get + internal purge/cleanup **если** меняются в том же релизе.
- **Merge / purge / audit** (admin doctor clients).

## Метрики: формализм

| Поле | Значение |
|------|----------|
| Команды | step: таргетированный Vitest; phase: полный `pnpm test:webapp` / `pnpm test`; push: `pnpm run ci` |
| Среда | Зафиксировать OS, Node `node -v`, `pnpm -v`, холодный/тёплый кэш (qualitative) |
| Число прогонов | Минимум 1 для discovery; для «after» рекомендовано **≥3** |
| Baseline | См. `BASELINE.md` |
| Сравнение runtime | Сравнивать median wall time ± Vitest Duration |
| Шум | Фиксировать загрузку CPU; при расхождении >10–15% повторить |
