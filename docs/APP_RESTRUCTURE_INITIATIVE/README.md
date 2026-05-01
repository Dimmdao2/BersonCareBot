# APP_RESTRUCTURE_INITIATIVE

Глобальная инициатива по ретруктуризации информационной архитектуры приложения (пациент + кабинет врача/админа) и связанной с ней реформе CMS, уведомлений и архитектурного долга.

**Дата старта:** 2026-05-01.
**Статус:** в реализации — **этап 1 дорожной карты закрыт в коде и CI** (2026-05-01): см. [`LOG.md`](LOG.md), [`STAGE1_PLAN_CLOSEOUT.md`](STAGE1_PLAN_CLOSEOUT.md), [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md) §«Этап 1». Этапы 2–8 и целевые структуры остаются продуктовым backlog.

## Что в этой папке

| Файл | Назначение | Изменяемость |
|------|------------|--------------|
| [`STAGE1_PLAN_CLOSEOUT.md`](STAGE1_PLAN_CLOSEOUT.md) | Закрытие Cursor-плана «этап 1»: статусы задач, остатки в backlog | **живой** (последующие этапы — отдельные closeout-файлы по решению команды) |
| [`LOG.md`](LOG.md) | Журнал исполнения задач по этой инициативе (решения, проверки, чек-листы) | **живой** |
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
