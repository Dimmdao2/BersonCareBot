# APP_RESTRUCTURE_INITIATIVE

Глобальная инициатива по ретруктуризации информационной архитектуры приложения (пациент + кабинет врача/админа) и связанной с ней реформе CMS, уведомлений и архитектурного долга.

**Дата старта:** 2026-05-01.
**Статус:** в реализации — **этап 1 дорожной карты закрыт в коде и CI** (2026-05-01): см. [`LOG.md`](LOG.md), [`STAGE1_PLAN_CLOSEOUT.md`](STAGE1_PLAN_CLOSEOUT.md), [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md) §«Этап 1». **CMS-first (вариант C):** [`CMS_RESTRUCTURE_PLAN.md`](CMS_RESTRUCTURE_PLAN.md) — реализовано; сверка — [`CMS_RESTRUCTURE_EXECUTION_AUDIT.md`](CMS_RESTRUCTURE_EXECUTION_AUDIT.md). **Часть IV roadmap, этап 2** (`content_sections.kind` + `system_parent_code`) — закрыт в коде (см. тот же §«Этап 2» и аудит CMS). По **кабинету врача** см. [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md): в коде закрыты этапы **1, 2, 5, 7, 8** (таблица статусов там); **3, 4** — ТЗ готовы; **6** — заморозка до patient card; **9–10** — после закрытия 1–8. Номера этапов в roadmap и в `PLAN_DOCTOR_CABINET` **разные** — сверять по ссылкам. Остальное в IV (пациентское ядро, курсы↔шаблоны, inbox) — backlog до постановки.

## Что в этой папке

| Файл | Назначение | Изменяемость |
|------|------------|--------------|
| [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) | Порядок этапов кабинета врача (CMS-first, меню, дашборд, каталоги…) | **живой** |
| [`DOCTOR_MENU_RESTRUCTURE_PLAN.md`](DOCTOR_MENU_RESTRUCTURE_PLAN.md) | ТЗ этапа 2: кластерное меню врача, аккордеон, библиотека файлов | **выполнено** (документ остаётся справочником) |
| [`DOCTOR_MENU_RESTRUCTURE_EXECUTION_AUDIT.md`](DOCTOR_MENU_RESTRUCTURE_EXECUTION_AUDIT.md) | Аудит выполнения этапа 2 (меню врача) и сверка с журналом | **живой** |
| [`DOCTOR_NAV_BADGES_PLAN.md`](DOCTOR_NAV_BADGES_PLAN.md) | ТЗ этапа 3: бейджи новых онлайн-заявок и непрочитанных сообщений в меню врача | **готово к исполнению** |
| [`DOCTOR_TODAY_DASHBOARD_PLAN.md`](DOCTOR_TODAY_DASHBOARD_PLAN.md) | ТЗ этапа 4: рабочий экран «Сегодня» вместо отчётного обзора | **готово к исполнению** |
| [`DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md`](DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md) | ТЗ этапа 5: единый чат врача, unread-фильтр, открытие из карточки пациента | **выполнено; post-audit fixes закрыты** |
| [`DOCTOR_MESSAGES_UNIFIED_CHAT_EXECUTION_AUDIT.md`](DOCTOR_MESSAGES_UNIFIED_CHAT_EXECUTION_AUDIT.md) | Аудит выполнения этапа 5 (сообщения врача): код, LOG, план, проверки, post-audit fixes | **живой** |
| [`CMS_RESTRUCTURE_PLAN.md`](CMS_RESTRUCTURE_PLAN.md) | План разделения CMS: `content_sections.kind` + `system_parent_code` (вариант C) | **живой** |
| [`CMS_RESTRUCTURE_EXECUTION_AUDIT.md`](CMS_RESTRUCTURE_EXECUTION_AUDIT.md) | Аудит выполнения плана CMS и синхронизация с журналом | **живой** |
| [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md) | ТЗ на «где используется» и безопасную архивацию в каталогах назначений (этап 7 плана кабинета) | **выполнено** |
| [`DOCTOR_UI_DENSITY_PLAN.md`](DOCTOR_UI_DENSITY_PLAN.md) | ТЗ на плотность UI врача (этап 8 плана кабинета) | **живой** |
| [`CMS_AUDIT.md`](CMS_AUDIT.md) | Факты по CMS до/после типизации (ориентир для решений) | **живой** |
| [`STAGE1_PLAN_CLOSEOUT.md`](STAGE1_PLAN_CLOSEOUT.md) | Закрытие Cursor-плана «этап 1»: статусы задач, остатки в backlog | **живой** (последующие этапы — отдельные closeout-файлы по решению команды) |
| [`LOG.md`](LOG.md) | Журнал исполнения задач по этой инициативе (решения, проверки, чек-листы) | **живой** |
| [`DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md`](DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md) | Аудит выполнения этапа 8 (плотность UI врача): код, LOG, планы; обновлён после пост-аудита (2026-05-02) | **живой** |
| [`STRUCTURE_AUDIT.md`](STRUCTURE_AUDIT.md) | Снимок текущей IA (маршруты, меню, блоки, архитектурные факты) — **точка отсчёта** | **immutable** — не правится после фиксации, чтобы можно было сравнивать «до/после» |
| [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md) | Оценка текущего состояния по продуктовым целям + предложение этапов работ (0–8) | **живой документ** — обновляется по мере приёма решений |
| [`TARGET_STRUCTURE_PATIENT.md`](TARGET_STRUCTURE_PATIENT.md) | Целевое видение пациентского приложения (5 вкладок, ткань уведомлений, материал контента) | **живой** — фиксируем решения в §11+ |
| [`TARGET_STRUCTURE_DOCTOR.md`](TARGET_STRUCTURE_DOCTOR.md) | Целевое видение кабинета врача/админа (5 кластеров меню, карточка пациента, CMS-кластер) | **живой** — фиксируем решения в §15+ |

## Связанные документы

- Редизайн «Сегодня» пациента: [`../PATIENT_HOME_REDESIGN_INITIATIVE/README.md`](../PATIENT_HOME_REDESIGN_INITIATIVE/README.md), [`VISUAL_SYSTEM_SPEC.md`](../PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md)
- Стандарт patient UI (актуальный): [`../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`](../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md)
- Исторический style-transfer контекст: [`../archive/2026-05-initiatives/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/`](../archive/2026-05-initiatives/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/)
- CMS-workflow: [`../archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/`](../archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/)
- Правила репозитория: `.cursor/rules/clean-architecture-module-isolation.mdc`, `runtime-config-env-vs-db.mdc`, `system-settings-integrator-mirror.mdc`, `000-critical-integration-config-in-db.mdc`

## Принцип работы с этими документами

1. **`STRUCTURE_AUDIT.md` не редактируется.** Если факты в коде меняются после старта инициативы — это значит идёт реализация, а аудит остаётся снимком «как было».
2. **`RECOMMENDATIONS_AND_ROADMAP.md`** — основной рабочий документ для планирования отдельных продуктовых инициатив, рождающихся из этой реформы. Этапы 0–8 — это потенциальные отдельные инициативы (отдельные папки `docs/*_INITIATIVE/`).
3. **`TARGET_STRUCTURE_*.md`** — мысленные карты, в которые вписываются **зафиксированные продуктовые решения** перед стартом каждого этапа. По мере фиксации решения раскрытые вопросы переезжают из «открытых вопросов» в основной текст.
