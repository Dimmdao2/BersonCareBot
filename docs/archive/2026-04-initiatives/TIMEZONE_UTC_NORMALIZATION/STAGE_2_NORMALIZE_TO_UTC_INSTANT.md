# Stage 2 - Единая функция normalizeToUtcInstant

## Цель этапа

Ввести одну canonical-функцию, которая превращает входную строку времени в UTC instant (`ISO-8601` с `Z`) для всех сценариев integrator/webapp.

## Scope (только Stage 2)

- Реализация `normalizeToUtcInstant(raw, sourceTimezone)`.
- Полный набор unit-тестов на форматы входа.
- Экспорт функции для повторного использования.

Не включать:
- Переподключение всех callsites проекта.
- Массовые refactor в downstream модулях (это Stage 3+ и Stage 7).

## Контракт функции

```ts
export type NormalizeToUtcInstantFailureReason =
  | "invalid_datetime"
  | "invalid_timezone"
  | "unsupported_format";

export type TryNormalizeToUtcInstantResult =
  | { ok: true; utcIso: string }
  | { ok: false; reason: NormalizeToUtcInstantFailureReason };

export function tryNormalizeToUtcInstant(
  raw: unknown,
  sourceTimezone: unknown,
): TryNormalizeToUtcInstantResult;

/** Удобная обёртка: только UTC ISO или `null` (без причины). */
export function normalizeToUtcInstant(
  raw: string,
  sourceTimezone: string,
): string | null;
```

Поведение `normalizeToUtcInstant` / `tryNormalizeToUtcInstant`:

- Если `raw` уже с `Z` или `+/-offset` → `Date.parse` + `toISOString()` (абсолютный instant; **валидная IANA** на входе обязательна — иначе `invalid_timezone`, даже при `Z`).
- Если `raw` — **наивная строка по контракту** (см. ниже) → wall-clock в `sourceTimezone` (Luxon + IANA) → UTC ISO.
- Иные строки (в т.ч. дата без времени, если `Date.parse` понимает) идут в ветку абсолютного парсинга; при `NaN` → `unsupported_format`.
- Пустой `raw` после trim → `invalid_datetime`. Пустой/невалидный `sourceTimezone` → `invalid_timezone`.
- Нестроковые `raw` / `sourceTimezone` (вызов без типов) → соответственно `invalid_datetime` / `invalid_timezone`, **без throw**.

### Поддерживаемый формат «наивной» wall-clock строки

Попадают **только** строки, совпадающие с экспортируемым regex `NAIVE_WALL_CLOCK_REGEX`:

- `YYYY-MM-DD` + пробел или `T` + `HH:mm:ss`;
- опционально дробные секунды: точка и 1–9 десятичных цифр;
- все компоненты даты/времени с **ведущими нулями** (двузначные месяц, день, часы, минуты, секунды).

Примеры **поддерживаемых** наивных: `2026-04-07 11:00:00`, `2026-04-07T11:00:00`, `2026-04-07 11:00:00.5`.

Примеры **не наивных по контракту** (будут обработаны через `Date.parse`, без подстановки `sourceTimezone`): `2026-4-7 11:00:00` (без паддинга), `07.04.2026 11:00:00`, только `YYYY-MM-DD` без времени. Если нужен наивный путь — **нормализуйте строку до формата выше** до вызова.

### Семантика причин неуспеха (`tryNormalizeToUtcInstant`)

| Причина | Когда |
|--------|--------|
| `invalid_timezone` | Пустая зона, нестроковая зона, IANA отклоняет `Intl` |
| `invalid_datetime` | Пустой raw, нестроковый raw, наивная строка по regex, но календарь/Luxon невалидны |
| `unsupported_format` | Не наивная по regex, и `Date.parse` вернул `NaN` |

## План реализации (детально)

### S2.T01 - Создать модуль normalizer

Файл:

- `apps/integrator/src/shared/normalizeToUtcInstant.ts`

Требования:

- Без побочных эффектов.
- Детект наивной строки по regex/парсеру.
- Защита от пустых строк (`trim() === ""` -> `null`).
- Защита от невалидной timezone (fallback не в этой функции; на вход должна приходить валидная IANA, иначе `null` или контролируемая ошибка по принятому стилю).

### S2.T02 - Тесты normalizer

Файл:

- `apps/integrator/src/shared/normalizeToUtcInstant.test.ts`

Набор кейсов минимум:

- `"2026-04-07 11:00:00"` + `Europe/Moscow` -> `"2026-04-07T08:00:00.000Z"`.
- `"2026-04-07 11:00:00"` + `Europe/Samara` -> `"2026-04-07T07:00:00.000Z"`.
- `"2026-04-07T11:00:00Z"` -> identity.
- `"2026-04-07T11:00:00+03:00"` -> `"2026-04-07T08:00:00.000Z"`.
- `"2026-04-07T11:00:00"` + `Europe/Moscow` -> `"2026-04-07T08:00:00.000Z"`.
- `""`, `"abc"`, `"2026-99-99 25:99:99"` -> `null`.

### S2.T03 - Экспорт и доступность

Сделать единый экспорт из shared-слоя:

- либо прямой export из integrator shared,
- либо синхронная копия/bridge для webapp с тем же контрактом.

Важно: не дублировать разные версии логики; источник истины должен быть один.

### S2.T04 - Диагностический companion-контракт

Реализовано как `tryNormalizeToUtcInstant` (результат `ok` + `utcIso` или `reason`):

- `invalid_datetime`
- `invalid_timezone`
- `unsupported_format`

Цель: downstream (Stage 3+) формирует инциденты и Telegram-алерты по дискретной причине, а не только по `null` из `normalizeToUtcInstant`.

## Нюансы реализации

- Нельзя полагаться на timezone окружения процесса.
- Нельзя использовать хардкод `+03:00`.
- Логика должна быть детерминированной на любой машине/CI.

## Проверки и тесты

- Прогнать unit tests модуля.
- Прогнать зависимые тесты, если есть callsite smoke.
- Прогнать `pnpm run ci` после завершения этапа.

## Gate (обязателен для PASS)

- Функция возвращает корректный UTC ISO для всех перечисленных форматов.
- Наивные строки корректно интерпретируются через IANA.
- Невалидные входы не приводят к throw в обычном runtime-пути (если проектный стиль не требует throw).
- Причина неуспеха нормализации доступна вызывающему коду.
- `pnpm run ci` зеленый.

## Артефакты в лог

В `AGENT_EXECUTION_LOG.md` добавить:

- Список кейсов тестирования.
- Результаты тестов модуля.
- Подтверждение отсутствия хардкода оффсетов.
- Результат `pnpm run ci`.
