# Синхронизация планов и taskdb с реальностью — проход 1

**Дата:** 2026-08-23

**HEAD до правок:** `c5195315d`

**Граница:** только документация и taskdb-порт. Код, миграции, DEV/TEST/PROD, deploy, `--execute` и push не
трогались.

## 1. Опись открытых чекбоксов до правок

Первый широкий поиск любого текста `\[ \]` был отброшен: он считает примеры разметки и prose вроде «остаётся
`[ ]`», а не только чекбоксы. Точная опись построена по committed-снимку `HEAD` до правок:

```bash
git ls-tree -r --name-only HEAD docs/_TODO | rg '\.md$' |
while IFS= read -r plan_file; do
  open_count=$(git show "HEAD:$plan_file" |
    awk '/^[[:space:]]*[-*] \[ \]/{n++} END{print n+0}')
  if [ "$open_count" -gt 0 ]; then
    last_date=$(git log -1 --format=%cs -- "$plan_file")
    printf '%s\t%s\t%s\n' "$last_date" "$open_count" "$plan_file"
  fi
done | sort -k1,1 -k3,3
```

Итог этой же выборки командой

```bash
git ls-tree -r --name-only HEAD docs/_TODO | rg '\.md$' |
while IFS= read -r plan_file; do
  open_count=$(git show "HEAD:$plan_file" |
    awk '/^[[:space:]]*[-*] \[ \]/{n++} END{print n+0}')
  if [ "$open_count" -gt 0 ]; then printf '%s\n' "$open_count"; fi
done | awk '{files+=1; boxes+=$1} END {printf "initial_files=%d initial_open_boxes=%d\n",files,boxes}'
```

дал `initial_files=107 initial_open_boxes=1217`.

Список отсортирован по дате последнего committed-изменения файла, сначала давно не тронутые; второе поле — число
открытых боксов:

```text
2026-07-29   1  docs/_TODO/EDITOR_TIPTAP_MIGRATION_PLAN.md
2026-07-29   9  docs/_TODO/OWNER_WALKTHROUGHS/2026-07-27_global-admin.md
2026-07-29  35  docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/FINAL_ACCEPTANCE.md
2026-07-29  22  docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/LOG-01_SENSITIVE_PAYLOAD_HYGIENE.md
2026-07-29   8  docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-02_HEALTH_CONSENT.md
2026-07-29  21  docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-03_DATA_RIGHTS_AND_RETENTION.md
2026-07-29   7  docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-04_ISPDN_RELEASE_GATE.md
2026-07-29   5  docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/SEC-03_CLINICAL_ACCESS_AUDIT.md
2026-07-29   1  docs/_TODO/SAAS_FOUNDATION/C1_WALLS_TEST_CHECKLIST.md
2026-07-29   7  docs/_TODO/SAAS_FOUNDATION/LANDING_AND_ENTRIES_DESIGN.md
2026-07-29   1  docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-01.md
2026-07-29   1  docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-02.md
2026-07-29   8  docs/_TODO/SAAS_FOUNDATION/P0_7_WRITER_CENSUS_CHECKLIST.md
2026-07-29  18  docs/_TODO/SAAS_FOUNDATION/PATIENT_INVITE_AND_MANUAL_CREATION_DESIGN.md
2026-07-29  13  docs/_TODO/SAAS_FOUNDATION/R2_MVP_MASTER_CHECKLIST.md
2026-07-29   1  docs/_TODO/SAAS_FOUNDATION/SAAS_D1_664_WITH_CHECK_REVERIFY.md
2026-07-29   5  docs/_TODO/SAAS_FOUNDATION/SAAS_R0_PLAN_RECONCILIATION.md
2026-07-29   4  docs/_TODO/SAAS_FOUNDATION/SAAS_R1_FINISH_LINE_AND_DOC_HYGIENE.md
2026-07-29  14  docs/_TODO/SAAS_FOUNDATION/SAAS_R3_CUT_INVENTED_SCOPE.md
2026-07-29   7  docs/_TODO/SAAS_FOUNDATION/TRACK_D1_APPROACH_DECISION_2026-07-24.md
2026-07-29   4  docs/_TODO/SECURITY_AUDIT_2026-07-25/FINDINGS.md
2026-07-30   2  docs/_TODO/DOCS_PLAN_HYGIENE_2026-07-29.md
2026-07-30   2  docs/_TODO/SAAS_FOUNDATION/DEPLOY_667_SEQUENCE.md
2026-07-30  13  docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-04.md
2026-07-30  17  docs/_TODO/SAAS_FOUNDATION/SEQUENCE.md
2026-07-30  29  docs/_TODO/STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md
2026-07-30   6  docs/_TODO/runs/tariff-mechanics/TRIAGE_S4_OPUS_RESULT.md
2026-08-01  23  docs/_TODO/SUPPORT_TICKETS_1070.md
2026-08-02  12  docs/_TODO/SAAS_FOUNDATION/PAYMENTS_CABINET_PLAN.md
2026-08-02   1  docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md
2026-08-04  34  docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md
2026-08-04   8  docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md
2026-08-05  72  docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_PLAN.md
2026-08-05   1  docs/_TODO/SAAS_FOUNDATION/STORE_EXECUTION_PLAN.md
2026-08-05   1  docs/_TODO/SAAS_FOUNDATION/STORE_P0_ENTITLEMENTS_PLAN.md
2026-08-08  18  docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/11-plan-v4-stale.md
2026-08-12   1  docs/_TODO/SAAS_FOUNDATION/PHASE0_MULTITENANT_DESIGN_LOCK.md
2026-08-13   1  docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md
2026-08-13  12  docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/MASTER_PLAN.md
2026-08-13   6  docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-00_SCOPE_LOCK.md
2026-08-13   6  docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-01_PROCESSING_REGISTER.md
2026-08-13  20  docs/_TODO/SECURITY_AUDIT_2026-07-25/FINDINGS_AND_OPTIONS.md
2026-08-14   2  docs/_TODO/SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md
2026-08-16  24  docs/_TODO/GLOBAL_ADMIN_CHANNEL_AUTH_TOGGLES_SPEC.md
2026-08-17  29  docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md
2026-08-17  22  docs/_TODO/OWNER_PUNCHLIST_2026-07-28.md
2026-08-17   4  docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE/SELECTEL_PROVIDER_ANSWER_2026-08-17.md
2026-08-17  24  docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/OWNER_ACTIONS.md
2026-08-17   1  docs/_TODO/SAAS_FOUNDATION/SAAS_D2_FB1_BOOTSTRAP_PHONE_WRITE.md
2026-08-17  36  docs/_TODO/SAAS_FOUNDATION/SAAS_S6_CLINIC_DIRECTORY_AND_ORG_BOUNDARY.md
2026-08-17   7  docs/_TODO/SAAS_FOUNDATION/TASK_A_PII_TIGHTEN_PLAN.md
2026-08-17  21  docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md
2026-08-17   3  docs/_TODO/UNSUPPORTED_CLIENT_FALLBACK_PLAN.md
2026-08-18   2  docs/_TODO/OWNER_LIVE_PASS_2026-08-18.md
2026-08-18   3  docs/_TODO/POST_PRODUCTION_PRIVILEGE_GATES.md
2026-08-18  13  docs/_TODO/SAAS_BILLING_RECONCILE_2026-08-18.md
2026-08-18  32  docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT.md
2026-08-19   1  docs/_TODO/BOOKING_REMINDERS_AND_CALENDAR_2026-08-19.md
2026-08-19   6  docs/_TODO/DEFERRED_INFRA_TRIGGERS.md
2026-08-19   1  docs/_TODO/GET_IMAGE_ACCESSOR_2026-08-19.md
2026-08-19   2  docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md
2026-08-19   4  docs/_TODO/PRE_PRODUCTION_TODO.md
2026-08-19   4  docs/_TODO/PUBLIC_BOOKING_TENANT_SERVICE_SEAM_2026-08-19.md
2026-08-19   1  docs/_TODO/RETENTION_SWEEPS_NEVER_RAN_2026-08-18.md
2026-08-19   5  docs/_TODO/RUBITIME_REMNANTS_2026-08-19.md
2026-08-19   5  docs/_TODO/TELEGRAM_MAX_MINIAPP_AND_MENU_2026-08-19.md
2026-08-19   3  docs/_TODO/UNSCHEDULED_OPERATOR_JOBS_2026-08-19.md
2026-08-19   6  docs/_TODO/UPLOADED_DOCUMENTS_ACTIVE_CONTENT_2026-08-19.md
2026-08-20   3  docs/_TODO/DEEP_CODE_AUDIT_PLAN.md
2026-08-20   1  docs/_TODO/GLOBAL_ADMIN_UI_INITIATIVE/STAGE_01_ANALYTICS.md
2026-08-20  74  docs/_TODO/INFRASTRUCTURE_SECURITY_PLAN.md
2026-08-20  16  docs/_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md
2026-08-20  22  docs/_TODO/SAAS_FOUNDATION/ADMIN_BASELINE_AND_SUPPORT_CHAT_DESIGN.md
2026-08-20  13  docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md
2026-08-20   4  docs/_TODO/TELEGRAM_PLATFORM_CREDENTIALS_ADMIN_2026-08-20.md
2026-08-21   2  docs/_TODO/CLINIC_SCHEDULE_ROLE_SCOPE_1028.md
2026-08-21  18  docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/ROADMAP.md
2026-08-21   1  docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-03.md
2026-08-21   6  docs/_TODO/SAAS_FOUNDATION/RLS_UNPRINCIPLED_READ_FIX_PLAN.md
2026-08-21  27  docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md
2026-08-21   4  docs/_TODO/SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md
2026-08-21  31  docs/_TODO/SAAS_FOUNDATION/SAAS_S3_TEST_WALKTHROUGH.md
2026-08-21   8  docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md
2026-08-21   2  docs/_TODO/TENANT_CLAIM_IS_NOT_VERIFIED_2026-08-19.md
2026-08-21   3  docs/_TODO/runs/tariff/S7_3_TEST_LADDER_RUN.md
2026-08-22   1  docs/_TODO/CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md
2026-08-22  16  docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md
2026-08-22  19  docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/FINAL_ACCEPTANCE.md
2026-08-22  41  docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md
2026-08-22  10  docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md
2026-08-22   5  docs/_TODO/runs/briefs/OTP_SENDER_BRANDING_RESEARCH_BRIEF_2026-08-22.md
2026-08-22   8  docs/_TODO/runs/briefs/THERAPYSTO_STAFF_RENAME_BRIEF_2026-08-22.md
2026-08-22  10  docs/_TODO/runs/briefs/THERAPYSTO_STAGE_A_BRIEF_2026-08-22.md
2026-08-22   7  docs/_TODO/runs/briefs/THERAPYSTO_STAGE_A_FIX2_BRIEF_2026-08-22.md
2026-08-22   6  docs/_TODO/runs/briefs/THERAPYSTO_STAGE_A_FIX3_BRIEF_2026-08-22.md
2026-08-22   8  docs/_TODO/runs/briefs/THERAPYSTO_STAGE_A_FIX_BRIEF_2026-08-22.md
2026-08-22   8  docs/_TODO/runs/briefs/THERAPYSTO_STAGE_A_TAIL_BRIEF_2026-08-22.md
2026-08-22   4  docs/_TODO/runs/briefs/THERAPYSTO_SURFACE_MAP_BRIEF_2026-08-22.md
2026-08-22   5  docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md
2026-08-23  54  docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md
2026-08-23   7  docs/_TODO/runs/briefs/FLASHCALL_AUTH_RESEARCH_BRIEF_2026-08-23.md
2026-08-23   5  docs/_TODO/runs/briefs/NIGHT_ADMIN_CLEANUP_BRIEF_2026-08-23.md
2026-08-23   6  docs/_TODO/runs/briefs/NIGHT_B1_TENANT_HOST_BRIEF_2026-08-23.md
2026-08-23   6  docs/_TODO/runs/briefs/NIGHT_B3_RESOLVER_BRIEF_2026-08-23.md
2026-08-23   6  docs/_TODO/runs/briefs/NIGHT_LEGAL_ONE_KIT_BRIEF_2026-08-23.md
2026-08-23   6  docs/_TODO/runs/briefs/SURFACE_MAP_AUDIT_BRIEF_2026-08-23.md
2026-08-23   6  docs/_TODO/runs/briefs/TEST_ACCESS_DENIED_TOAST_DIAGNOSIS_BRIEF_2026-08-23.md
```

Это census markdown-документов с настоящими открытыми боксами, а не утверждение, что все 107 файлов являются
активными планами: сюда входят acceptance, owner actions, evidence и briefs. Их разделение на active/archive —
следующий проход, а не догадка этого.

## 2. Проверенные планы: каждый открытый пункт

### `UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`

| Пункт до правок | Вердикт | Доказательство |
|---|---|---|
| `:442` Б2 | живое | В строке уже записан незавершённый реальный TEST signup; `ab2a06337` требует живой проверки. |
| `:723` D15b | живое | Дочерние D15b/6 и D15b/7 открыты; `rg -n '^[[:space:]]*- \[ \]' …/WORK_ORDER.md`. |
| `:743` D15b/2 | живое, но старая реализационная проза опасно устарела | D25 evidence `31c01bb86`: два relation-writer пути заменены named roots; TEST two-webhook gate не пройден. В строку добавлена пометка `⛔ УСТАРЕЛО 23.08`. |
| `:809` D15b/6 | живое | В самом пункте: merge `92cf34ffa4` задеплоен, existing-owner login/bind/delivery gate не выполнен. |
| `:928` D15b/7 | живое | Owner defer снят 20.08; физическое разнесение БД не подменяет текущий actor/subject этап. |
| `:1243` D17 | сделано | `da5d1107a`; команда чтения `declaration.ts` дала `old_memberships=0`, `narrow_memberships=1`, `old_capabilities=0`, `narrow_capabilities=1`, `relations=8`, `forced_relations=8`. Поставлена `[x]`. |
| `:1418` D19 | сделано | Архитектура сверена с декларацией; `apps/webapp/ARCHITECTURE.md` актуализирован, evidence `8b3983fc1` и `D19_ARCHITECTURE_REVERIFY_2026-08-22.md`. Поставлена `[x]`. |
| `:1544` D25 | живое | Код закрыт, но сам пункт требует живой двухвебхуковый TEST gate; граница прохода запрещала TEST. |
| `:1771` D30 | живое | Ш1/Ш3–Ш6 ниже сохраняют живые gates; `D30_SCHEDULER_REVERSAL_PLAN.md:294,307,413,421,469`. |
| `:1805` E2 | живое | Код `7e2943fc9` есть, строка прямо ждёт живую TEST-проверку. |

### `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`

| Строка до правок | Вердикт | Доказательство |
|---|---|---|
| `:106` restore pre-error TEST | устарело, опасно | TEST уже продвинута merge `92cf34ffa4`; возврат snapshot откатит состояние. Помечено в своём файле. |
| `:125` retention/rotation | живое | В строке нет live evidence регулярного исполнения; не закрывалось. |
| `:145` legacy-drop после restore | устарело, опасно | Предикат «после восстановления» заменён current named TEST; проверка legacy остаётся живой частью Ф8. |
| `:146` аналитика/стена | живое | Нового owner disposition для всей оставшейся аналитики не найдено в проверенных D17/D19 evidence. |
| `:156` allowlist точки ноль | живое | Нет полного именованного allowlist/evidence в строке. |
| `:167` owner каждого login/role/seam | живое | D19 измерил текущую роль интегратора, но не все роли плана. |
| `:172` `saas_operator` / `saas_diag` | живое | Полного disposition обеих сущностей не доказано. |
| `:176` полный список roles/owners | живое | D19 нашёл отдельный blocker strict closure; общая приёмка не закрыта. |
| `:197`, `:199` mTLS host/live proof | живое | Host/DEV действия были вне границ; доказательства не выполнялись. |
| `:206`, `:212`, `:221` declaration/CI/migration-source gates | живое | Текущий committed код не дал достаточного evidence закрытия всех трёх требований. |
| `:256` полный live census действий | живое | Живые матрицы остаются неполными по тексту плана и WORK_ORDER. |
| `:423` DEV readiness status | устарело как статус, требование live | TEST уже не untouched: merge `92cf34ffa4` выкачен; полная live acceptance всё ещё не пройдена. Помечено в своём файле. |
| `:481` три patient failures | истина не установлена | Для каждого отказа нужен текущий runtime proof; без TEST/DEV их нельзя честно закрыть или объявить устаревшими. |
| `:505`, `:511`, `:517` A-1/A-2/A-4 | живое | Более новые D15b/7a и named-root работы пересекаются, но не доказывают полное закрытие этих owner requirements. |
| `:530` Ф0–Ф7 green | живое | D15b/7 и live gates остаются открыты. |
| `:531`, `:534` cluster cleanup/preservation | живое | Требуют фактического server/catalog state; сервер в этом проходе не трогался. |
| `:536`, `:539` current TEST transition/acceptance | живое | Code/deploy часть продвинулась, но полный ledger/positive-negative/live delivery gate не закрыт. |
| `:542` public booking | живое | Taskdb `#805` остаётся `todo`; TEST-проход не выполнялся. |
| `:548` TEST defect loop | живое | Это правило текущего live gate, не выполненная одноразовая работа. |
| `:553` fresh PROD-dump rehearsal | устарело, опасно | Новый канон и taskdb `#1085`: named DEV → named TEST, без production dump/A0/replay. Помечено в своём файле. |
| `:555`, `:556` production operation/owner gate | живое | PROD не проверялся и не разрешался; запрет остаётся действующим. |

### `D30_SCHEDULER_REVERSAL_PLAN.md`

| Пункт | Вердикт | Доказательство |
|---|---|---|
| `:294` Ш1 | живое | Код/схема `organization_id` и online-index есть, но план требует живой `pending → processing → sent` + system-health gate; `TRACK_D_STALENESS_SWEEP_2026-08-22.md:315-316`. |
| `:307` Ш3 | живое | Privilege repair выкачен, повтор create/update/complete/delete/resident-delivery на TEST не выполнен (`:358-368`). |
| `:413` Ш4 | живое | Единственный остаток прямо назван: safe-provider TEST proof (`:417-419`). |
| `:421` Ш5 | живое | Recipient probe и removal route/registry после наблюдения не выполнены (`:447-467`). |
| `:469` Ш6 | живое | Code-side снят, но TEST/PROD `lastRunAt` observation не выполнено (`:497-505`). |

## 3. Taskdb: все исходно открытые карточки `bcb`

Исходная выборка:

```bash
node /home/dev/brain/tools/taskdb.mjs list bcb |
rg '^#[0-9]+ .*\[(todo|doing|blocked)\]'
# затем: ... | wc -l
```

дала `47` карточек. После доказанного закрытия `#190` та же команда дала `46`.

| Карточка(и) | Вердикт | Основание / действие |
|---|---|---|
| `#190` | сделана | Product `01042d504`, audit `79e475819`, fix `054f9db6e`; оба product/fix — ancestors HEAD. В `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md:1165` — PASS, 9 files/24 tests. Block очищен от старой bot/interval-прозы; поставлены `commit_ref=054f9db6e`, `seal_test=true`, `seal_audit=true`, `status=done`. |
| `#796`, `#1005`, `#1028`, `#1070` | живы, blocked | `taskdb list bcb` показывает `blocked`; соответствующие планы сохраняют owner/security/live gates. Статус не менялся. |
| `#915` | жива, ждёт owner | `taskdb list bcb` показывает `todo ⏳ЖДЁТ`; MOB-00 owner gates перечислены в карточке. |
| `#996` | жива, но fresh-dump часть устарела | Title/block обновлены: только единый runbook и named TEST gates; fresh PROD-dump/full-reset запрещён ссылкой на DB plan §Ф8 и `#1085`. Status `doing` сохранён. |
| `#1042` | жива, старый замер устарел | `git rev-list --count origin/main..HEAD` → `8251`; `git diff --stat origin/main...HEAD` → `9112 files changed, 1074998 insertions(+), 775120 deletions(-)`. Title/block обновлены, PROD runtime не выдавался за проверенный. |
| `#1082` | жива, описание сокращено до реального остатка | План имеет один открытый пункт — legacy SQL text внутри DB-port. Block обновлён; `node scripts/check-no-new-raw-sql.mjs --census` не выдан за замер: фактически упал `ERR_MODULE_NOT_FOUND: typescript`. |
| `#1085` | жива, старый reset/restore путь удалён из описания | Block обновлён по D17/D15b/6 и текущим остаткам; explicitly no reset/restore/fresh dump/A0/replay/local PROD. Status `doing` сохранён. |
| `#807`, `#1031`, `#1062` | живы, требуют следующей предметной сверки с более новым authority | У них есть более новые пересечения (Therapysto routes; auth canon; DB privilege rebuild), но нет достаточного evidence отмены или полного закрытия. Status не менялся. |
| `#90`, `#209`, `#213`, `#215`, `#513`, `#805`, `#808`, `#843`, `#854`, `#898`, `#914`, `#917`, `#922`, `#926`, `#935`, `#964`, `#971`, `#984`, `#985`, `#987`, `#993`, `#1001`, `#1031`, `#1044`, `#1062`, `#1063`, `#1069`, `#1071`, `#1081`, `#1086`, `#1087`, `#1088`, `#1089`, `#1090`, `#1091`, `#1092` | живы | `taskdb list bcb` + названные в block планы/owner gates не дают доказательства done; спорные live/TEST/owner части не закрывались. |

`#1031` и `#1062` повторены в последней групповой строке как часть полного исходного списка; их специальный вердикт
строкой выше имеет приоритет. Новых карточек не создано.

## 4. Тронутые пункты: было → стало

| Файл:строка после правок | Было | Стало | Чем доказано |
|---|---|---|---|
| `WORK_ORDER.md:743-756` D15b/2 | «два relation-writer пути всё ещё живы» | Бокс живой только на TEST gate; старая реализационная проза помечена `⛔ УСТАРЕЛО 23.08`, возврат writers запрещён | D25 `31c01bb86`, `writePort.ts:252-307`, `D25_WRITER_REMOVAL_INDEPENDENT_AUDIT_2026-08-22.md` |
| `WORK_ORDER.md:1251` D17 | `[ ]`, старая широкая роль ещё описывалась как остаток | `[x]`, exact narrow membership/role зафиксированы | `da5d1107a`; declaration command: `0/1/0/1`, 8 relations, 8 FORCE RLS; `D17_DROP_WIDE_MEMBERSHIP_2026-08-22.md` |
| `WORK_ORDER.md:1431` D19 | `[ ]`, architecture finding «ещё не поправлена» | `[x]`, finding помечен устаревшим | `apps/webapp/ARCHITECTURE.md`; `8b3983fc1`; `D19_ARCHITECTURE_REVERIFY_2026-08-22.md` |
| `apps/webapp/ARCHITECTURE.md:54-65,100-104` | общий будущий «узкий доступ», без точной текущей поверхности | текущие разные логины/роли, 8 FORCE RLS relations, named-root writes без medical table access | тот же declaration command и D17/D19 evidence |
| `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:106-112` | восстановить pre-error TEST | `⛔ УСТАРЕЛО 23.08`, не выполнять | WORK_ORDER D15b/6: TEST deploy `92cf34ffa4`, migration verification 25/25 + 1/1 |
| `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:150-153` | legacy-drop только после старого restore | restore dependency помечена устаревшей; live legacy gate оставлен | current named TEST order, WORK_ORDER D15b/6 |
| `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:431-439` | «TEST remains untouched» | статус 17.08 помечен устаревшим, live acceptance оставлена | `92cf34ffa4`, `deploy-test.sh` PASS из WORK_ORDER D15b/6 |
| `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:566-571` | fresh/clean PROD dump rehearsal | `⛔ УСТАРЕЛО 23.08`, no dump/A0/replay | `AGENTS.md` §1b/3a; taskdb `#1085` |
| `PROD_VS_TEST_DIVERGENCE_2026-07-26.md:3` | старые `1831/3729/+540730−51399` читались как headline | документ явно historical; добавлен свежий repo-only замер, PROD не выдан за проверенный | `git rev-list --count origin/main..HEAD`; `git diff --stat origin/main...HEAD` |
| taskdb `#190` | `todo` | `done`, test/audit seals, commit ref | `01042d504`, `79e475819`, `054f9db6e`, queue ledger `:1165` |
| taskdb `#996` | fresh-dump/full-reset был активной частью title/block | live runbook + named TEST gates; dump/reset явно stale | DB plan §Ф8, `#1085`, `AGENTS.md` §1b/3a |
| taskdb `#1042` | title содержал старое число `1831` | title без протухшего числа, block с измерением `8251` и границей repo-only | две git-команды выше |
| taskdb `#1082` | summary перечислял уже закрытые 5 queue paths / 22 DI imports | один реальный остаток SQL-text; невозможность свежего census записана честно | `SINGLE_ENTRY_CLEANUP_2026-08-01.md:167`; фактический `ERR_MODULE_NOT_FOUND` |
| taskdb `#1085` | block ещё говорил reset/migrate TEST | current named TEST, живые acceptance/D15b7 остатки, no reset/dump/replay | D17/D15b6 evidence и обновлённый DB plan |

## 5. Опасные расхождения

1. **Возврат relation-writers идентичности.** Старый D15b/2 буквально направлял к восстановлению
   `writeIdentityAndPreferencesDirect` / `applyMessengerPhonePublicBind`, хотя новый код уже убрал их как writers.
   Это вернуло бы интегратору решение о создании/доверии/слиянии личности вопреки D25.
2. **Restore pre-error TEST.** После deploy `92cf34ffa4` старый backup откатил бы physical contacts cutover и
   privilege repair. Оба restore-dependent пункта помечены прямо в DB-плане.
3. **Fresh PROD dump/full-reset rehearsal.** Старый Ф9 и карточка `#996` противоречили новому owner-канону named
   DEV → named TEST без dump/A0/replay. Оба источника исправлены.
4. **Возврат широкой роли интегратора.** D17 уже завершён: инъекция wide membership живьём меняла medical rows
   `0 → 78 → 0`. План и architecture теперь фиксируют узкую роль, а не будущую рекомендацию.
5. **Старые числа PROD divergence.** `1831/3729` больше нельзя использовать для оценки cutover; taskdb title и
   исторический документ исправлены.

## 6. Что осталось на следующий проход

- Разделить 107 файлов census на active plans, acceptance/evidence и уже исторические документы; не объявлять
  `1217` боксами работы без классификации.
- Пройти старейшие большие группы 29.07–05.08: privacy acceptance/stages, SaaS R0/R1/R2/R3, stability hardening,
  exercise store. Этот проход их только перечислил.
- Перемерить текущим кодом спорные `#807`, `#1031`, `#1062` и открытые DB-пункты A-1/A-2/A-4; новые authority
  могут сузить или заменить их, но evidence отмены пока недостаточно.
- После разрешённого live-прохода синхронизировать D15b/2, D15b/6, D25, D30 Ш1/Ш3–Ш6, E2, DB Ф8 и карточки
  `#805/#917/#985/#987/#1085`.

## 7. Где истину установить не удалось

- **PROD runtime/server:** не проверялся и не трогался; свежие числа относятся только к Git divergence.
- **TEST live gates:** запрещены границей брифа, поэтому code-complete пункты не закрывались по одному чтению кода.
- **Raw SQL census `#1082`:** `node scripts/check-no-new-raw-sql.mjs --census` завершился
  `ERR_MODULE_NOT_FOUND: typescript`; старые числа не повторены как свежие.
- **DB plan `:481`:** три patient-root отказа 17.08 требуют текущего runtime proof; без него пункт оставлен живым.
- **Open taskdb без свежего plan evidence:** кроме доказанного `#190`, статусы не закрывались по одному title/block.

## 8. Проверки

```text
git diff --check
  PASS

node --experimental-strip-types --input-type=module <declaration census>
  relations=8
  forced_relations=8
  old_memberships=0
  narrow_memberships=1
  old_capabilities=0
  narrow_capabilities=1

node /home/dev/brain/tools/taskdb.mjs list bcb |
rg -c '^#[0-9]+ .*\[(todo|doing|blocked)\]'
  46  # после закрытия доказанного #190; до правок — 47
```

Полный CI, lint, typecheck и продуктовые тесты не запускались: продуктовый код не менялся. Task `#190` закрыт по
уже приземлённым product/audit/fix evidence, а не по новому прогону этого docs-pass.
