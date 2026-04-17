# Аудит Stage 2 — `normalizeToUtcInstant`

**Дата аудита:** 2026-04-03 (UTC)  
**Область:** S2.T01–S2.T04 (`MASTER_PLAN.md`), реализация и тесты единой нормализации времени.

---

## Verdict

**PASS** (после Stage 2 FIX, 2026-04-03 — см. раздел «Remediation»)

**Исходный вердикт аудита:** REWORK_REQUIRED

---

## Проверенные критерии

| # | Критерий | Результат |
|---|-----------|-----------|
| 1 | Корректность для naive / Z / offset строк | OK: наивные через Luxon + IANA; Z/offset через `Date.parse` + `toISOString()`. Покрыто тестами (Moscow/Samara, `+03:00`, `+0300`, `z`, отрицательный offset, DST, spring-forward). |
| 2 | Плохой input не даёт неконтролируемого падения runtime | OK: пустое, мусор, невалидный календарь, невалидная IANA → `null`; `Intl` в `try/catch`. Экстремальные ISO дают `null` без throw. |
| 3 | Нет хардкода `+03:00` в реализации normalizer | OK: в `apps/integrator/src/shared/normalizeToUtcInstant.ts` нет. Литерал `+03:00` допустим в тестах как входной ISO-offset. |
| 4 | Экспорт / доступность по плану | OK: канон в integrator `shared/`; webapp — re-export + `experimental.externalDir` в `next.config.ts`; typecheck и production build проходят. |
| 5 | CI evidence | OK: `pnpm run ci` — зелёный (lint, typecheck, integrator + webapp tests, build, audit). |

---

## Findings по серьёзности

### BLOCKER

1. **Нет диагностического контракта причины `null`**  
   Stage 2 сейчас возвращает только `string | null`, из-за чего downstream не может надежно отличать `invalid_datetime` от `invalid_timezone`. Это блокирует корректные инциденты/алерты в Stage 3+.

### HIGH

1. **Carry-over из Stage 1/общей логики: fallback timezone не должен быть "тихим"**  
   Для кейсов `branch not found` / `empty timezone` / `invalid IANA` должен быть обязательный операционный сигнал (инцидент + Telegram-алерт), а не только `warn` в лог.

2. **Для невалидного business datetime не зафиксирован выбранный режим Variant A**  
   Нужно явно зафиксировать и реализовать контракт: запись не теряется, но `recordAt = null` + обязательный инцидент + Telegram-алерт.

### MEDIUM

1. **Узкий контракт «наивной» строки** — в IANA-путь попадают только строки под regex полной даты/времени с двузначными компонентами и опциональными дробными секундами. Иные форматы (например, без паддинга) уходят в `Date.parse` без использования `sourceTimezone`. Если источник всегда шлёт фиксированный формат — достаточно; иначе расширить контракт или нормализовать строку до вызова.

### LOW

1. **Нестроковый `raw` в чистом JS** — при `undefined`/`null` упадёт на `.trim()`. TypeScript-контракт это закрывает; при публичном использовании из нетипизированного кода можно добавить ранний guard.

2. **Строка с Z/offset и невалидная IANA** — зона на абсолютный момент не влияет, но при невалидной IANA функция всё равно возвращает `null` (покрыто тестами). Это строже, чем буквальное «ISO с Z → identity» без оговорки про валидность IANA.

### INFO

- ~~В `AGENT_EXECUTION_LOG.md` для Stage 2 указано «19 tests»; в `normalizeToUtcInstant.test.ts` фактически **18** кейсов `it(` — поправить лог или добавить тест для согласованности.~~ **Снято в FIX:** лог и счёт `it(` согласованы (24 в файле после добавления блока `tryNormalizeToUtcInstant`).

---

## Канонические пути к коду

- Реализация: `apps/integrator/src/shared/normalizeToUtcInstant.ts`
- Тесты: `apps/integrator/src/shared/normalizeToUtcInstant.test.ts`
- Re-export webapp: `apps/webapp/src/shared/normalizeToUtcInstant.ts`
- Next (импорт вне app dir): `apps/webapp/next.config.ts` → `experimental.externalDir: true`

---

## MANDATORY FIX INSTRUCTIONS

Ниже обязательные пункты для следующего прогона Stage 2 FIX (включая carry-over, который должен быть зафиксирован в планах/доках до Stage 3).

1. **[BLOCKER] Диагностическая причина неуспеха normalizer**
   - **Файлы:** `STAGE_2_NORMALIZE_TO_UTC_INSTANT.md`, `MASTER_PLAN.md`, при необходимости код `apps/integrator/src/shared/normalizeToUtcInstant.ts`.
   - **Сделать:** зафиксировать companion-контракт, который различает минимум `invalid_datetime`, `invalid_timezone`, `unsupported_format`.
   - **Done-критерий:** в Stage 2 документации и/или коде есть явный механизм передачи причины, не только `null`.

2. **[HIGH] Variant A как обязательная политика**
   - **Файлы:** `MASTER_PLAN.md`, `STAGE_3_INGEST_NORMALIZATION.md`.
   - **Сделать:** зафиксировать выбранный режим: при невалидном времени запись не теряем (`recordAt = null`), но обязательно создаём инцидент и отправляем Telegram-алерт админу.
   - **Done-критерий:** policy описана как обязательная, включена в Gate Stage 3.

3. **[HIGH] Fallback timezone без тишины (carry-over Stage 1)**
   - **Файлы:** `STAGE_1_BRANCH_TIMEZONE_DB.md`, `MASTER_PLAN.md`, `STAGE_4_INTEGRATOR_DISPLAY_TIMEZONE_FROM_DB.md`.
   - **Сделать:** дополнить требования: fallback timezone сопровождается инцидентом и Telegram-алертом (dedupe), чтобы не маскировать ошибку конфигурации.
   - **Done-критерий:** во всех указанных stage-доках fallback описан как observable (не только `warn`).

4. **[MEDIUM] Уточнить контракт наивных дат**
   - **Файлы:** `STAGE_2_NORMALIZE_TO_UTC_INSTANT.md` и/или тесты normalizer.
   - **Сделать:** явно задокументировать допустимые входные форматы; при необходимости расширить распознавание или добавить pre-normalization.
   - **Done-критерий:** нет двусмысленности, какой формат считается поддерживаемым и как обрабатываются отклонения.

5. **[LOW] Защита от не-строк**
   - **Файлы:** `apps/integrator/src/shared/normalizeToUtcInstant.ts`.
   - **Сделать:** ранний guard для `raw/sourceTimezone`, если функция может вызываться из нетипизированного кода.
   - **Done-критерий:** runtime не падает на `trim()` из-за нестрокового input.

6. **[LOW] Синхронизация документов по количеству тестов**
   - **Файлы:** `docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md`.
   - **Сделать:** привести в соответствие фактическому числу кейсов.
   - **Done-критерий:** в логе и в тестовом файле нет расхождения.

---

## Команды проверки (для повторного аудита)

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

Точечно:

```bash
pnpm --dir apps/integrator test -- src/shared/normalizeToUtcInstant.test.ts
pnpm webapp:typecheck
```

---

## Связанные документы

- `docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md` — Stage 2 (S2.T01–S2.T04)
- `docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md` — журнал выполнения

---

## Remediation (Stage 2 FIX)

**Дата:** 2026-04-03 (UTC)

Закрыто по `MANDATORY FIX INSTRUCTIONS`:

1. **[BLOCKER]** Добавлен `tryNormalizeToUtcInstant` с причинами `invalid_datetime` | `invalid_timezone` | `unsupported_format`; `normalizeToUtcInstant` делегирует в него. Обновлены `STAGE_2_NORMALIZE_TO_UTC_INSTANT.md`, `MASTER_PLAN.md`.
2. **[HIGH] Variant A** — зафиксирован как обязательный в Gate `MASTER_PLAN` (Stage 3) и `STAGE_3_INGEST_NORMALIZATION.md`.
3. **[HIGH] Fallback timezone** — уточнены `STAGE_1_BRANCH_TIMEZONE_DB.md` (S1.T05 + явная связка с S1.T06), `STAGE_4_INTEGRATOR_DISPLAY_TIMEZONE_FROM_DB.md` (кросс-ссылка на ту же политику наблюдаемости для branch vs display).
4. **[MEDIUM]** Контракт наивной строки и таблица причин — в `STAGE_2_NORMALIZE_TO_UTC_INSTANT.md` (regex `NAIVE_WALL_CLOCK_REGEX` экспортируется из кода).
5. **[LOW]** Ранний guard на нестроковые `raw`/`sourceTimezone` в `tryNormalizeToUtcInstant`.
6. **[LOW]** Тесты: добавлен блок `describe("tryNormalizeToUtcInstant")`; число `it(` согласовано с `AGENT_EXECUTION_LOG.md`.
