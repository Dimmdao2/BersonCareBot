# CURRENT AUTHORITY MAP — где сейчас актуальный источник по каждой области

**Назначение:** единая точка входа. По каждой области — ОДИН актуальный документ, чтобы не собирать по 10 докам.
Старые/частичные планы несут форвард-ссылку сюда/на актуальный; актуальный — back-ссылку на ещё-валидные части
старого (двусторонняя связь, канон: `ORCHESTRATION_BINDINGS.md` §«Документация и токен-дисциплина» п.8).
**Обновлён:** 2026-07-23.

> Правило: не плодить новый мини-план доработок — править в актуальном каноне. Новый док заводить только как
> предусмотренный plan output; тогда сразу проставить двусторонние ссылки.

## Старт / состояние

| Область | Актуальный источник | Ещё-валидная деталь в старом (back-link) |
|---|---|---|
| **Перезапуск оркестратора** | `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/START_HERE_ORCHESTRATOR_KICKOFF.md` | — |
| **Состояние продукта (verified 2026-07-23)** | `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md` + `CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md` | — |
| **Правила агентов (канон)** | `AGENTS.md` + `.cursor/rules/*.mdc` + `docs/ORCHESTRATION_BINDINGS.md` | — |
| **Реестр инициатив** | `docs/INITIATIVES.md` | — |

## Doctor UI

| Область | Актуальный источник | Ещё-валидная деталь в старом (back-link) |
|---|---|---|
| **Карта пациента (структура/шапка/вкладки)** | `docs/design/bersoncare-карточка-пациента-CURRENT-SPEC.md` (4 вкладки Карточка·Программа·Файлы·Учётка; шапка чистая, звезда+portal invite; правой полоски нет) | Модель СОДЕРЖИМОГО клиники — `docs/design/bersoncare-карточка-пациента-бэклог.md` §2/§3/§5/§6 |
| **Doctor UI экраны (presentation/behavior)** | `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md` + `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` | Ранние ревью: `DOCTOR_UI_REBUILD_REVIEW/*` (частичные баннеры) |
| **Design DNA (визуальный стандарт)** | `docs/design/dna/design-dna-v1.0-spec.html` + `dna/design-dna-v1.1-amendment.md` + вайрфрейм `doctor-cabinet-wireframe.html` | — |

## SaaS / мультитенант / коммерция

| Область | Актуальный источник | Ещё-валидная деталь в старом (back-link) |
|---|---|---|
| **Product/UX execution roadmap (19 U-контрактов)** | `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` | Решения владельца: `OWNER_REVIEW_2026-07-18.md`, `OWNER_RULINGS_2026-07-16.md` |
| **Tenant foundation / изоляция** | `docs/_TODO/SAAS_FOUNDATION/01_MASTER_PLAN.md` + `SAAS_ENFORCE_ROADMAP.md` + `T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md` + `SEQUENCE.md` | Архитектура стен: `TENANT_ISOLATION_ARCHITECTURE.md`, `TENANT_WALLS_AND_ACCESS_MODEL.md` (актуальны, цитируются) |
| **Ключевое owner-правило: НЕТ prod-cutover** | `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md` (+ 07-17) | — |
| **Тарифы/entitlements/store** | `SAAS_FOUNDATION/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`, `STORE_EXECUTION_PLAN.md`, `TARIFFS_PAYMENTS_ADMIN_PLAN.md` | — |
| **Rubitime retirement** | `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md` | — |

## Backend / прод-готовность

| Область | Актуальный источник |
|---|---|
| **Security CI (Gitleaks/Semgrep/Trivy/CVE)** | `docs/_TODO/SECURITY_CI_STACK_PLAN.md` (+ `.github/workflows/security.yml`) |
| **Stability / hardening** | `docs/_TODO/STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md` |
| **RU privacy / 152-ФЗ** | `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/MASTER_PLAN.md` (+ stages/) |
| **DB-access chokepoint (R0 закрыт)** | `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/MASTER_PLAN.md` |
| **Delivery/alerting** | `docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md` |
| **Direct integrator→public (Track D)** | `WORK_ORDER.md` §Track D (D0 done; D1-D10 open) |

## Как поддерживать актуальность

1. Меняешь решение — правь **актуальный** док из таблицы, не заводи новый мини-план.
2. Если новый док неизбежен — на старом forward-ссылка (что заменено / что осталось), на новом back-ссылка на
   ещё-валидные части старого. Обнови эту таблицу.
3. `docs/archive/` и `docs/_ARCHIVE/` — историческое, не трогать и не считать актуальным.
