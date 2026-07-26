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
| **🔴 Честный размер бэклога `docs/_TODO/` (сколько реально осталось, разбито owner/derived/self-generated/superseded/duplicate)** | `docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md` — читать вместе с **§6 и §6.1** (верификация 27.07) | ⚠️ Цифра «973 реального бэклога» в §1 **ОПРОВЕРГНУТА**: она отвечала на вопрос «кто это заказал», а не «сделано ли это». Проверка каждого чекбокса против кода (§6): реальная несделанная работа ≈357, уже сделано но не отмечено ≈245, прогоны/доказательства ≈270. Решения владельца 27.07 учтены в §6.1. |
| **Ночной прогон 2026-07-23 (что сделано / с чего начать)** | `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/NIGHT_2026-07-23_AUTONOMOUS_WORK_REPORT.md` | — |
| **Перезапуск оркестратора** | `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/START_HERE_ORCHESTRATOR_KICKOFF.md` | — |
| **🖥️ СЕРВЕР: доделать всё + инкрементальный TEST-деплой (rubitime дроп, чистка, всё закрыть)** | `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/SERVER_FINISH_AND_TEST_DEPLOY_KICKOFF.md` | — |
| **🖥️ СЕРВЕР — живой прогон 2026-07-24 (что закрыто с evidence, репо-гигиена Codex-веток, решения)** | `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/SERVER_FINISH_EXECUTION_LEDGER_2026-07-24.md` | KICKOFF Шаг 3 = исходный список; ledger миррорит его с evidence |
| **Состояние продукта (verified 2026-07-23)** | `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md` + `CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md` | — |
| **Правила агентов (канон)** | `AGENTS.md` + `.cursor/rules/*.mdc` + `docs/ORCHESTRATION_BINDINGS.md` | — |
| **Реестр инициатив** | `docs/INITIATIVES.md` | — |

## Doctor UI

| Область | Актуальный источник | Ещё-валидная деталь в старом (back-link) |
|---|---|---|
| **Карта пациента (структура/шапка/вкладки)** | `docs/design/bersoncare-карточка-пациента-CURRENT-SPEC.md` (4 вкладки Карточка·Программа·Файлы·Учётка; шапка чистая, звезда+portal invite; правой полоски нет) | Модель СОДЕРЖИМОГО клиники — `docs/design/bersoncare-карточка-пациента-бэклог.md` §2/§3/§5/§6 |
| **Doctor UI экраны (presentation/behavior)** | `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md` + `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` | Ранние ревью: `DOCTOR_UI_REBUILD_REVIEW/*` (частичные баннеры). **Проверено 2026-07-26:** `docs/_TODO/DOCTOR_DNA_MIGRATION/PLAN.md` (5 открытых пунктов) — `#885` отменён владельцем (`docs/INITIATIVES.md:18` + собственная таблица маппинга задач `DOCTOR_UI_REWORK_2026-07-20/PLAN.md`), но файл не несёт пометки SUPERSEDED → та же территория (canvas/list-row/typography) сейчас живёт в `DOCTOR_UI_REWORK_2026-07-20/PLAN.md` §UI-P. Не работать по DOCTOR_DNA_MIGRATION напрямую. |
| **Design DNA (визуальный стандарт)** | `docs/design/dna/design-dna-v1.0-spec.html` + `dna/design-dna-v1.1-amendment.md` + вайрфрейм `doctor-cabinet-wireframe.html` | — |

## SaaS / мультитенант / коммерция

| Область | Актуальный источник | Ещё-валидная деталь в старом (back-link) |
|---|---|---|
| **Product/UX execution roadmap (19 U-контрактов)** | `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` | Решения владельца: `OWNER_REVIEW_2026-07-18.md`, `OWNER_RULINGS_2026-07-16.md` |
| **Tenant foundation / изоляция** | `docs/_TODO/SAAS_FOUNDATION/01_MASTER_PLAN.md` + `SAAS_ENFORCE_ROADMAP.md` + `T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md` + `SEQUENCE.md` | Архитектура стен: `TENANT_ISOLATION_ARCHITECTURE.md`, `TENANT_WALLS_AND_ACCESS_MODEL.md` (актуальны, цитируются) |
| **Ключевое owner-правило: НЕТ prod-cutover** | `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md` (+ 07-17) | — |
| **Тарифы/entitlements/store** | `SAAS_FOUNDATION/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` (единственный текущий) | **Проверено 2026-07-26:** `STORE_EXECUTION_PLAN.md` (19 откр.) и `STORE_P0_ENTITLEMENTS_PLAN.md` (14 откр.) сами себя помечают superseded/historical → замены S4, не читать как текущий план. `TARIFFS_PAYMENTS_ADMIN_PLAN.md` (44 откр.) дублирует ту же карту taskdb #751 — фазы, уже закрытые в S4 с коммитом `a678d043d` (2026-07-22), в этом файле всё ещё висят открытыми (не обновлялся после 07-17). Не работать по всем трём одновременно с S4 — риск задвоения. Детали: `docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md` §2. |
| **Rubitime retirement** | `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md` | — |

## Backend / прод-готовность

| Область | Актуальный источник |
|---|---|
| **Security CI (Gitleaks/Semgrep/Trivy/CVE)** | `docs/_TODO/SECURITY_CI_STACK_PLAN.md` (+ `.github/workflows/security.yml`) |
| **Stability / hardening** | `docs/_TODO/STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md` |
| **RU privacy / 152-ФЗ** | `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/MASTER_PLAN.md` (+ stages/) |
| **DB-access chokepoint (R0 закрыт)** | `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/MASTER_PLAN.md` |
| **Delivery/alerting** | `docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md` |
| **Direct integrator→public (Track D)** | `WORK_ORDER.md` §Track D (D0 done; D1-D10 open) — **D1 approach decided (A over B), см. `SAAS_FOUNDATION/TRACK_D1_APPROACH_DECISION_2026-07-24.md`** |
| **🚀 SaaS PROD deploy — единый процесс (скрипты+инструкции: миграция БД, чистка rubitime/legacy, гранты ролей, гейты, cutover)** | `docs/_TODO/SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md` (единая точка входа; линкует INFRA-01, HARD_MIGRATION_PROTOCOL, rubitime R7 runbooks, ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN) |
| **Role grants provenance + prod-migration (automate vs manual)** | `docs/_TODO/ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md` |
| **🔴 Isolation/provisioning remediation (app_owner seam, grant-completeness, гейт, coverage, катовер) — ЕДИНЫЙ план+чек-лист** | `docs/_TODO/SAAS_FOUNDATION/ISOLATION_PROVISIONING_REMEDIATION_PLAN_2026-07-24.md` (линкует SAAS_PROD_DEPLOY_PROCESS, ROLE_GRANTS_PROVENANCE; собран из design-audit + живых инцидентов email-login/provisioning + карточки «Изоляция клиник») |

## 🔴 Проверено 2026-07-26 — не в реестре, без owner-провенанса

- **`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/` (MASTER_PLAN.md 41 откр. + FINAL_ACCEPTANCE.md 19 откр., 0 закрыто
  в обоих — ни разу не исполнялся).** Отсутствует в `docs/INITIATIVES.md` (проверены все три таблицы: текущий
  execution registry, исторический снимок, FUTURE/NEEDS-OWNER) и в этой карте. Продуктовые развилки внутри плана
  сформулированы как открытые «owner gates», но ни одна не несёт ответа владельца — в отличие от всех остальных
  design-доков в репозитории, которые цитируют решение дословно. Не исполнять как активный план без прямого
  вопроса владельцу «просил ли он нативное приложение вообще». Детали: `docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md` §4.1.
- **`docs/_TODO/SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md`** (51 откр.) — файл сам себя объявляет мёртвым в
  первой строке («Phase 0 complete... следующее направление T0/R2»); все 51 открытых пункта внутри именно того
  раздела, что помечен «не исполнять». Не заводить по нему работу.

## Как поддерживать актуальность

1. Меняешь решение — правь **актуальный** док из таблицы, не заводи новый мини-план.
2. Если новый док неизбежен — на старом forward-ссылка (что заменено / что осталось), на новом back-ссылка на
   ещё-валидные части старого. Обнови эту таблицу.
3. `docs/archive/` и `docs/_ARCHIVE/` — историческое, не трогать и не считать актуальным.
