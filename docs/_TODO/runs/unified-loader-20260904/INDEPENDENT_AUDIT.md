# Независимый аудит: единый контентный loader во всех кабинетах

- **Кандидат:** `2c6ce83367cb742f4ee93e0bf87f8bd0ed2892e4` на `wt/unified-loader-20260904`.
- **Сравнение:** `feat/doctor-ui-rebuild...2c6ce8336` — 95 файлов, +269/−469, один новый файл
  `apps/webapp/src/shared/ui/AppContentLoading.tsx`.
- **Authority:** bounded audit brief этого прохода + цитата решения владельца в нём. Аудитор — независимый Opus,
  продуктовый код не менял.
- **Способ проверки:** взгляд на код (§24.4 «качество разового действия»), плюс минимальные механические прогоны.
  Тесты не создавались: §10a запрещает закреплять UI-тестом наличие компонента, текст, число элементов и DOM;
  дорогого-и-молчаливого отказа здесь назвать нельзя — расхождение loader'ов видно глазами на первом же экране.

## ВЕРДИКТ: **FAIL**

Найдено **12 достижимых нарушений authority** (MUST FIX) + **1 NOTE** для решения владельца.
Собственные гейты воркера (typecheck, lint, vitest `ui`) **не поймали ни одного из 12** — все три зелёные и на
кандидате, и при независимом повторе. То есть **непойманных автоматикой: 12 из 12**.

Причина провала одна и механическая: конверсия шла поиском по подстроке `Загрузка`, а весь кабинет
администратора пишет это состояние другим словом — **`Загружаем …`**. Слово «Загрузка» не содержит буквы «ж»,
поэтому такой поиск физически не мог показать эти экраны.

## Оракул

Владелец: «Во всех кабинетах — **доктор, администратор и пациент** — состояния загрузки должны использовать один
визуальный элемент: серый текст `Загрузка…` нормального читаемого размера и рядом один вращающийся
индикатор-«лучик»». Явно вне: подписи действий, прогресс загрузки файлов, медиабуферизация.

## Что проверено и с каким результатом

| # | Класс проверки | Результат |
|---|---|---|
| 1 | Ровно один implementation; зональные имена — только alias | **PASS** |
| 2 | Компонент даёт серый `Загрузка…`, один spinner, центрирование по обеим осям; route-оболочка не ломает высоту | **PASS** |
| 3 | Doctor/admin/patient изоляция; `any`; новые зависимости; локальные копии того же loader в **изменённых** состояниях | **PASS** |
| 4 | Не подменены action labels / upload progress / pending-action / media buffering | **PASS** |
| 5 | Удалённые skeleton не были несущими для layout и доступности; состояния достижимы, без runtime/import ошибок | **PASS** |
| 6 | `ScheduleSetupTab` — общий loader вместо «Загрузка настроек календаря…» | **PASS** |
| 7 | Остаточные `Загрузка`/spinner-вхождения сверены с кодом | **FAIL — 12 достижимых нарушений** |

### 1. Один implementation — PASS

`apps/webapp/src/shared/ui/AppContentLoading.tsx` — единственная реализация. `AppRouteLoading` — та же функция с
`min-h-48 p-6`. `shared/ui/doctor/DoctorPanelLoading.tsx` после правки содержит **только** `export { … } from`,
без собственной разметки; отдельного patient-alias нет — patient-файлы импортируют примитив напрямую.
Проверено: во всём `apps/webapp/src` только `AppContentLoading.tsx` рендерит одновременно текст `Загрузка…` и
`animate-spin`. Остальные 6 файлов с `animate-spin` — исключительно медиа (`MediaThumb` ×2,
`*MediaPlaybackVideo` ×2, `MediaLightbox`, `MediaPickerQuickPreviewDialog`), их текст — «Изображение готовится»,
то есть подготовка деривата медиа, прямая карва-аут владельца.

### 2. Визуал и геометрия — PASS

`flex min-h-0 w-full flex-1 items-center justify-center gap-2 text-base text-muted-foreground md:text-sm`,
`<span>Загрузка…</span>` + `<Loader className="size-4 shrink-0 animate-spin" aria-hidden />`, `role="status"`.
Это ровно тот визуал, который до правки уже жил в `DoctorChatPanel` («Загрузка сообщений…» + тот же лучевой
`Loader` lucide) и в старом `DoctorPanelLoading` — то есть в общий примитив вынесен существующий образец, а не
изобретён новый. `text-base` на mobile / `text-sm` на desktop совпадает с закрытым набором §16 B.1.

Route-уровень высоту не ломает:
- patient: `PatientRouteLoadingShell` сохраняет `PATIENT_SHELL_CONTAINER_CLASS`
  (`flex min-h-[100dvh] flex-col`) и отдаёт loader'у `flex-1` → центр по обеим осям на весь вьюпорт;
- doctor: `DoctorPageLoading` = `min-h-48 p-6` — то же значение, что и до правки (`min-h-48 w-full p-6`),
  используется в 7 `loading.tsx` + `doctor/page.tsx`.

Единственная косметика (не нарушение): в трёх местах loader вставлен строкой в `flex`-ряд с классом `w-auto`
(`PatientTabKarta:1943`, `MaterialContentStatsClient:228`, `ProductAnalyticsSection:138`,
`NotificationsAnalyticsClient:100`, `ReminderStatsSection:109`); базовый `flex-1` при этом остаётся, и элемент
занимает остаток ряда. Раньше это был `<span>` по месту. Вкус, не authority.

### 3. Изоляция, типы, зависимости — PASS

`AppContentLoading.tsx` лежит вне обоих зональных деревьев и импортирует только `lucide-react` и `@/lib/utils` —
ни `@/shared/ui/doctor/**`, ни `@/shared/ui/patient/**`, ни `@/components/ui/**`, то есть не попадает ни под один
`no-restricted-imports` §17. Doctor-файлы тянут alias, patient-файлы — примитив напрямую; оба пути разрешены.
`eslint` по всем 95 изменённым файлам — **0 сообщений** (запущено независимо). В диффе нет ни одного добавленного
`any`; `package.json` не в диффе — новых зависимостей нет; `git show --check` чисто.

### 4. Ложных замен нет — PASS

Прочитан весь дифф построчно. Все замены — состояния ожидания контентной области. Не тронуты:
- прогресс/статус аплоада (`MediaLibraryClient` `uploadStatus`, «Загрузка отменена/завершена/прервана»,
  кнопки «Загрузка... / Загрузить файлы»);
- подписи действий (`{loadingOlder ? 'Загрузка...' : 'Показать предыдущие'}` в обоих discussion-панелях,
  «Загрузка… / Показать ещё», «Загрузка… / Предпросмотр», «Загрузка… / Повторить» в обоих плеерах,
  «Загрузка и добавление…», «Загрузка... / Загрузить список»);
- placeholder'ы селектов (`ReferenceSelect`, `ReferenceMultiSelect`, `MediaLibraryFolderScopeSelect`,
  `AutoCreateExercisesClient:300`, `SpecialistTaskFormDialog:85`);
- медиабуферизация и подготовка превью (все 6 медиа-файлов выше);
- `PatientShimmerLine` оставлен ровно в двух местах, и оба — pending **действия пользователя**, не контента:
  busy-кнопка привязки мессенджера (`PatientBrowserMessengerBindPanel:162,184`) и полоска ответа на mute
  (`PatientRemindersMuteBar:126`). Это соответствует объяснению воркера.
- В `MediaPickerList` и `MediaLibraryClient` заменены именно **списки** медиа и дерево папок (контент), а не
  аплоад — проверено по контексту.

### 5. Удалённые skeleton не были несущими — PASS

Удалены `PatientLoadingPatternBody`, `PatientShimmerCard`, `PatientShimmerPanel`, тип `PatientLoadingPattern` и
chrome-заглушки внутри `PatientRouteLoadingShell`. Остаточных ссылок на них в `apps/webapp/src` нет ни одной
(включая тесты) — отсюда и зелёный typecheck.

Доступность не деградировала: снятый с корня `aria-label="Загрузка"` заменён видимым текстом внутри
`role="status"`, `aria-busy="true"` на корне сохранён; снятые `sr-only`-подписи («Загрузка чата…», «Загрузка
вкладки…», «Загрузка программы…») тоже заменены видимым текстом того же смысла.

Единственное реальное структурное изменение — из loading-оболочки ушёл `<main id="app-shell-content">`, на
который в `patient.css:208–234` навешаны боковые/верхние отступы. Несущим он не был: правила задают padding
контента, а loader центрируется по всей колонке сам; `DoctorModal` обращается к этому id только при открытии
модалки, чего на `loading.tsx` не происходит. Регрессии нет.

Прогоны (независимые, не переиспользование отчёта воркера):
- `npx tsc --noEmit` (webapp) — **чисто**;
- `npx eslint` по 95 изменённым файлам — **чисто**;
- `vitest run --project=ui` через `host-orch/run-tests.sh` — **61 файл / 228 тестов passed**.

### 6. `ScheduleSetupTab` — PASS

Все четыре loader'а вкладки переведены на общий примитив, включая требуемый: строка
`'Загрузка настроек календаря…'` в `ScheduleCalendarDefaultsSection` заменена на `<DoctorPanelLoading className="py-6" />`
(`ScheduleSetupTab.tsx:349`). Поиск по репозиторию по строкам «Загрузка настроек календаря», «Загрузка календаря»,
«Загрузка графика», «Загрузка сообщений» — **0 вхождений**. Соседний `ScheduleCalendarTab` переведён тем же
проходом (3 состояния, включая overlay календаря).

### 7. Остаточные вхождения — **FAIL**

## MUST FIX (12)

### A. Кабинет администратора не унифицирован — 10 состояний в 6 файлах

Владелец назвал администратора одним из трёх кабинетов явно. Эти состояния — чистое ожидание контента (флаг
`loading` во время fetch), показывают **уточняющий** текст и **без индикатора**:

| # | Файл:строка | Текст |
|---|---|---|
| A1 | `apps/webapp/src/app/app/admin/audit-log/AdminAuthRegistrationEventsSection.tsx:236` | `Загружаем события регистрации…` |
| A2 | `apps/webapp/src/app/app/admin/payments/PlatformPaymentsSection.tsx:226` | `Загружаем сводку…` |
| A3 | `apps/webapp/src/app/app/admin/payments/PlatformPaymentsSection.tsx:815` | `Загружаем список клиник…` |
| A4 | `apps/webapp/src/app/app/admin/payments/PlatformPaymentsSection.tsx:1125` | `Загружаем платежи…` |
| A5 | `apps/webapp/src/app/app/admin/clinics/ClinicsConsoleClient.tsx:783` | `Загружаем биллинг…` |
| A6 | `apps/webapp/src/app/app/admin/clinics/ClinicsConsoleClient.tsx:922` | `Загружаем клиники…` |
| A7 | `apps/webapp/src/app/app/admin/commercial/CommercialConstructorClient.tsx:785` | `Загружаем коммерческие настройки…` |
| A8 | `apps/webapp/src/app/app/admin/commercial/TariffPolicyHistoryPanel.tsx:93` | `Загружаем журнал изменений…` |
| A9 | `apps/webapp/src/app/app/admin/health-archive/HealthFailureArchiveSection.tsx:171` | `Загружаем архив…` |
| A10 | `apps/webapp/src/app/app/admin/system-health/SystemHealthSection.tsx:939` | `Загружаем состояние системы…` |

Достижимость доказана: каждая секция рендерится реальной страницей —
`admin/audit-log/page.tsx`, `admin/payments/page.tsx`, `admin/clinics/page.tsx` (+`[organizationId]/page.tsx`),
`admin/commercial/page.tsx`, `admin/health-archive/page.tsx`, `admin/system-health/page.tsx`.

**Самое тяжёлое следствие — коммит сделал экран хуже, а не лучше.** `admin/audit-log/page.tsx` рендерит
`AdminAuthRegistrationEventsSection` (строки 14) прямо над `AdminAuditLogSection` (строка 15). Второй этим
коммитом переведён на общий loader, первый — нет. До коммита оба показывали серый текст без индикатора и выглядели
одинаково; после коммита на одном экране одновременно живут **два разных** визуала ожидания. Ровно то, что
владелец просил устранить. Тот же разрыв в `admin/payments`: `SaasBillingProviderSettings` конвертирован,
`PlatformPaymentsSection` на той же странице — нет.

Исключено из счёта осознанно: `HealthFailureArchiveSection.tsx:223` — `{loadingMore ? 'Загрузка…' : 'Ещё'}`,
это подпись кнопки (карва-аут владельца).

Отдельная оговорка по A3: там статус-строка стоит рядом с `Select`, чьи опции грузятся. Это не placeholder
самого селекта (у него свой `Выберите клинику`), а отдельная строка ожидания контента, поэтому она в списке.

### B. Кабинет врача — 2 состояния

| # | Файл:строка | Что |
|---|---|---|
| B1 | `apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx:693` | `<p className="mt-1 text-sm text-muted-foreground">Загрузка…</p>` |
| B2 | `apps/webapp/src/app/app/doctor/test-sets/TestSetForm.tsx:535` | то же |

Оба — блок «Где используется»: `useEffect` по `test?.id`/`testSet?.id` дёргает
`fetchDoctorClinicalTestUsageSnapshot` и на время `usageBusy` показывает серый `Загрузка…` **без индикатора**,
локальной разметкой вместо общего примитива. Достижимо при открытии любой существующей записи на редактирование.
Текст совпадает с целевым, поэтому эти два и не всплыли на глаз — но визуальный элемент разный (нет «лучика»),
а требование владельца — один элемент, а не одинаковый текст.

## NOTE (1) — решение владельца, не MUST FIX

`apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabOverview.tsx:437–442`: KPI-плитка на время
загрузки показывает `value='…'` с `valueClassName='animate-pulse text-muted-foreground'`. Это второй визуал
ожидания, и коммит-месседж сам обещает «без пульсации текста» — но файл в диффе, то есть воркер сюда смотрел и
осознанно оставил. Загонять полный `Загрузка… + spinner` в слот значения KPI-карточки может быть хуже, чем
пульсирующее многоточие. Аудитор не выдумывает скоуп: решение — за владельцем.

## Замечание по evidence

Bounded brief называет authority-документом
`docs/_TODO/runs/unified-loader-20260904/WORKER_BRIEF.md`. **Этого файла в checkout нет** (каталог существует, но
пуст и не в индексе git; в истории ветки его тоже нет). Аудит проведён против цитаты решения владельца,
приведённой в самом audit brief. Если worker brief содержал дополнительные ограничения или карва-ауты, они в этой
проверке не учтены.

## Что аудитор менял

Только этот отчёт и строку вердикта в `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`. Продуктовый код не
трогался, временных поломок не вносилось, тесты не создавались. Push, deploy, DEV/DB — не выполнялись.
