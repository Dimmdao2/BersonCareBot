# Проверка живых планов — сводка для владельца, 20.08.2026

## Что это

Владелец 20.08: «в планах наверняка куча галочек, которые висяки». Проверили ВСЕ открытые пункты
`- [ ]` во всех живых планах репозитория: по каждому пункту агент искал реализацию (`code-search`,
затем точный `rg`), а результат записывал строкой с КОМАНДОЙ проверки — чтобы вердикт можно было
перепроверить, а не поверить на слово.

**Галочки в планах никто не трогал.** Отчёты только сообщают, что найдено; менять разметку планов —
решение владельца.

## Числа

| | пунктов |
|---|---:|
| Открытых пунктов во всех живых планах | **558** |
| Живых планов | **43** |
| НЕ СДЕЛАНО — реализации нет | **226** |
| ЧАСТИЧНО — часть есть, пункт не закрыт | **82** |
| НЕ ПРОВЕРИТЬ КОДОМ — решение владельца, живой прогон, внешняя сторона | **244** |
| ЛОЖНО ОТКРЫТ — сделано, а галочка стоит пустая | **6** |

Реальная работа, которая ещё впереди, — это первые две строки: **308 пунктов**. Ещё 244 — это не
работа кода: это то, что закрывается вашим решением, живым прогоном на TEST или ответом снаружи.

Команда, которой получено 558 (счёт по тем же 43 файлам, строки-шаблоны внутри код-блоков исключены):

```bash
python3 - <<'PY'
import re
tot=0
for p in [l.strip() for l in open('plans43.txt') if l.strip()]:
    fence=False
    for line in open(p):
        if line.lstrip().startswith('```'): fence=not fence; continue
        if not fence and re.match(r'^\s*- \[ \]', line): tot+=1
print(tot)
PY
```

Сумма вердиктов в трёх отчётах даёт ровно те же 558 — покрытие полное, ни один пункт не пропущен.

## Ложно открытые пункты — 6 штук

Это единственное, что можно закрывать прямо сейчас (галочка пустая, а работа сделана):

| план:строка | пункт | чем доказано |
|---|---|---|
| [RUBITIME_REMNANTS_2026-08-19.md:68](docs/_TODO/RUBITIME_REMNANTS_2026-08-19.md) | удалить пакет `booking-rubitime-sync` | пакета нет; вывод из эксплуатации записан в `apps/webapp/scripts/README.md:84` |
| [PUBLIC_BOOKING_TENANT_SERVICE_SEAM_2026-08-19.md:115](docs/_TODO/PUBLIC_BOOKING_TENANT_SERVICE_SEAM_2026-08-19.md) | именованная дверь публичного каталога | `0047_the_public_funnel_had_no_door_of_its_own.sql:1-115` |
| [PUBLIC_BOOKING_TENANT_SERVICE_SEAM_2026-08-19.md:121](docs/_TODO/PUBLIC_BOOKING_TENANT_SERVICE_SEAM_2026-08-19.md) | резолвер объявлен в правах | миграция `0047:41` + `declaration.ts:2971` |
| [SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md:237](docs/_TODO/SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md) | P0.10.1 полнота тиров и согласие артефактов | обе проверки PASS, вшито в `scripts/check-saas-db-regression.mjs:57-59` |
| [TENANT_CLAIM_IS_NOT_VERIFIED_2026-08-19.md:107](docs/_TODO/TENANT_CLAIM_IS_NOT_VERIFIED_2026-08-19.md) | убрать regex из `require_accepted_context` | `deploy/postgres/port-context/contract.sql:415-439`, коммит `499b64ddc` |
| [TENANT_CLAIM_IS_NOT_VERIFIED_2026-08-19.md:109](docs/_TODO/TENANT_CLAIM_IS_NOT_VERIFIED_2026-08-19.md) | убрать пустой upsert в `resolve_variant_a_identity` | `contract.sql:533-572`, коммит `b7da1ef8e` |

Две последние находки я сверил своей рукой по коду и коммитам, не по отчёту.

## Где больше всего несделанного

| план | не сделано + частично |
|---|---:|
| [Переработка UI врача](docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md) | 47 |
| [Безопасность инфраструктуры](docs/_TODO/INFRASTRUCTURE_SECURITY_PLAN.md) | 30 (плюс 44 пункта — не код) |
| [SaaS S6: справочник клиник и граница организации](docs/_TODO/SAAS_FOUNDATION/SAAS_S6_CLINIC_DIRECTORY_AND_ORG_BOUNDARY.md) | 28 |
| [SaaS S5: разделение корня настроек](docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT.md) | 27 |
| [Дорожная карта enforce-стен](docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md) | 20 |
| [Ваш список замечаний 28.07](docs/_TODO/OWNER_PUNCHLIST_2026-07-28.md) | 18 |

## Отчёты агентов

| отчёт | что внутри | кто писал | ветка / коммит |
|---|---|---|---|
| [OPEN_ITEMS_A](docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md) | 426 пунктов, 14 планов — построчно с командой проверки | codex `gpt-5.6-terra` | `wt/opena-20260820` → `1c8c148e0`, `6148352bc` |
| [OPEN_ITEMS_B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) | 106 пунктов, 15 планов | codex `gpt-5.6-terra` | `wt/openb-20260820` → `217b6ae8e`, `8df67aff5` |
| [OPEN_ITEMS_C](docs/REPORTS/OPEN_ITEMS_C_2026-08-20.md) | 26 пунктов, 14 планов | codex `gpt-5.6-terra` | `wt/openc-20260820` → `6cb4d8656`, `80dc56cea` |
| [STALE_CHECKBOXES_B](docs/REPORTS/STALE_CHECKBOXES_B_2026-08-20.md) | отдельный проход «что уже сделано» по второй половине планов: 243 пункта, 2 находки | codex `gpt-5.6-terra` | `wt/staleb-20260820` → `2c692fbb7` |
| [PLAN_CENSUS_RAW](docs/REPORTS/PLAN_CENSUS_RAW_2026-08-20.md) | механическая перепись всех планов (1807 строк) — сырьё, читать не нужно | codex `gpt-5.6-luna` | `wt/census-20260820` → `30cc226e6` |

Вердикты по каждой ветке — в [очереди аудита](docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md), строки 1439–1445.

## Что было отклонено

Первый проход по первой половине планов (`wt/stalea-20260820`, `659f83d7a`) вернул «просмотрено 334
пункта, находок 0». Моя выборка из шести пунктов того же участка сразу дала пропущенный висяк —
«добавить `%e` в `log_line_prefix`», при том что на живой базе `show log_line_prefix` уже
`%m [%p] %q%u@%d %a %e`. Значит «0 находок» получено без реального поиска. Ветка отклонена и удалена,
участок перепройден со строгим брифом (по каждому пункту обязательна команда) — это и есть
`OPEN_ITEMS_A`.

## Полная таблица по планам

| план | всего открыто | не сделано | частично | не проверить кодом | ложно открыт | отчёт |
|---|---:|---:|---:|---:|---:|---|
| [DOCTOR_UI_REWORK_2026-07-20/PLAN.md](docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md) | 66 | 28 | 19 | 19 | 0 | [A](docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md) |
| [INFRASTRUCTURE_SECURITY_PLAN.md](docs/_TODO/INFRASTRUCTURE_SECURITY_PLAN.md) | 74 | 22 | 8 | 44 | 0 | [A](docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md) |
| [SAAS_FOUNDATION/SAAS_S6_CLINIC_DIRECTORY_AND_ORG_BOUNDARY.md](docs/_TODO/SAAS_FOUNDATION/SAAS_S6_CLINIC_DIRECTORY_AND_ORG_BOUNDARY.md) | 36 | 23 | 5 | 8 | 0 | [A](docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md) |
| [SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT.md](docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT.md) | 32 | 18 | 9 | 5 | 0 | [A](docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md) |
| [SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md](docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md) | 29 | 13 | 7 | 9 | 0 | [A](docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md) |
| [OWNER_PUNCHLIST_2026-07-28.md](docs/_TODO/OWNER_PUNCHLIST_2026-07-28.md) | 22 | 17 | 1 | 4 | 0 | [A](docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md) |
| [GLOBAL_ADMIN_CHANNEL_AUTH_TOGGLES_SPEC.md](docs/_TODO/GLOBAL_ADMIN_CHANNEL_AUTH_TOGGLES_SPEC.md) | 24 | 11 | 5 | 8 | 0 | [A](docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md) |
| [SECURITY_AUDIT_2026-07-25/FINDINGS_AND_OPTIONS.md](docs/_TODO/SECURITY_AUDIT_2026-07-25/FINDINGS_AND_OPTIONS.md) | 20 | 13 | 2 | 5 | 0 | [A](docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md) |
| [GLOBAL_ADMIN_UI_INITIATIVE/STAGE_01_ANALYTICS.md](docs/_TODO/GLOBAL_ADMIN_UI_INITIATIVE/STAGE_01_ANALYTICS.md) | 15 | 6 | 7 | 2 | 0 | [A](docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md) |
| [TEST_SUITE_AUDIT_2026-07-29.md](docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md) | 21 | 7 | 5 | 9 | 0 | [A](docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md) |
| [OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md](docs/_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md) | 16 | 9 | 1 | 6 | 0 | [A](docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md) |
| [SAAS_BILLING_RECONCILE_2026-08-18.md](docs/_TODO/SAAS_BILLING_RECONCILE_2026-08-18.md) | 13 | 10 | 0 | 3 | 0 | [B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) |
| [RU_PRIVACY_AND_PRODUCTION_READINESS/OWNER_ACTIONS.md](docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/OWNER_ACTIONS.md) | 24 | 8 | 1 | 15 | 0 | [A](docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md) |
| [UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md](docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md) | 18 | 8 | 1 | 9 | 0 | [A](docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md) |
| [runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md](docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md) | 9 | 8 | 0 | 1 | 0 | [B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) |
| [DB_PRIVILEGE_LAYER_REBUILD/PLAN.md](docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md) | 29 | 4 | 1 | 24 | 0 | [A](docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md) |
| [RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-00_SCOPE_LOCK.md](docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-00_SCOPE_LOCK.md) | 6 | 4 | 0 | 2 | 0 | [B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) |
| [UPLOADED_DOCUMENTS_ACTIVE_CONTENT_2026-08-19.md](docs/_TODO/UPLOADED_DOCUMENTS_ACTIVE_CONTENT_2026-08-19.md) | 6 | 3 | 0 | 3 | 0 | [B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) |
| [DEEP_CODE_AUDIT_PLAN.md](docs/_TODO/DEEP_CODE_AUDIT_PLAN.md) | 3 | 3 | 0 | 0 | 0 | [C](docs/REPORTS/OPEN_ITEMS_C_2026-08-20.md) |
| [POST_PRODUCTION_PRIVILEGE_GATES.md](docs/_TODO/POST_PRODUCTION_PRIVILEGE_GATES.md) | 3 | 2 | 1 | 0 | 0 | [C](docs/REPORTS/OPEN_ITEMS_C_2026-08-20.md) |
| [UNSUPPORTED_CLIENT_FALLBACK_PLAN.md](docs/_TODO/UNSUPPORTED_CLIENT_FALLBACK_PLAN.md) | 3 | 1 | 2 | 0 | 0 | [C](docs/REPORTS/OPEN_ITEMS_C_2026-08-20.md) |
| [SAAS_FOUNDATION/TASK_A_PII_TIGHTEN_PLAN.md](docs/_TODO/SAAS_FOUNDATION/TASK_A_PII_TIGHTEN_PLAN.md) | 7 | 1 | 1 | 5 | 0 | [B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) |
| [SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md](docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md) | 6 | 1 | 1 | 4 | 0 | [B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) |
| [RUBITIME_REMNANTS_2026-08-19.md](docs/_TODO/RUBITIME_REMNANTS_2026-08-19.md) | 5 | 2 | 0 | 2 | 1 | [B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) |
| [UNSCHEDULED_OPERATOR_JOBS_2026-08-19.md](docs/_TODO/UNSCHEDULED_OPERATOR_JOBS_2026-08-19.md) | 3 | 1 | 1 | 1 | 0 | [C](docs/REPORTS/OPEN_ITEMS_C_2026-08-20.md) |
| [OWNER_LIVE_PASS_2026-08-18.md](docs/_TODO/OWNER_LIVE_PASS_2026-08-18.md) | 2 | 0 | 2 | 0 | 0 | [C](docs/REPORTS/OPEN_ITEMS_C_2026-08-20.md) |
| [PUBLIC_BOOKING_TENANT_SERVICE_SEAM_2026-08-19.md](docs/_TODO/PUBLIC_BOOKING_TENANT_SERVICE_SEAM_2026-08-19.md) | 4 | 0 | 1 | 1 | 2 | [B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) |
| [CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md](docs/_TODO/CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md) | 1 | 1 | 0 | 0 | 0 | [C](docs/REPORTS/OPEN_ITEMS_C_2026-08-20.md) |
| [RETENTION_SWEEPS_NEVER_RAN_2026-08-18.md](docs/_TODO/RETENTION_SWEEPS_NEVER_RAN_2026-08-18.md) | 1 | 0 | 1 | 0 | 0 | [C](docs/REPORTS/OPEN_ITEMS_C_2026-08-20.md) |
| [SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md](docs/_TODO/SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md) | 2 | 1 | 0 | 0 | 1 | [C](docs/REPORTS/OPEN_ITEMS_C_2026-08-20.md) |
| [SAAS_FOUNDATION/PHASE0_MULTITENANT_DESIGN_LOCK.md](docs/_TODO/SAAS_FOUNDATION/PHASE0_MULTITENANT_DESIGN_LOCK.md) | 1 | 1 | 0 | 0 | 0 | [C](docs/REPORTS/OPEN_ITEMS_C_2026-08-20.md) |
| [SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md](docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md) | 13 | 0 | 0 | 13 | 0 | [B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) |
| [RU_PRIVACY_AND_PRODUCTION_READINESS/MASTER_PLAN.md](docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/MASTER_PLAN.md) | 12 | 0 | 0 | 12 | 0 | [B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) |
| [DEFERRED_INFRA_TRIGGERS.md](docs/_TODO/DEFERRED_INFRA_TRIGGERS.md) | 6 | 0 | 0 | 6 | 0 | [B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) |
| [RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-01_PROCESSING_REGISTER.md](docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-01_PROCESSING_REGISTER.md) | 6 | 0 | 0 | 6 | 0 | [B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) |
| [TELEGRAM_MAX_MINIAPP_AND_MENU_2026-08-19.md](docs/_TODO/TELEGRAM_MAX_MINIAPP_AND_MENU_2026-08-19.md) | 5 | 0 | 0 | 5 | 0 | [B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) |
| [RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE/SELECTEL_PROVIDER_ANSWER_2026-08-17.md](docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE/SELECTEL_PROVIDER_ANSWER_2026-08-17.md) | 4 | 0 | 0 | 4 | 0 | [B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) |
| [SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md](docs/_TODO/SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md) | 4 | 0 | 0 | 4 | 0 | [B](docs/REPORTS/OPEN_ITEMS_B_2026-08-20.md) |
| [OUTBOUND_DELIVERY_ALERTING_PLAN.md](docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md) | 2 | 0 | 0 | 2 | 0 | [C](docs/REPORTS/OPEN_ITEMS_C_2026-08-20.md) |
| [BOOKING_REMINDERS_AND_CALENDAR_2026-08-19.md](docs/_TODO/BOOKING_REMINDERS_AND_CALENDAR_2026-08-19.md) | 1 | 0 | 0 | 1 | 0 | [C](docs/REPORTS/OPEN_ITEMS_C_2026-08-20.md) |
| [GET_IMAGE_ACCESSOR_2026-08-19.md](docs/_TODO/GET_IMAGE_ACCESSOR_2026-08-19.md) | 1 | 0 | 0 | 1 | 0 | [C](docs/REPORTS/OPEN_ITEMS_C_2026-08-20.md) |
| [SAAS_FOUNDATION/SAAS_D2_FB1_BOOTSTRAP_PHONE_WRITE.md](docs/_TODO/SAAS_FOUNDATION/SAAS_D2_FB1_BOOTSTRAP_PHONE_WRITE.md) | 1 | 0 | 0 | 1 | 0 | [C](docs/REPORTS/OPEN_ITEMS_C_2026-08-20.md) |
| [TENANT_CLAIM_IS_NOT_VERIFIED_2026-08-19.md](docs/_TODO/TENANT_CLAIM_IS_NOT_VERIFIED_2026-08-19.md) | 2 | 0 | 0 | 0 | 2 | [C](docs/REPORTS/OPEN_ITEMS_C_2026-08-20.md) |
| **итого 43 плана** | **558** | **226** | **82** | **244** | **6** | |
