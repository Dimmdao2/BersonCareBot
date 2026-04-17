# Baseline — test optimization track

**Дата:** 2026-04-16. **Окружение:** Linux dev host, repo `/home/dev/dev-projects/BersonCareBot`, Node по `engines` ≥20, `pnpm@10.33.0`.

## Команды

| Метрика | Команда |
|---------|---------|
| Integrator tests | `pnpm test` (из root) → `pnpm --dir apps/integrator test` → `vitest --run` |
| Webapp tests | `pnpm test:webapp` → `pnpm --dir apps/webapp test` → `ensure-booking-sync-built.sh` + `vitest --run` |
| Полный gate (после изменений) | `pnpm install --frozen-lockfile && pnpm run ci` |

## Результаты замеров (single run, **шумно**)

**Прогонов:** по одному для integrator и webapp на момент discovery.

### `pnpm test` (integrator)

- Vitest **v4.1.3**, root `apps/integrator`
- **Test files:** 109 passed | 2 skipped (**111** total)
- **Tests:** 749 passed | 6 skipped (**755** total)
- Vitest **Duration:** ~6.43s (transform/setup/import/tests breakdown в stdout)
- **Wall time (bash `time`):** ~**7.6s**

### `pnpm test:webapp`

- Vitest **v4.1.3**, root `apps/webapp`
- **Test files:** 341 passed | 4 skipped (**345** total)
- **Tests:** 1720 passed | 7 skipped (**1727** total)
- Vitest **Duration:** ~**35.03s** (transform 23.20s, setup 38.52s, import 61.49s, tests 45.49s, environment 21.52s — суммы Vitest не обязаны совпадать с wall)
- **Wall time (bash `time`):** ~**37.2s**

## Ограничения / сомнения

- **Не измерялось:** полный `pnpm run ci` (lint + typecheck + оба test + оба build + audit) — слишком долго для обязательного шага discovery; исполнитель трека должен зафиксировать **отдельно** до/после на своей машине или CI.
- **Шум:** CPU load, кэш диска, параллельные процессы влияют на ±несколько секунд; для сравнения A/B использовать **несколько прогонов** (например 3–5) или медиану — **unknown**, пока не сделано.
- **Skipped tests:** причины skip не расшифровывались в discovery — **needs verification** (`vitest` выводит файлы при более детальном reporter).

## Что считается baseline-точкой

- Число **test files** / **tests** из summary Vitest для обоих пакетов.
- Wall time `pnpm test:webapp` как основной индикатор трека A (integrator как вторичный).

## Сравнение «after»

- Повторить те же команды в том же окружении (или явно задокументировать смену машины).
- Зафиксировать **отдельно** изменение только от тестов (после A) и не смешивать с замером после B.
