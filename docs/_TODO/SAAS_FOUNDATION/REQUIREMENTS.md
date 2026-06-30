# SAAS_FOUNDATION — мультитенантный SaaS (shared-DB + Postgres RLS)

**Приоритет:** высокий
**От:** владелец
**Статус:** заготовка в `_TODO/` — **2-я в очереди, стартует ПОСЛЕ `DB_ACCESS_CHOKEPOINT_INITIATIVE`.**

## Что нужно
Превратить одноклиничный BersonCareBot в мультитенантный SaaS (несколько специалистов/организаций;
пациент может принадлежать нескольким), dormant-first (нулевое изменение поведения сегодня), с заделом
под i18n и мульти-регион (RU↔EU). Без сабдоменов.

## Архитектура (решена, не пересматривать)
shared-DB + Postgres RLS; default-DENY + FORCE; три тира SCOPED/PUBLIC/BOOTSTRAP; tenant = Organization
(`be_organizations`); Person = `platform_users`; enrollment = `(organization_id, platform_user_id)`.
Scope выводится из FK (`pg_constraint`, не из имён колонок). Defense-in-depth: код-чокпоинт ставит
принципала + RLS = неотключаемый DB-бэкстоп. 219 таблиц протиражированы; 111 нужен `organization_id`.

## Последовательность и зависимость
Стартует **после** chokepoint-инициативы. Та убирает из этого scope подготовительные этапы —
P0.5 (часть, роли) / P0.6 (механизм контекста) / P0.7 (перепись писателей) / P0.11 (system_settings) +
T0 connection-audit. ⇒ После неё SAAS = `organization_id` + enrollment + классифицированный RLS-генератор
политик + default-deny tiers + изоляционные fixtures, а **T0 = «выставить принципала в готовом стволе + флип GUC»**
(механизм request-контекста — AsyncLocalStorage + pinned-connection — это первый этап SAAS T0, опирается на ствол из #1).

## Мастер-план и статус
План **ЗАХАРДЕНЕН** (9 раундов adversarial-loop, 2 подряд clean) и дополнительно разложен перед стартом, чтобы не начинать с агрегированных этапов. Канонический план — **`CORRECTED_PLAN.md` (v9)**.
- Глобальная дорога до полноценного SaaS — `ROADMAP_TO_SAAS.md`.
- Единый источник scope — `scope-derivation/tiers-218.tsv` + `needs-orgid-FINAL.txt` (111).
- Лог раундов — `LOG.md`. Индекс — `README.md`.
- Поверхность сырого SQL (вход для #1 и для SAAS T0) — `RAW_SQL_AUDIT.md`.

## Гейты
**prod-parity** (привилегии prod app-роли + пулинг — проверить на prod-боксе) перед любым включением RLS.
Store/marketplace + i18n + мульти-регион — поздние фазы.

## Боли / критерии приёмки
Нулевое изменение поведения при выкатке dormant-части; полная изоляция patient↔patient и org↔org под
non-bypass ролью (доказать fixtures: 2-я орг + 2-й пациент не видят чужого); каждая SCOPED-строка имеет org_id.
