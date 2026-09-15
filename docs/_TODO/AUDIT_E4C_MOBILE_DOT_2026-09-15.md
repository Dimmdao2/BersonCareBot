# Адверсарный аудит коррекции Э4c — мобильная точка «Клиенты»

## Вердикт

**PASS** для committed candidate `96f5a8e19964734daebc2df3fcf089474a6b6709`.

Дефект закрыт по построению: нижняя навигация получает `badgeKey` из того же menu item, что desktop-sidebar,
и читает тот же `badgeCounts`. Для `patients` ключ равен `medicalMergeConflicts`; ненулевой счёт даёт красную
точку и подпись `«Клиенты. Есть конфликт учётных записей клиента.»`, нулевой счёт не рендерит точку. Прежнее
поведение остальных пунктов сохранено. MUST FIX нет.

Живой снимок candidate на `390×844` остаётся обязательным после landing: до landing поднимать второй Next нельзя,
а §10a запрещает заменять снимок автоматическим UI-тестом.

Проверенный объект зафиксирован командами:

```bash
git rev-parse HEAD
# 96f5a8e19964734daebc2df3fcf089474a6b6709
git rev-parse --abbrev-ref HEAD
# wt/merge-mobile-dot
git diff --name-only 96f5a8e19^ 96f5a8e19
# apps/webapp/src/shared/ui/doctor/DoctorMedicalMergeConflictProvider.tsx
# apps/webapp/src/shared/ui/doctor/shell/DoctorBottomNav.tsx
# apps/webapp/src/shared/ui/doctor/shell/DoctorMenuAccordion.tsx
# apps/webapp/src/shared/ui/doctor/shell/doctorNavBadges.ts
```

Текущий `feat/doctor-ui-rebuild` уже сдвинулся относительно candidate; по §24.3 предметом аудита остался точный
committed candidate, а пересечение при landing проверяет ведущий:

```bash
git rev-parse feat/doctor-ui-rebuild
# 121d09a9ff248477255b812f7ab2242a97a3f11e
git merge-base feat/doctor-ui-rebuild 96f5a8e19
# 38aee200262128a17945d59f8b16cd832ccca157
```

## Оракул и доказательство дефекта

Прямое требование — `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:525-531`, в частности строка 529:
`«пункт меню „Клиенты“ — красная точка, как у сообщений»`. Предыдущая живая приёмка
`docs/_TODO/LIVE_ACCEPTANCE_E4C_2026-09-15/REPORT.md` зафиксировала достигнутый дефект именно на `390×844`.

Путь нового поведения:

- `doctorNavLinks.ts:124-129`: `patients` несёт `badgeKey: 'medicalMergeConflicts'`;
- `DoctorBottomNav.tsx:48-56`: нижняя навигация находит общий menu item по тому же href и переносит его
  `badgeKey`; `routePaths.doctorPatients` равен `/app/doctor/patients` (`paths.ts:138`), поэтому lookup совпадает;
- `DoctorBottomNav.tsx:75-100`: `badgeCounts[badgeKey] > 0` управляет `DoctorAttentionBadge`; при нуле передаётся
  `count={0}`, а `DoctorAttentionBadge.tsx:17` возвращает `null`;
- `doctorNavBadges.ts:36-48`: provider count входит в полную `Record<DoctorMenuBadgeKey, number>` карту;
- `doctorNavBadges.ts:74-78`: всё, кроме задач, получает `danger`, следовательно конфликт — красный;
- `DoctorBottomNav.tsx:82-85` и `DoctorMenuAccordion.tsx:511-515` вызывают одну
  `linkAriaLabelWhenBadged`; ветка конфликта в `doctorNavBadges.ts:96-98` даёт одинаковую подпись обеим
  навигациям. При нуле bottom-nav оставляет обычную accessible-подпись пункта, sidebar не задаёт отдельный
  `aria-label`.

## Пункт → прежнее поведение → новое

Сравнение сделано по `git show 96f5a8e19^:.../DoctorBottomNav.tsx` и текущим
`DoctorBottomNav.tsx`/`doctorNavBadges.ts`.

| Пункт нижней навигации | Прежнее поведение | Новое поведение | Итог |
|---|---|---|---|
| «Сегодня» | `hasAttention=false`, точки нет, обычная подпись | У общего пункта нет `badgeKey`, поэтому `hasAttention=false`; точки нет, подпись обычная | Без изменения |
| «Расписание» | `hasAttention=false`, точки нет, обычная подпись | У общего пункта нет `badgeKey`, поэтому `hasAttention=false`; точки нет, подпись обычная | Без изменения |
| «Задачи» | Точка при `overdueTasks > 0 || todayTasks > 0`; `danger` при просрочке, иначе `primary`; соответствующая aria-подпись | `badgeKey='overdueTasks'`; общий count равен `overdueTasks > 0 ? overdueTasks : todayTasks`; тот же `resolveSpecialistTaskAttentionTone(...) ?? 'primary'` и те же две подписи | Эквивалентно |
| «Клиенты» (`id='patients'`) | Локальная цепочка знала только `communications` и `tasks`, поэтому точки не было никогда | `badgeKey='medicalMergeConflicts'`; count больше нуля даёт `danger`-точку и общую conflict-подпись, ноль не даёт точку | Дефект закрыт |
| Сообщения (`id='communications'`) | Точка при `messagesUnread + unreadExerciseComments > 0`, `danger`, подпись «Есть непрочитанные» | `badgeKey='communicationsTotal'`; общая карта содержит ту же сумму, тон и подпись | Эквивалентно |

## Один источник истины

Определения `isDotBadge` и `linkAriaLabelWhenBadged` остались только в новом общем модуле:

```bash
rg -n "function (isDotBadge|linkAriaLabelWhenBadged)|export function (isDotBadge|linkAriaLabelWhenBadged)" apps/webapp/src
# apps/webapp/src/shared/ui/doctor/shell/doctorNavBadges.ts:65:export function isDotBadge(...)
# apps/webapp/src/shared/ui/doctor/shell/doctorNavBadges.ts:85:export function linkAriaLabelWhenBadged(...)
```

Обе навигации читают одну карту:

```bash
rg -n "useDoctorNavBadgeCounts" apps/webapp/src
# DoctorBottomNav.tsx:19,47
# DoctorMenuAccordion.tsx:14,489
# doctorNavBadges.ts:24

rg -n "communicationsTotal: messagesUnread \+ unreadExerciseComments|overdueTasks: overdueTasks > 0 \? overdueTasks : todayTasks|medicalMergeConflicts," apps/webapp/src
# doctorNavBadges.ts:45-47,56

rg -n "item\.id === 'communications'|item\.id === 'tasks'" apps/webapp/src/shared/ui/doctor/shell
# exit 1, совпадений нет
```

`badgeSpanAriaLabel` в `DoctorMenuAccordion.tsx` относится только к отдельному числовому badge span; это не копия
link aria-label и не участвует в dot-badge «Клиенты».

## Optional hook и положение provider

`useOptionalDoctorMedicalMergeConflictCount` (`DoctorMedicalMergeConflictProvider.tsx:507-509`) читает тот же
`DoctorMedicalMergeConflictContext`, что строгий `useDoctorMedicalMergeConflicts` (`:511-518`): внутри provider
оба получают `contextValue.count`, снаружи optional-вариант даёт `0`, а строгий по-прежнему падает.

Нижняя навигация находится внутри provider: `DoctorWorkspaceShell.tsx:151-200` оборачивает
`DoctorWorkspaceViewport`, а тот рендерит `DoctorBottomNav` в `DoctorWorkspaceViewport.tsx:69`. Значение внутри
оболочки поэтому не меняется относительно прежнего `useDoctorMedicalMergeConflicts().count`.

## Инъекции

Все временные изменения production-кода после проверки откатились:

```bash
git diff --exit-code HEAD -- apps/webapp/src/shared/ui/doctor/DoctorMedicalMergeConflictProvider.tsx apps/webapp/src/shared/ui/doctor/shell/DoctorBottomNav.tsx apps/webapp/src/shared/ui/doctor/shell/DoctorMenuAccordion.tsx apps/webapp/src/shared/ui/doctor/shell/doctorNavBadges.ts apps/webapp/src/modules/specialist-tasks/taskPriority.ts
# exit 0
```

| Инъекция | Проверка | Результат и детектор |
|---|---|---|
| В `DoctorBottomNav` вернуть локальную цепочку `item.id === 'communications' / 'tasks'` | `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/specialist-tasks/taskPriority.unit.test.ts"` | Набор остался зелёным: `1 file`, `3 tests passed`. Поломку «Клиенты без точки» не ловит допустимая автоматика; её ловит взгляд на wiring и обязательный live-снимок после landing. Это не основание для запрещённого UI-теста. |
| Удалить `medicalMergeConflicts` из объекта `badgeCounts` | `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp typecheck"` | Красный `tsc`: `TS1360` и `TS2741`, `Property 'medicalMergeConflicts' is missing`. Полноту карты держит конструкция `satisfies Record<DoctorMenuBadgeKey, number>`. |
| Поставить `todayCount` выше `overdueCount` в `resolveSpecialistTaskAttentionTone` | `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/specialist-tasks/taskPriority.unit.test.ts"` | Красный тест `taskPriority.unit.test.ts:40`: `expected 'primary' to be 'danger'`. Регрессия приоритета просрочки автоматизированно поймана. |

В проведённых инъекциях UI-wiring не имеет допустимого автоматического oracle: это подтверждено зелёным
targeted-прогоном после возврата цепочки `item.id`; требуемый детектор — live-снимок.

## Финальные проверки на чистом candidate

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp typecheck"
# PASS, tsc --noEmit, rc=0

/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/shared/ui/doctor/DoctorMedicalMergeConflictProvider.tsx src/shared/ui/doctor/shell/DoctorBottomNav.tsx src/shared/ui/doctor/shell/DoctorMenuAccordion.tsx src/shared/ui/doctor/shell/doctorNavBadges.ts"
# PASS, rc=0

/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/specialist-tasks/taskPriority.unit.test.ts"
# PASS: 1 file, 3 tests passed, rc=0

git diff --check HEAD
# PASS, rc=0
```

Новых или изменённых тестов в candidate нет. Существующий `taskPriority.unit.test.ts` проверяет независимое
поведение тона задач; UI/map-тест не добавлен в соответствии с `AGENTS.md:1431-1490`.

## MUST FIX

Нет.

## НЕ СДЕЛАНО

- Не выполнен живой снимок candidate на `390×844`: по `AGENTS.md:2257-2258` он выполняется после landing на
  единственном общем Turbopack `:5200`.
- Не поднят второй Next-сервер.
- Не запущен полный CI: brief его запрещает, а repo-level риска в четырёх локальных UI-файлах нет.
- TEST, PROD и базы не тронуты; миграции не накатывались.
- Автоматический UI-тест не написан (`AGENTS.md:1482-1490`).

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет.
