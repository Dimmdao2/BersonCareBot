# Фаза 0 — атомарные задачи (0.1–0.8)

Источник: `docs/BRANCH_UX_CMS_BOOKING/PLAN.md` (раздел «Фаза 0»), `docs/BRANCH_UX_CMS_BOOKING/DECOMPOSITION_MODEL.md`, `docs/archive/2026-04-docs-cleanup/reports/UX_ANALYSIS_2026-03-31.md`.

Ниже зафиксирована декомпозиция по шаблону с привязкой к текущему коду и точным диапазонам строк (актуально на момент подготовки документа).

---

### Задача 0.1: Скрыть ссылку на `/app/patient/purchases` из навигации

**Цель:** пациент не должен видеть навигационный путь в раздел с мок-данными покупок.

**Предусловия:**
- Файлы `apps/webapp/src/app-layer/routes/navigation.ts` и `apps/webapp/src/shared/ui/PatientHeader.tsx` существуют.
- Никакие задачи фазы 0 не обязательны как зависимость.

**Файлы для изменения:**
1. `apps/webapp/src/app-layer/routes/navigation.ts` — удалить следы nav-модели для `purchases`.
2. `apps/webapp/src/shared/ui/PatientHeader.tsx` — контрольный проход: убедиться, что link на purchases отсутствует (правки не требуются).

**Файлы для создания:**
- Нет.

**Файлы для удаления:**
- Нет.

**Детальное описание:**
- В `apps/webapp/src/app-layer/routes/navigation.ts`:
  - Строки `44-52`: в `HomeBlockId` удалить вариант `| "purchases"` и связанный комментарий `45-48`.
  - Строка `61`: удалить комментарий про условную инъекцию `"purchases"`.
- В `apps/webapp/src/shared/ui/PatientHeader.tsx`:
  - Проверить, что в блоке меню (`217-298`) нет пункта `href="/app/patient/purchases"`; изменений не вносить.

**Тесты:**
- [ ] Unit: обновить/добавить проверку для `patientHomeBlocksCanonical` (нет `purchases` в декларации блоков).
- [ ] Manual: открыть меню пациента (mobile/desktop) и убедиться, что пункта «Мои покупки» нет.

**Критерии готовности:**
- [ ] Навигация пациента не содержит ссылок на `/app/patient/purchases`.
- [ ] Декларативная nav-модель не содержит `purchases`.
- [ ] `pnpm run ci` зелёный.

---

### Задача 0.2: Скрыть ссылку на `/app/patient/help` из навигации

**Цель:** убрать переход в placeholder-экран «Справка» из шапки/меню пациента.

**Предусловия:**
- Файлы `navigation.ts` и `PatientHeader.tsx` доступны для правок.

**Файлы для изменения:**
1. `apps/webapp/src/app-layer/routes/navigation.ts` — убрать иконку `help` из конфигурации.
2. `apps/webapp/src/shared/ui/PatientHeader.tsx` — убрать рендер `help`-иконки.

**Файлы для создания:**
- Нет.

**Файлы для удаления:**
- Нет.

**Детальное описание:**
- В `apps/webapp/src/app-layer/routes/navigation.ts`:
  - Строка `8`: в `HeaderIconId` удалить `"help"`.
  - Строка `19`: заменить `headerRightIcons: ["help", "settings"]` на `["settings"]`.
  - Строка `26`: заменить `["messages", "help", "menu"]` на `["messages", "menu"]`.
  - Строка `32`: заменить `["messages", "help", "menu"]` на `["messages", "menu"]`.
- В `apps/webapp/src/shared/ui/PatientHeader.tsx`:
  - Строка `10`: удалить импорт `CircleHelp`.
  - Строки `132-143`: удалить ветку `case "help": ...`.

**Тесты:**
- [ ] Unit: обновить проверки nav-конфига пациента под новый набор `headerRightIcons`.
- [ ] Manual: в шапке пациента отсутствует иконка «Справка» для bot/mobile/desktop режимов.

**Критерии готовности:**
- [ ] На экранах пациента нет кнопки/иконки перехода на `/app/patient/help`.
- [ ] Конфиг `patientNavByPlatform` не содержит `help`.
- [ ] `pnpm run ci` зелёный.

---

### Задача 0.3: Скрыть ссылку на `/app/patient/install` из навигации

**Цель:** убрать из навигационной модели любые признаки install-пункта/промпта.

**Предусловия:**
- Доступен файл `apps/webapp/src/app-layer/routes/navigation.ts`.

**Файлы для изменения:**
1. `apps/webapp/src/app-layer/routes/navigation.ts` — удалить флаг install-prompt из `PatientNavConfig`.
2. `apps/webapp/src/shared/ui/PatientHeader.tsx` — контрольная проверка: install-link отсутствует (правки не требуются).

**Файлы для создания:**
- Нет.

**Файлы для удаления:**
- Нет.

**Детальное описание:**
- В `apps/webapp/src/app-layer/routes/navigation.ts`:
  - Строка `14`: удалить поле `showInstallPrompt: boolean;`.
  - Строка `22`: удалить `showInstallPrompt: false,`.
  - Строка `29`: удалить `showInstallPrompt: true,`.
  - Строка `35`: удалить `showInstallPrompt: false,`.
- В `apps/webapp/src/shared/ui/PatientHeader.tsx`:
  - Проверить, что в меню (`217-298`) и в иконках (`85-157`) нет `routePaths.patientInstall`; правки не требуются.

**Тесты:**
- [ ] Unit: скорректировать `apps/webapp/src/app-layer/routes/navigation.test.ts` (удалить assert по `showInstallPrompt`).
- [ ] Manual: в шапке и меню пациента отсутствуют пункты «Установить приложение».

**Критерии готовности:**
- [ ] В nav-модели пациента отсутствует install-флаг.
- [ ] В пользовательской навигации нет ссылок на `/app/patient/install`.
- [ ] `pnpm run ci` зелёный.

---

### Задача 0.4: Скрыть `/app/doctor/references` из меню врача

**Цель:** убрать из меню и заголовков пустой раздел «Справочники».

**Предусловия:**
- Доступны `DoctorHeader.tsx` и `doctorScreenTitles.ts`.

**Файлы для изменения:**
1. `apps/webapp/src/shared/ui/DoctorHeader.tsx` — убрать ссылку `references` из `DOCTOR_MENU_LINKS`.
2. `apps/webapp/src/shared/ui/doctorScreenTitles.ts` — удалить title для `/app/doctor/references`.

**Файлы для создания:**
- Нет.

**Файлы для удаления:**
- Нет.

**Детальное описание:**
- В `apps/webapp/src/shared/ui/DoctorHeader.tsx`:
  - Строка `45`: удалить объект `{ id: "references", label: "Справочники", href: "/app/doctor/references" },`.
- В `apps/webapp/src/shared/ui/doctorScreenTitles.ts`:
  - Строка `20`: удалить запись `"/app/doctor/references": "Справочники",`.

**Тесты:**
- [ ] Manual: в sheet-меню врача отсутствует пункт «Справочники».
- [ ] Manual: переходы между остальными разделами врача не затронуты.

**Критерии готовности:**
- [ ] `/app/doctor/references` не отображается в меню врача.
- [ ] Логика заголовков не содержит reference-title.
- [ ] `pnpm run ci` зелёный.

---

### Задача 0.5: Убрать API-вызовы из `/app/doctor/broadcasts`, оставить только инфо-баннер

**Цель:** исключить бесполезные запросы и оставить честный информирующий экран до релиза рассылок.

**Предусловия:**
- Доступны `broadcasts/page.tsx` и `DoctorHeader.tsx`.

**Файлы для изменения:**
1. `apps/webapp/src/app/app/doctor/broadcasts/page.tsx` — удалить вызовы `buildAppDeps`, `getCategories`, `listAudit`, оставить статический баннер.
2. `apps/webapp/src/shared/ui/DoctorHeader.tsx` — убрать пункт «Рассылки» из меню (чтобы экран не находился из nav).

**Файлы для создания:**
- Нет.

**Файлы для удаления:**
- Нет.

**Детальное описание:**
- В `apps/webapp/src/app/app/doctor/broadcasts/page.tsx`:
  - Строка `7`: удалить импорт `buildAppDeps`.
  - Строки `12-14`: удалить `const deps...`, `const categories...`, `const audit...`.
  - Строки `21-23`: удалить текст с `categories.join(...)` и `audit.length`; заменить на статичную подпись без API-данных (например, про доступность во втором релизе).
- В `apps/webapp/src/shared/ui/DoctorHeader.tsx`:
  - Строка `44`: удалить объект `{ id: "broadcasts", label: "Рассылки", href: "/app/doctor/broadcasts" },`.

**Тесты:**
- [ ] Manual: открытие `/app/doctor/broadcasts` не инициирует вызовы сервиса рассылок.
- [ ] Manual: в меню врача нет пункта «Рассылки».

**Критерии готовности:**
- [ ] В `broadcasts/page.tsx` отсутствуют API-вызовы.
- [ ] Экран показывает только статическое инфо-сообщение.
- [ ] `pnpm run ci` зелёный.

---

### Задача 0.6: Исправить дублирование `border`/`padding`/`border-radius` в `DashboardTile`

**Цель:** устранить конфликт tailwind-классов и стабилизировать визуал плиток.

**Предусловия:**
- Доступен файл `apps/webapp/src/app/app/doctor/page.tsx`.

**Файлы для изменения:**
1. `apps/webapp/src/app/app/doctor/page.tsx` — нормализовать className у `DashboardTile`.

**Файлы для создания:**
- Нет.

**Файлы для удаления:**
- Нет.

**Детальное описание:**
- В `apps/webapp/src/app/app/doctor/page.tsx`:
  - Строка `145`: заменить дублированную строку классов
    - убрать повторные токены: второй `rounded-*`, второй `border*`, второй `p-4`, второй `shadow-sm`;
    - оставить единый набор, например: `rounded-xl border border-border/60 bg-card p-4 shadow-sm flex flex-col justify-between gap-1 transition-colors hover:bg-muted/40`.

**Тесты:**
- [ ] Manual: плитки на `/app/doctor` имеют единый радиус, бордер и отступы.
- [ ] Visual check: mobile и desktop рендер без «двойной рамки».

**Критерии готовности:**
- [ ] `DashboardTile` не содержит дубликатов конфликтующих классов.
- [ ] Визуальный баг устранён.
- [ ] `pnpm run ci` зелёный.

---

### Задача 0.7: Убрать блок «Быстрые действия» на дашборде врача

**Цель:** устранить дублирование навигации и освободить место под полезные метрики.

**Предусловия:**
- Выполнена или не требуется задача 0.6.
- Доступен `apps/webapp/src/app/app/doctor/page.tsx`.

**Файлы для изменения:**
1. `apps/webapp/src/app/app/doctor/page.tsx` — удалить секцию быстрых действий и неиспользуемый импорт.

**Файлы для создания:**
- Нет.

**Файлы для удаления:**
- Нет.

**Детальное описание:**
- В `apps/webapp/src/app/app/doctor/page.tsx`:
  - Строка `8`: удалить импорт `buttonVariants` (после удаления секции он не нужен).
  - Строки `81-123`: удалить весь `<section id="doctor-dashboard-quick-actions" ...>...</section>`.

**Тесты:**
- [ ] Manual: на `/app/doctor` отсутствует блок «Быстрые действия».
- [ ] Manual: основная навигация через `DoctorHeader` продолжает работать.

**Критерии готовности:**
- [ ] На дашборде врача нет дублирующего action-блока.
- [ ] В файле нет неиспользуемых импортов после удаления секции.
- [ ] `pnpm run ci` зелёный.

---

### Задача 0.8: Заменить `MOCK_ITEMS` в purchases на пустое состояние

**Цель:** если пользователь попадает на `/app/patient/purchases` напрямую, экран не должен показывать вымышленные данные.

**Предусловия:**
- Файл `apps/webapp/src/app/app/patient/purchases/page.tsx` доступен.

**Файлы для изменения:**
1. `apps/webapp/src/app/app/patient/purchases/page.tsx` — удалить `MOCK_ITEMS` и список карточек, заменить empty-state блоком.

**Файлы для создания:**
- Нет.

**Файлы для удаления:**
- Нет.

**Детальное описание:**
- В `apps/webapp/src/app/app/patient/purchases/page.tsx`:
  - Строка `10`: удалить импорт `Badge` (больше не нужен).
  - Строки `14-19`: удалить константу `MOCK_ITEMS`.
  - Строки `39-52`: заменить секцию списка на empty-state:
    - заголовок оставить (`Курсы, доступы и подписки`),
    - вместо `<ul>...MOCK_ITEMS.map(...)...</ul>` вставить абзац о том, что покупок пока нет или раздел станет доступен позже.

**Тесты:**
- [ ] Manual: `/app/patient/purchases` отображает пустое состояние без карточек с фиктивными курсами.
- [ ] Manual: состояние guest access (`PurchasesGuestAccess`) не сломано.

**Критерии готовности:**
- [ ] `MOCK_ITEMS` полностью удалены из страницы.
- [ ] Пользователь видит корректное empty-state без ложных дат и названий.
- [ ] `pnpm run ci` зелёный.

