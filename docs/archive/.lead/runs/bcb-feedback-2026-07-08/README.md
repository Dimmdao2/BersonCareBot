# BCB feedback triage — 2026-07-08

Источник: список владельца "Доработки BersonCare" от 2026-07-08.

Цель этого пакета: отфильтровать уже сделанное/уже заведенное, а новые хвосты подготовить к ночным автопроходам через dev-lead.

## Как вести

- TaskDB — короткий исполняемый тикет, статус, владелец, ссылка на этот пакет.
- Markdown — подробный контекст, критерии приемки, границы, связанные задачи.
- Большие группы не дробить преждевременно на десятки микротикетов. Первый автопроход должен делать аудит + узкий batch, если задача слишком широкая.
- Не закрывать старые "done" печати без live/code проверки: свежий feedback может быть регрессией после принятой задачи.

## Mandatory Preflight For Every Task

Перед любой реализацией по задачам из этого пакета агент обязан сделать короткий preflight:

1. Найти связанные задачи в taskdb (`find bcb "<ключевые слова>"`) и не заводить/не реализовывать дубль.
2. Спросить кодовый индекс (`codeq`/`code-search`) по зоне задачи, затем проверить релевантные файлы.
3. Если задача про UI, проверить текущее live-поведение или как минимум код текущего компонента/роута.
4. Разметить каждый подпункт в рабочем note:
   - `already_done` — уже реализовано; обновить taskdb note, код не трогать;
   - `regression` — было сделано/заведено раньше, но текущий код или live-поведение не соответствует feedback;
   - `not_implemented` — фичи/поведения нет;
   - `needs_decision` — нужен продуктовый выбор владельца/dev-lead.
5. Реализовывать только `not_implemented` и подтвержденные `regression`.
6. Если preflight показывает, что задача слишком широкая, оставить короткий audit-note и предложить разбиение на батчи вместо большого прохода.

## SaaS Foundation Guardrail

Перед любыми изменениями кода, БД, миграций, репозиториев или API по задачам из этого пакета агент обязан учитывать текущее направление `SAAS_FOUNDATION`.

Канон:

- `docs/_TODO/SAAS_FOUNDATION/REQUIREMENTS.md`
- `docs/_TODO/SAAS_FOUNDATION/ROADMAP_TO_SAAS.md`, раздел "Table and feature design while SaaS is dormant"

Практическое правило для feedback-задач:

- Новые таблицы/колонки/связи для clinical, patient-facing, doctor-facing, booking, messaging, notification, media, catalog, product, payment или settings данных не должны быть "глобальными по умолчанию".
- До миграции или новой записи в БД нужно явно определить ownership path: `organization_id` напрямую, связь через уже scoped parent, `specialist_id`, patient/enrollment, appointment, program instance или настоящий global catalog.
- Если ownership неочевиден, не придумывать параллельную SaaS-модель. Пометить подпункт как `needs_decision` и оставить короткий design note для dev-lead/владельца.
- Не добавлять RLS/policy enforcement ad hoc до канонического этапа `DB_ACCESS_CHOKEPOINT` + `SAAS_FOUNDATION`; сейчас допустимы только dormant/backward-compatible поля, индексы, backfill/compat планы и сервисные проверки.
- Не переносить tenant/org integration settings в env. Интеграционные и tenant-настройки остаются DB-backed через существующие `system_settings` правила.
- Для запросов и новых репозиториев не усиливать single-doctor assumption. Если текущая модель уже использует `organizationId`/`specialistId`, новый код должен продолжать этот путь и не обходить его.

## Группы

- [schedule-and-today.md](schedule-and-today.md) — Расписание, график работы, календарь, страница "Сегодня".
  TaskDB: `#538` schedule regression batch, `#539` Today KPI/comments. Existing linked: `#530` branch colors.
- [clients-and-chat.md](clients-and-chat.md) — Клиенты, карточка клиента, каналы, чаты.
  TaskDB: `#540` clients KPI/filters/channels, `#541` patient card header, `#542` chat UX. Existing linked: `#24`, `#130`, `#131`.
- [patient-booking.md](patient-booking.md) — пациентская/публичная запись.
  TaskDB: `#543` patient booking UX/person booking. Existing linked: `#215`, `#528`.
- [program-editor.md](program-editor.md) — программа пациента у доктора: добавление пунктов, индивидуальные упражнения, порядок групп/этапов.
  TaskDB: `#544` stage/group behavior, `#545` fast catalog add UX. Existing linked/expanded: `#193`.

## Уже покрыто существующими задачами

- Цвет филиалов в календаре/графике: taskdb `#530`.
- Перерыв после приема у услуги: taskdb `#528`.
- ФИО/переход на структурные ФИО: taskdb `#24`.
- Онлайн-прием с отдельным booking-flow: taskdb `#215`.
- Рассылки/темы/подписки/центр уведомлений/consent: taskdb `#90`, `#209`, `#213`.
- Индивидуальное упражнение в программе с видео: taskdb `#193`, но свежий список расширяет scope; детали зафиксированы в [program-editor.md](program-editor.md).

## Не заводилось отдельно

- "Программа: 3." — пункт в исходном списке пустой.
- Существующие закрытые задачи по расписанию (`#231`, `#237`, `#261`, `#527`) не переоткрывались. Свежие жалобы заведены как regression/workflow-задачи с новыми критериями.
