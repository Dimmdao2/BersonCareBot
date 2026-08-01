# РЕЕСТР ИНИЦИАТИВ — что активно / ждёт / архив

> Стратегический индекс. Правила исполнения находятся только в `AGENTS.md`; оперативное состояние tracked
> workstream — в taskdb (`project=bcb`). `docs/_INBOX/` и статусы 📥/🅣/⏳ из исторического workflow ниже не
> заменяют taskdb или owner-roadmap.

> **Актуализация 2026-07-22:** execution-status берётся из taskdb (`project=bcb`) через
> `node /home/dev/brain/tools/taskdb.mjs`, а продуктовый scope — из owner-review и roadmap конкретной инициативы.
> Старый durable-loop реестр ниже сохранён как исторический снимок и **не является очередью исполнения**.

## Текущий execution registry (2026-07-22)

| Контур                            | Канон                                                                                                                                                                                    | Taskdb / состояние                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner product/SaaS roadmap        | [`_TODO/SAAS_PRODUCT_UX_INITIATIVE/README.md`](_TODO/SAAS_PRODUCT_UX_INITIATIVE/README.md) + [`IMPLEMENTATION_ROADMAP.md`](_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md)   | CMS `#853`, C5A `#751` и reconciliation `#959` завершены; текущие dependency-ready stages: stability C1 `#969` и D2 `#974`; U6B `#926` корректно ждёт U3B→U4 |
| Tenant foundation                 | [`_TODO/SAAS_FOUNDATION/README.md`](_TODO/SAAS_FOUNDATION/README.md) + [`T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md`](archive/2026-07-plans/SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md)          | Phase 0 закрыта; дальнейшая работа — T0/R2 и явно связанные карточки, не старые D3.3–D3.5 записи                                                             |
| RU privacy / production readiness | [`_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/README.md`](_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/README.md) + stage manifests                                                           | owner-activated umbrella `#898`; PR-02 `#907` ещё todo, поэтому broad PR-03 не исполняется за пределами отдельно закрытого A0 containment                    |
| Doctor UI                         | [`_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md`](_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md)                                                                                                 | подчинён Product UX DAG; полный Doctor DNA `#885` отменён владельцем и остаётся только исторической записью                                                  |
| FIO identity                      | [`FIO_IDENTITY_CLEANUP_INITIATIVE/README.md`](FIO_IDENTITY_CLEANUP_INITIATIVE/README.md) + [`.cursor/plans/fio_identity_cleanup.plan.md`](../.cursor/plans/fio_identity_cleanup.plan.md) | phases 0–8 закрыты; `#857`/`#858` blocked до общего production cutover и последующего legacy audit                                                           |
| Process/docs hygiene              | этот индекс + [`_TODO/README.md`](archive/2026-07-plans/README.md) + [`CURSOR_PLANS_REVIEW_2026-05-01.md`](CURSOR_PLANS_REVIEW_2026-05-01.md)                                                            | `#959/#912` закрыли owner-roadmap и taskdb reconciliation; статус проверяется по current taskdb/agent/worktree census, не по старому snapshot                |

Датированный git-census на старте `#912`: интеграционная ветка `feat/doctor-ui-rebuild` и `origin` совпадали на
`2f8147e91`; отдельные worktree существовали только для `#853`, `#899` и `#912`. Это evidence-снимок, а не
постоянный источник HEAD; перед новым этапом состояние проверяется заново.

## Исторический registry snapshot (2026-06-17; не исполнять)

Разделы ниже оставлены для истории решений и ссылок. Маркеры `ACTIVE`/`QUEUED` в этом снимке не описывают текущее
состояние; запрещено запускать по ним агентов без актуальной taskdb-карточки и канонического roadmap.

### Бывший ▶️ ACTIVE (durable-loop «Минионы»)

| Инициатива                            | Папка / очередь                                                        | Примечание                                                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Round-3 doctor-UI fix wave**        | `/home/dev/orch/round3/QUEUE.md` + `REBUILD_PLAN/ACCEPTANCE_ROUND3.md` | Все actionable items ✅ DONE (самоштамп лупа — нужна независимая приёмка качества). BLOCKED-OWNER: ANL-10/11/13, Q-F5.                                                               |
| **Финансы (BIG-07) полный эквайринг** | `docs/ACQUIRING_INTEGRATION/`                                          | Q-F1..F4 ✅ MERGED (provider settings, webhook, timeline API+UI, pay-link). Q-F5 ⛔ BLOCKED-OWNER (убрать старую PaymentsPanel — после проверки владельцем новой вкладки «Финансы»). |
| **Аналитика**                         | `docs/PRODUCT_ANALYTICS_INITIATIVE/` (+ ANL-\*)                        | ANL-04/05/07/09/12/14 ✅. ANL-10/11/13 ⛔ BLOCKED-OWNER (карточки первич./повторн.; monthly bars; branch cards).                                                                     |

### Бывший ⏳ QUEUED

_Пусто — всё либо выполнено, либо в ACTIVE (заблокировано владельцем), либо в 🅣 \_TODO._

### Бывший 🅣 \_TODO

| Инициатива                                                     | Папка                                         | Когда / зависимость                                                               |
| -------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| **DB-access chokepoint** (единый ствол доступа к БД, pre-SAAS) | `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/` | ПЕРВОЙ; поведение-сохраняющий рефактор; ~2.5–4 нед. Вердикт 2 Opus + план готовы. |
| **SAAS_FOUNDATION** (мультитенант, Postgres RLS)               | `docs/_TODO/SAAS_FOUNDATION/`                 | ПОСЛЕ chokepoint; план v8 захарденен (9 раундов); ~14–21 нед.                     |

> Готовы → копируем папку в `docs/_INBOX/` по команде владельца (см. `docs/archive/2026-07-plans/README.md`).

## 🔮 FUTURE / NEEDS-OWNER (планировать сессией с владельцем; НЕ для автономного лупа)

| Инициатива                                                                                                                   | Док                                         | Масштаб                             |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------- |
| **Адаптив + «сайт vs приложение» + дизайн** (снять app-only блок; десктоп-вёрстка; install в Chrome/Mac; все вёрстки×режимы) | `docs/RESPONSIVE_PWA_LAYOUT_PASS.md`        | XL — совместный проход с владельцем |
| **Быстрые пользовательские задачи** (упражнение-страница, напоминания, календарь-экспорт, медиа, баги)                       | `docs/QUICK_WINS_USER_2026-06-17.md`        | S–M, можно отдавать команде         |
| Прочие направления (Нутри, ИИ-ассист, клин-карта тела, биллинг/роли)                                                         | `docs/OWNER_VISION_BRAINDUMP_2026-06-17.md` | см. оценку там                      |

## ✅ ARCHIVED

| Что                                                          | Когда            | Примечание                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Страница пациента: SSR + табы load-once**                  | 2026-06-17 (луп) | Q-C5/PAT-01..05 merged (самоштамп — приёмка).                                                                                                                                                                                                                                                                                                                                          |
| **Напоминания о записи (Q-R)**                               | 2026-06-17 (луп) | Настройки специалиста (переключатель + оффсеты). Клиентский шаг — defer.                                                                                                                                                                                                                                                                                                               |
| **Folder-архив 11 завершённых инициатив → `docs/archive/legacy-underscore/`** | 2026-06-17       | own_booking_engine · operator_health_alerting · login_register_new_logic · pwa · doctor_patient_pwa_split · doctor_patient_card_treatment_program · bot_fixes · patient_daily_warmup_ux · reminders_settings_drizzle_only · doctor_schedule_section · doctor_ui_visual_style_pass. + 3 cursor-плана (schedule_section, schedule_v26, warmup_rotation). Ссылки в индекс-доках починены. |

## 📂 ТРИАЖ папок `docs/*_INITIATIVE/` — ВЫПОЛНЕН (2026-06-17)

**11 завершённых → `docs/archive/legacy-underscore/`** (см. выше). **Оставлены в `docs/` намеренно:**

- **BOOKING_REWORK_INITIATIVE** — binding-правило (`doctor-ui-shared-primitives`) + AGENTS ссылаются как на владельца кода.
- **INTEGRATOR_DRIZZLE_MIGRATION** — доказательная база (ADR постоянных pg-зон + RAW_SQL_INVENTORY) для инициативы DB-chokepoint.
- **TREATMENT_PROGRAM_INITIATIVE** — живой `EXECUTION_RULES.md` (ссылается `.cursor/rules`).
- В работе/отложено/отменено: **APP_RESTRUCTURE** (частично), **PRODUCT_ANALYTICS** (v1 done, дорабатывается лупом), **PRODUCT_PLATFORM** (deferred), **COMMUNICATIONS_MD_V2** (ТЗ done), **COURSES** (strawman), **ONLINE_CONSULT_REHAB_NUTRITION_BOOKING** (отменена).

## 📥 INBOX

Сейчас: см. `docs/_INBOX/` (новые задачи владельца). Пусто = бери из ⏳ QUEUED / 🅣 \_TODO / ACTIVE-blocked.
