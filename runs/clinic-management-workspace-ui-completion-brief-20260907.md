# UI completion worker — clinic management workspace #1099

Работай в существующем clean candidate
`/home/dev/dev-projects/bcb-wt-clinic-management-workspace-20260907`, ветка
`wt/clinic-management-workspace-20260907`. Это ограниченный завершающий UI/composition проход после принятой
backend correction `c0e6d294f`; не переделывай уже принятые permission/scope/migration решения.

Authority: `AGENTS.md` (карта, затем §5, §7, §9–§12, §16–§17, §21–§22, §24),
`docs/_TODO/CLINIC_MANAGEMENT_WORKSPACE_2026-09-07.md` M2–M4/M6 и DoD,
`docs/REPORTS/CLINIC_MANAGEMENT_WORKSPACE_AUDIT_2026-09-07.md`, doctor UI style guide и существующие canonical
doctor pages/components. Владелец отдельно требует максимального reuse и запрещает дубли визуально одинаковых
контейнеров.

## Закрыть весь оставшийся UI scope одним проходом

### Режимы и навигация

- `/app/manage` должен быть настоящим management mode в переиспользованном doctor shell/viewport, с отдельным
  registry и устойчивой desktop/mobile навигацией, а не страницей карточек-ссылок внутри клинического меню.
- Bound owner/admin получает понятный switch `Работа специалиста ↔ Управление клиникой` в существующем account/
  organization chrome; switch не является authority. Management-only user сразу попадает в `/app/manage` и не
  видит фиктивный specialist mode.
- В clinic specialist menu не должно быть clinic-management links. В solo отдельного management mode и Team нет:
  остаётся один Settings entry.

### Settings и specialist profile

- Собрать solo Settings в структуру §3.1, используя существующие sections/writers: клиника; профиль специалиста;
  услуги и место приёма; онлайн-запись; рабочее пространство; каналы/интеграции; тариф/оплата.
- Team скрыта в solo независимо от случайной строки специалиста; clinic Team доступна только management authority.
- Публичное описание редактирует существующую specialist entity: solo — Settings/Profile specialist; clinic —
  management Team/specialist. Не создавать account profile/copy/sync. Если существующий editor нельзя честно
  встроить без новой specialist detail route, расширить существующую Team/specialist surface, не создавать второй.
- Management sections услуг, филиалов, специалистов, абонементов, публичной формы, правил, уведомлений, платежей,
  интеграций, бренда и тарифа должны быть реально достижимы внутри management shell через существующие writers.
  Не оставлять clinic admin ссылки обратно в скрытый Schedule Setup или клинический Settings UI.

### Specialist schedule read-only UI

- Solo schedule: `Записи / График работы / Абонементы`; clinic specialist: `Записи / График работы`.
- При `appointments.manage_own=false` удалить из доступного UI входы create/reschedule/cancel/delete/no-show,
  включая desktop/mobile, пустые состояния, quick actions и modal actions. Own read, comments и отдельно
  разрешённые finance/package actions остаются.
- При `availability.manage_own=false` убрать собственные add/edit/delete schedule/absence actions. Read остаётся.
  Даже при `true` specialist не получает create/edit/delete общих working-schedule templates; он может только
  применить готовый template к себе.
- UI получает уже server-resolved booleans из одного workspace context; не вычислять role permission заново в
  компонентах и не добавлять второй guard.

### Timezone и reuse

- Подтвердить текущий минимальный geometry fix общего `DoctorTimezoneSelect`; не менять picker/data/API.
- Переиспользовать `DoctorWorkspaceShell`/viewport, `DoctorAppShell`, `DoctorPageHeader`, mobile tabs,
  `DoctorSection` и doctor primitives. Удалить созданный task-local визуальный эквивалент, если его можно выразить
  существующим компонентом.
- Не добавлять лишние поясняющие UI-тексты; Select только с display label по §21–§22.

## Запреты и проверка

- Не писать/не менять тесты. Не добавлять UI/DOM/text/count/source-shape/format/gate tests.
- Не выполнять M5, live UI, dev-server, DEV/TEST migration apply, PROD/deploy, dependencies, patient UI,
  integrator или global platform-admin.
- Не заканчивать ход, пока каждый перечисленный UI пункт либо реализован, либо доказан конкретным owner blocker;
  «не успел» и оставление пустого placeholder не являются сдачей.
- Formatter по своим files, scoped ESLint, `git diff --check`, retained composition/scope oracle. Typecheck запустить
  и отделить новые production errors от уже зафиксированных test-fixture/workspace-package ошибок; тестовые files
  не править.
- Обновить только реально закрытые plan rows evidence; M5 оставить открытым.
- Коммитить явные task paths (`git add -A` запрещён), message с `#1099`; не push/land. Финал: base/tip, полный
  список видимых изменений для owner walkthrough, reuse decisions, команды/результаты и остаточные blockers.
