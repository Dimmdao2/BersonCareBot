# Global audit — TIMEZONE_UTC_NORMALIZATION

- **Дата (UTC):** 2026-04-05  
- **Аудитор:** AI agent (репозиторий + `pnpm run ci`)  
- **Источники:** `MASTER_PLAN.md`, `STAGE_1` … `STAGE_8`, `AGENT_EXECUTION_LOG.md`
- **Post-fix (UTC):** 2026-04-05 — findings из этого файла закрыты документацией + журналом (см. §Remediation status)
- **Re-audit (UTC):** 2026-04-04 — повторная проверка блока после Global FIX: устранено противоречие в `MASTER_PLAN.md` §«Текущее состояние» (раньше описывался pre-fix); актуализирован S4.T03; добавлен `docs/README.md`; см. `AGENT_EXECUTION_LOG.md` §Post–Global-Fix re-audit.

---

## global_verdict

**APPROVE**

Реализация в репозитории, контрактные тесты и полный CI соответствуют целям инициативы. Открытый риск — **операционное** закрытие Stage 6 на целевой БД (не проверялось в этой сессии).

---

## Remediation status (Global FIX)

| Finding | Статус |
|--------|--------|
| M1 | **Документировано:** production backfill остаётся у оператора; `AGENT_EXECUTION_LOG` §Global Fix + `MASTER_PLAN` DoD последний пункт `pending production`. |
| M2 | **Сделано:** чекбоксы DoD в `MASTER_PLAN.md` синхронизированы с репозиторием/CI. |
| m1 | **Сделано:** §Global Audit и Final Decision в `AGENT_EXECUTION_LOG.md`. |
| m2 | **Сделано:** явный grep gate и исключение `.next`/`dist` в `MASTER_PLAN.md` §DoD. |

---

## Критерии проверки (чеклист запроса)

| # | Критерий | Результат |
|---|-----------|-----------|
| 1 | Все stage-gates закрыты | **Частично:** кодовые/CI-гейты Stages 1–5, 7–8 — закрыты (`AGENT_EXECUTION_LOG`). **Stage 6 (production):** применение бэкфилла и post-check на проде — вне артефактов репозитория; требуется подтверждение оператора (см. findings **major**). |
| 2 | Нет наивных дат в критичных runtime paths | **PASS:** ingest Rubitime → `tryNormalizeToUtcInstant` + branch TZ; `booking.upsert` отсекает не-zoned ISO (`explicitZonedIsoInstant`); SQL `::timestamptz`. Остаточные наивные пути в webapp — задокументированный safety-net (`parseBusinessInstant` + warn, Stage 7). |
| 3 | Нет timezone-конфига интеграций в env (кроме bootstrap) | **PASS:** `apps/integrator/src/config/env.ts` — без `APP_DISPLAY_TIMEZONE` / `BOOKING_DISPLAY_TIMEZONE` / offset-env. Deprecated чтение `process.env` только в `getAppDisplayTimezoneSync` (вне zod), с предупреждением — согласовано с `MASTER_PLAN` §«Текущее состояние». |
| 4 | Нет hardcoded `+03:00` в продуктовой логике | **PASS:** поиск по `apps/integrator/src` и `apps/webapp/src` — литерал `+03:00` / `+03` только в `*.test.ts` и тестовых фикстурах; не в non-test `*.ts`/`*.tsx`. |
| 5 | Контрактные тесты стабильны | **PASS:** `timezoneContract.stage8.*`, фикстуры; integrator + webapp suites в рамках CI. |
| 6 | `pnpm run ci` green | **PASS:** `pnpm install --frozen-lockfile && pnpm run ci` — exit 0 (2026-04-05). |

---

## findings

### critical

_Нет._

### major

1. **M1 — Stage 6 production gate (данные на целевой БД)**  
   _Закрыто в рамках репозитория:_ статус и runbook зафиксированы (`MASTER_PLAN` DoD, `AGENT_EXECUTION_LOG` §Global Fix). Выполнение на целевой БД — вне кода.

2. **M2 — Документация DoD не отражает фактическое состояние**  
   _Сделано:_ обновлён `MASTER_PLAN.md` §DoD.

### minor

1. **m1 — `AGENT_EXECUTION_LOG.md` §Global Audit**  
   _Сделано:_ ссылка на отчёт, Final Decision.

2. **m2 — Артефакты сборки**  
   _Сделано:_ grep gate и исключения описаны в `MASTER_PLAN.md` §DoD.

---

## remediation plan

| ID | Remediation |
|----|-------------|
| M1 | Выполнить `docs/TIMEZONE_UTC_NORMALIZATION/stage6/APPLY_PLAN.md`: backup → dry-run → apply в согласованном окне → post-check (`compare-rubitime-records` / диагностика). Зафиксировать в `AGENT_EXECUTION_LOG` или отдельном runbook: дата, окружение, счётчики, `diffMin`. |
| M2 | Обновить `MASTER_PLAN.md` §DoD: отметить выполненные пункты для репозитория; для «Бэкфилл применён» — либо чекбокс после M1, либо явная пометка «pending production». |
| m1 | В `AGENT_EXECUTION_LOG.md` заполнить §Global Audit: статус `PASS` (repo), ссылка на этот файл, дата аудита. |
| m2 | При автоматизированном grep исключать `.next/`, `dist/`, `node_modules/`. |

---

## MANDATORY FIX INSTRUCTIONS — Global FIX

Выполнять **после** мержа/релиза кода, если требуется формально закрыть инициативу «end-to-end» включая данные.

1. **Stage 6 production (блокирует полный DoD по данным)**  
   - Подтвердить наличие бэкапа БД.  
   - Выполнить dry-run скрипта stage6 с параметрами из `stage6/README.md` / `APPLY_PLAN.md`.  
   - По согласованию — `--apply`, затем SQL post-check из `DIAGNOSTICS.sql` и сравнение записей (`compare-rubitime-records` или эквивалент).  
   - Записать evidence в журнал выполнения (дата UTC, SHA деплоя, итоговые метрики).

2. **Синхронизация документации**  
   - Привести чеклист DoD в `MASTER_PLAN.md` в соответствие с фактом (репозиторий + production).  
   - Обновить `AGENT_EXECUTION_LOG.md` §Global Audit / Final Decision: `Release readiness`, `Final CI run`, ссылка на `AUDIT_GLOBAL.md`.

3. **Повторный spot-check (опционально, при изменении ветки)**  
   - `rg '\+03:00|\+03\\b' apps/integrator/src apps/webapp/src --glob '*.ts' --glob '!*.test.ts'` — ожидается 0 совпадений в non-test.  
   - `pnpm run ci` — зелёный.

---

## Evidence (кратко)

- **CI:** `pnpm install --frozen-lockfile && pnpm run ci` — успех (integrator: 579 passed | 6 skipped; webapp: 1154 passed | 5 skipped; build + audit).  
- **env schema (integrator):** только bootstrap/infra + Google optional; timezone keys отсутствуют.  
- **+03 hardcode:** только тесты под `apps/*/src/**/*.test.ts`.  
- **Журнал этапов:** `AGENT_EXECUTION_LOG.md` — Stages 1–8 помечены PASS по коду/CI; Stage 6 production — у оператора.

---

## Заключение

Кодовая база и пайплайн CI готовы к продолжению релизного процесса. Для полного закрытия инициативы по **данным** остаётся обязательный операционный шаг Stage 6 на целевой среде и обновление DoD в документации.
