# Результат чистки документации — 2026-09-16

## Итог

- В архив перенесён **1201 файл**. Команда:
  `git diff --name-status --find-renames ab07f6e24..HEAD | awk -F '\t' '$1 ~ /^R/ {dst=$3; sub(/^"/, "", dst); if (dst ~ /^docs\/archive\//) n++} END {print n+0}'` → `1201`.
- Вне `docs/archive/**` осталось **95 Markdown-файлов**, включая эту перепись и этот результат. Команда:
  `git ls-files -z -- '*.md' ':(exclude)docs/archive/**' | tr -cd '\0' | wc -c` → `95`.
- Из живых канонов снято **176 строк истории**, 16 строк переписаны как требования в настоящем времени. Команда:
  `git show --numstat --format= a2d8c05d3 | awk '{a+=$1; d+=$2} END {print "added=" a, "deleted=" d}'` → `added=16 deleted=176`.
- До добавления этого результата оставалось: 47 файлов класса `КАНОН`, 42 класса `ПЛАН`, три защищённых описания и один защищённый журнал. Перепись сама в собственную классификацию не входила.

## Планы, закрытые по правилу приёмки

Из этих планов удалены все незакрытые пункты, состоявшие только из owner/live/click-through приёмки; затем планы перенесены в архив:

- `docs/_TODO/BOOKING_REMINDERS_AND_CALENDAR_2026-08-19.md`;
- `docs/_TODO/DOCTOR_KPI_FILTERS_2026-09-14.md`;
- `docs/_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md`;
- `docs/_TODO/PATIENT_CABINET_OWNER_FIXES_2026-09-10.md`;
- `docs/_TODO/OWNER_WALKTHROUGHS/2026-08-23_TEST_FULL_WALK.md`;
- `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`.

Проверка отсутствия открытых checkbox в этих шести архивных файлах:

```bash
rg -n '^\s*[-*]\s+\[ \]' \
  docs/archive/docs/_TODO/BOOKING_REMINDERS_AND_CALENDAR_2026-08-19.md \
  docs/archive/docs/_TODO/DOCTOR_KPI_FILTERS_2026-09-14.md \
  docs/archive/docs/_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md \
  docs/archive/docs/_TODO/PATIENT_CABINET_OWNER_FIXES_2026-09-10.md \
  docs/archive/docs/_TODO/OWNER_WALKTHROUGHS/2026-08-23_TEST_FULL_WALK.md \
  docs/archive/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md
```

Результат: пусто.

## Оставшиеся канонические источники по областям

| Область | Живой канон / единственный основной источник |
|---|---|
| Правила агентов, тесты и оркестрация | `AGENTS.md` |
| Текущая цель и очередь | `docs/_TODO/CURRENT_GOAL.md`; статус работы — taskdb |
| Карта authority | `docs/CURRENT_AUTHORITY_MAP.md` |
| Вход, identity, merge и блокировки | `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` |
| Доступ администратора | `docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md` |
| Уведомления и каналы | `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` |
| Конфигурация env / БД | `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` |
| Серверная топология | `docs/ARCHITECTURE/SERVER CONVENTIONS.md` |
| Команды deploy | `deploy/HOST_DEPLOY_README.md` |
| Общая security-модель | `docs/ARCHITECTURE/SECURITY_CANON.md` |
| Doctor UI | `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md` |
| Patient UI | `docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md` |
| Карточка пациента | `docs/design/bersoncare-карточка-пациента-CURRENT-SPEC.md` |
| Messaging | `docs/ARCHITECTURE/MESSAGING_CONTRACT.md` |
| Границы integrator/webapp | `apps/webapp/INTEGRATOR_CONTRACT.md` |
| Integrator kernel | `apps/integrator/src/kernel/contracts/contracts.md` |
| Миграции данных | `deploy/DATA_MIGRATION_CHECKLIST.md` |
| DB access / grants / RLS | `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/REQUIREMENTS.md`; исполнение — `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` |
| SaaS foundation | `docs/RULES/SAAS_FOUNDATION_AWARE_DEVELOPMENT.md`; исполнение — `docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md` |
| SaaS product UX | `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/REQUIREMENTS.md`; исполнение — `IMPLEMENTATION_ROADMAP.md` той же папки |
| Тарифы и коммерческие решения | `docs/OWNER_DECISIONS.md`; исполнение — `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` |
| Магазин упражнений | `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_PLAN.md` до закрытия работы |
| Хранение исходного медиа | `docs/_TODO/SOURCE_MEDIA_RETENTION_CANON_2026-09-13.md` |
| Файлы пациента | `docs/PATIENT_FILES_ISOLATION_INITIATIVE/REQUIREMENTS.md` |
| Подписки | `docs/SUBSCRIPTION_INITIATIVE/REQUIREMENTS.md`; исполнение — `ROADMAP.md` той же папки |
| Программы лечения | `docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md` |
| Настройки напоминаний | `docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/README.md` |
| Booking mirror | `docs/BOOKING_REWORK_INITIATIVE/BOOKING_MIRROR_INTEGRITY_CONTRACT.md` |
| Jitsi network policy | `deploy/jitsi/NETWORK_POLICY.md` |

Описания runtime, исследования, отчёты, старые разложения планов и модульные README рядом с кодом перенесены в `docs/archive/` без сведения и без переноса фактов в соседние документы.

## Не тронул, потому что не уверен

В этих местах историческая форма смешана с действующим правилом или единственным owner-решением; удаление без предметной сверки могло бы потерять норму:

- `apps/webapp/INTEGRATOR_CONTRACT.md:133` — исторический контекст встроен в действующий контракт;
- `deploy/HOST_DEPLOY_README.md:310`, `:481`, `:650` — завершённые этапы соседствуют с текущими host-командами;
- `deploy/jitsi/NETWORK_POLICY.md:25` и `:98` — owner provenance одновременно задаёт текущую сетевую политику;
- `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md:33` — таблица содержит текущие продуктовые решения;
- `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_DECISION_PACKET.md:27` — исторические вопросы перемежаются с актуальными результатами каждого ID;
- `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md:87` — resolved-вопросы содержат формулировки принятых решений;
- `docs/_TODO/SOURCE_MEDIA_RETENTION_CANON_2026-09-13.md:49`–`:130` — evidence-таблицы используются для вывода действующего retention-правила;
- `docs/ARCHITECTURE/SERVER CONVENTIONS.md:61`, `:264`, `:1161`, `:1251` — старые состояния смешаны с текущими путями, запретами и recovery-ограничениями;
- `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:128`, `:306`, `:354` — упоминания прежнего поведения задают явные запреты на его возврат;
- `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md:605`, `:1049` — dated-факты участвуют в действующих правилах маршрутизации и определения аварии.

Защищённые брифом `AGENTS.md`, `CLAUDE.md`, корневой `README.md`, `docs/_TODO/CURRENT_GOAL.md`, `docs/CURRENT_AUTHORITY_MAP.md` и `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` не изменялись. Последний был возвращён из механического списка архива, потому что прямой запрет брифа сильнее класса переписи.
