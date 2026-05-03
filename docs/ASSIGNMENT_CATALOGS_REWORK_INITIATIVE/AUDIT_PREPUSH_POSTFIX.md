# AUDIT_PREPUSH_POSTFIX — pre-push CI (хвосты и `ci:resume:*`)

**Дата:** 2026-05-03  
**Контекст:** барьер перед push по [`MASTER_PLAN.md`](MASTER_PLAN.md) §9 и [`.cursor/rules/pre-push-ci.mdc`](../../.cursor/rules/pre-push-ci.mdc).

## 1. Полный барьер (финал)

Выполнено на рабочем дереве репозитория:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

**Результат:** `pnpm run ci` завершился с **кодом 0** (lint → typecheck → `check:hls-helpers-sync` → integrator test → webapp test → media-worker test → `build` → `build:webapp` → `audit`). Отдельных «хвостов» после этого прогона **не осталось** — правки кода под CI не потребовались.

## 2. Ускорение между итерациями (`ci:resume:*`)

При падении полного `ci` после локального фикса **не** обязательно каждый раз гонять весь пайплайн: сначала упавший шаг (или узкий тест), затем хвост из корневого [`package.json`](../../package.json):

| Сценарий | Команда возобновления |
|----------|------------------------|
| Упал после `lint` | `pnpm run ci:resume:after-lint` |
| Упал после `typecheck` | `pnpm run ci:resume:after-typecheck` |
| Упал после `pnpm test` (integrator) | `pnpm run ci:resume:after-test` |
| Упал после `pnpm test:webapp` | `pnpm run ci:resume:after-test-webapp` |
| Упал после `pnpm test:media-worker` | `pnpm run ci:resume:after-test-media-worker` |
| Упал после `pnpm build` | `pnpm run ci:resume:after-build` |
| Упал после `pnpm build:webapp` | `pnpm run ci:resume:after-build-webapp` |

**Перед фактическим push** полный барьер из §1 остаётся обязательным (один зелёный полный `pnpm run ci` на актуальном коммите).

## 3. Связанные артефакты

- Сводный аудит этапов: [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md).
- Журнал инициативы: [`LOG.md`](LOG.md).
