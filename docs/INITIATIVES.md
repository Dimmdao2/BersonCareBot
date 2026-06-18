# РЕЕСТР ИНИЦИАТИВ — что активно / ждёт / архив

> Стратегический индекс для оркестратора. Канон процесса — `docs/AGENT_AUTORUN_SCHEME.md`. Входящие — `docs/_INBOX/`.
> **Правило оркестратора:** текущий пул кончился → смотри сюда. Есть ⏳ QUEUED → бери следующую по порядку → в работу. QUEUED пуст → смотри `docs/_INBOX/` → планируй новую (схема §3). Готовую → ✅ ARCHIVED (перенос в `docs/_ARCHIVE/`).
> Статусы: 📥 INBOX (сырьё) · 🅣 _TODO (заготовка, не в очереди) · ⏳ QUEUED (спланировано, ждёт) · ▶️ ACTIVE (в работе) · ✅ ARCHIVED.

## ▶️ ACTIVE (драйвит durable-луп «Минионы»)
| Инициатива | Папка / очередь | Примечание |
|-----------|-----------------|-----------|
| **Round-3 doctor-UI fix wave** | `/home/dev/orch/round3/QUEUE.md` + `REBUILD_PLAN/ACCEPTANCE_ROUND3.md` | Все actionable items ✅ DONE (самоштамп лупа — нужна независимая приёмка качества). BLOCKED-OWNER: ANL-10/11/13, Q-F5. |
| **Финансы (BIG-07) полный эквайринг** | `docs/ACQUIRING_INTEGRATION/` | Q-F1..F4 ✅ MERGED (provider settings, webhook, timeline API+UI, pay-link). Q-F5 ⛔ BLOCKED-OWNER (убрать старую PaymentsPanel — после проверки владельцем новой вкладки «Финансы»). |
| **Аналитика** | `docs/PRODUCT_ANALYTICS_INITIATIVE/` (+ ANL-*) | ANL-04/05/07/09/12/14 ✅. ANL-10/11/13 ⛔ BLOCKED-OWNER (карточки первич./повторн.; monthly bars; branch cards). |

## ⏳ QUEUED (спланировано, ждёт)
_Пусто — всё либо выполнено, либо в ACTIVE (заблокировано владельцем), либо в 🅣 _TODO._

## 🅣 _TODO (заготовки — НЕ в очереди лупа; ждут запуска владельцем)
| Инициатива | Папка | Когда / зависимость |
|---|---|---|
| **DB-access chokepoint** (единый ствол доступа к БД, pre-SAAS) | `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/` | ПЕРВОЙ; поведение-сохраняющий рефактор; ~2.5–4 нед. Вердикт 2 Opus + план готовы. |
| **SAAS_FOUNDATION** (мультитенант, Postgres RLS) | `docs/_TODO/SAAS_FOUNDATION/` | ПОСЛЕ chokepoint; план v8 захарденен (9 раундов); ~14–21 нед. |
> Готовы → копируем папку в `docs/_INBOX/` по команде владельца (см. `docs/_TODO/README.md`).

## 🔮 FUTURE / NEEDS-OWNER (планировать сессией с владельцем; НЕ для автономного лупа)
| Инициатива | Док | Масштаб |
|---|---|---|
| **Адаптив + «сайт vs приложение» + дизайн** (снять app-only блок; десктоп-вёрстка; install в Chrome/Mac; все вёрстки×режимы) | `docs/RESPONSIVE_PWA_LAYOUT_PASS.md` | XL — совместный проход с владельцем |
| **Быстрые пользовательские задачи** (упражнение-страница, напоминания, календарь-экспорт, медиа, баги) | `docs/QUICK_WINS_USER_2026-06-17.md` | S–M, можно отдавать команде |
| Прочие направления (Нутри, ИИ-ассист, клин-карта тела, биллинг/роли) | `docs/OWNER_VISION_BRAINDUMP_2026-06-17.md` | см. оценку там |

## ✅ ARCHIVED
| Что | Когда | Примечание |
|-----------|-----------|-----------|
| **Страница пациента: SSR + табы load-once** | 2026-06-17 (луп) | Q-C5/PAT-01..05 merged (самоштамп — приёмка). |
| **Напоминания о записи (Q-R)** | 2026-06-17 (луп) | Настройки специалиста (переключатель + оффсеты). Клиентский шаг — defer. |
| **Folder-архив 11 завершённых инициатив → `docs/_ARCHIVE/`** | 2026-06-17 | own_booking_engine · operator_health_alerting · login_register_new_logic · pwa · doctor_patient_pwa_split · doctor_patient_card_treatment_program · bot_fixes · patient_daily_warmup_ux · reminders_settings_drizzle_only · doctor_schedule_section · doctor_ui_visual_style_pass. + 3 cursor-плана (schedule_section, schedule_v26, warmup_rotation). Ссылки в индекс-доках починены. |

## 📂 ТРИАЖ папок `docs/*_INITIATIVE/` — ВЫПОЛНЕН (2026-06-17)
**11 завершённых → `docs/_ARCHIVE/`** (см. выше). **Оставлены в `docs/` намеренно:**
- **BOOKING_REWORK_INITIATIVE** — binding-правило (`doctor-ui-shared-primitives`) + AGENTS ссылаются как на владельца кода.
- **INTEGRATOR_DRIZZLE_MIGRATION** — доказательная база (ADR постоянных pg-зон + RAW_SQL_INVENTORY) для инициативы DB-chokepoint.
- **TREATMENT_PROGRAM_INITIATIVE** — живой `EXECUTION_RULES.md` (ссылается `.cursor/rules`).
- В работе/отложено/отменено: **APP_RESTRUCTURE** (частично), **PRODUCT_ANALYTICS** (v1 done, дорабатывается лупом), **PRODUCT_PLATFORM** (deferred), **COMMUNICATIONS_MD_V2** (ТЗ done), **COURSES** (strawman), **ONLINE_CONSULT_REHAB_NUTRITION_BOOKING** (отменена).

## 📥 INBOX
Сейчас: см. `docs/_INBOX/` (новые задачи владельца). Пусто = бери из ⏳ QUEUED / 🅣 _TODO / ACTIVE-blocked.
