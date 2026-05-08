# LOG — DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE

**Назначение:** решения, проверки, инвентаризация кода, ссылки на PR.

---

## 2026-05-05

- Созданы [`README.md`](README.md) и [`ROADMAP.md`](ROADMAP.md) — консолидация источников по задаче «шаблон → instance → правки» из карточки врача.

---

## 2026-05-05 — Выполнение MASTER_PLAN.md

### Шаг 1: Удалён `AssignLfkTemplatePanel` из карточки и страниц

- `ClientProfileCard.tsx`: удалён `import AssignLfkTemplatePanel`, удалены пропсы `publishedLfkTemplates` и `assignLfkEnabled`, удалён рендер `<AssignLfkTemplatePanel ... />`.
- `[userId]/page.tsx`: убран `deps.lfkTemplates.listTemplates(...)` из `Promise.all`, удалены соответствующие пропсы.
- `page.tsx` (список клиентов): убран `deps.lfkTemplates.listTemplates(...)` из верхнеуровневого `Promise.all` (лишний запрос к БД при каждом рендере), удалены пропсы.
- `ClientProfileCard.backLink.test.tsx`: удалён `vi.mock("./AssignLfkTemplatePanel", ...)`.
- Проверка: `rg "AssignLfkTemplatePanel" apps/webapp/src` → только удаляемые файлы; `rg "publishedLfkTemplates|assignLfkEnabled" apps/webapp/src/app/app/doctor/clients` → пусто.
- `pnpm --dir apps/webapp exec tsc --noEmit` → OK.

### Шаг 2: Удалены файлы `AssignLfkTemplatePanel.tsx` и `assignLfkTemplateAction.ts`

- `rg "assignLfkTemplateFromDoctor|assignLfkTemplateAction|AssignLfkTemplatePanel" apps/webapp/src` → только сами файлы, внешних ссылок нет.
- Файлы удалены.
- `pnpm --dir apps/webapp exec tsc --noEmit` → OK.

### Шаг 3: Модалка выбора шаблона в `PatientTreatmentProgramsPanel.tsx`

- Инлайн-`Select` + старая кнопка «Назначить программу» заменены на CTA «Назначить программу лечения» + `Dialog`.
- Модалка: поиск по названию (всегда виден), прокручиваемый список с выделением, inline-ошибка (`role="alert"`), кнопки «Отмена» / «Назначить».
- Успех: `toast.success("Программа лечения назначена")` + закрытие модалки + перезагрузка списка инстансов.
- 409/ошибка: показывается `data.error` inline под списком, модалка остаётся открытой.
- `DialogContent`: `className="max-h-[80vh] overflow-y-auto"`.

### Шаг 4: Целевые проверки (без full CI)

- `pnpm --dir apps/webapp exec tsc --noEmit` → OK.
- `pnpm --dir apps/webapp lint` → OK.
- `pnpm --dir apps/webapp test -- PatientTreatmentProgramsPanel` → 3 новых теста зелёные; 539 файлов / 2763 теста всего прошли.

### Что намеренно не трогали

- `lfkAssignments` в `buildAppDeps` и `pgLfkAssignments.ts` — используются в purge/merge/diaries.
- `DoctorLfkComplexExerciseOverridesPanel` — оставлен для правки legacy-данных.
- API `treatment-program-instances` — контракт не менялся.
- Никаких миграций и изменений схемы БД.

---

## 2026-05-07 — Parity UI: конструктор шаблона → экран назначенной программы

Краткая матрица (template constructor vs doctor instance editor):

| Блок | Шаблон (`TreatmentProgramConstructorClient`) | Инстанс (до работ) | Инстанс (цель) |
|------|----------------------------------------------|--------------------|----------------|
| Карточка этапа | `TPL_CONSTRUCTOR_LEARNING_STAGE_CARD_CLASS`, цветная шапка | Простая `section` + текст | Тот же shell + цветная шапка этапа |
| Toolbar этапа | `+ Группа`, настройки этапа, reorder этапов | `StageDoctorControls` отдельным блоком | `+ Группа` в шапке карточки; управление этапом в теле |
| Группа | Карточка с цветной шапкой, элементы inline в `ul` | Строка группы; элементы только в модалке «Изменить» | Карточка как в шаблоне; элементы inline под группой |
| Элемент | Компактная строка + модалка настроек | Развёрнутая карточка | Компактный `<details>` + детали при раскрытии |
| Мутации | Черновик/публикация | Без единого guard | `requestProgramInstanceDataMutation` для `active`; lock при `completed` |

Общий код: `@/app/app/doctor/treatment-program-shared/*` (shell styles + guard).

---

## 2026-05-07 — Реализация Constructor-style UI для экземпляра программы

- Shell как у конструктора шаблона: `INSTANCE_CONSTRUCTOR_LEARNING_STAGE_CARD_CLASS`, цветные шапки этапа/групп, группы с inline-элементами; этап 0 «Общие рекомендации» — карточка с шапкой в левой колонке.
- Мутации: `requestProgramInstanceDataMutation` / `isProgramInstanceEditLocked` (`programInstanceMutationGuard.ts`); для `active` — `confirm` перед PATCH/POST; для `completed` — кнопки отключены.
- Элементы: `<details>` + бейдж «Комментарий: своё» при непустом `localComment`.
- Файлы: `TreatmentProgramInstanceDetailClient.tsx`, `treatment-program-shared/*`.
- Проверки: `pnpm --dir apps/webapp exec tsc --noEmit`, `pnpm exec eslint` по затронутым путям.
- Не делали: полноценный «добавить элемент из каталога» как в шаблоне (отдельный picker / POST items из UI).

---

## 2026-05-07 — Системные группы экземпляра и документация

- Реализованы/зафиксированы: `system_kind` на `treatment_program_instance_stage_groups` (Drizzle + миграции `0044`, `0045` — уникальность одной rec/tests на этап), автоподстановка системных групп в `createInstanceTree` при ungrouped `recommendation`/`clinical_test` без строк в `groups` (`instance-tree-system-groups.ts`).
- Обновлены: `PROGRAM_PATIENT_SHAPE_PLAN.md` §1.1 / §1.1a, `ROADMAP.md` §4, `PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md` (таблица фильтров), JSDoc в `types.ts` для дерева экземпляра.

---

## 2026-05-07 — Правки по пост-реализационному аудиту (UX/a11y/DRY)

- **Guard:** добавлен `runIfProgramInstanceMutationAllowed`; мутации инстанса в `TreatmentProgramInstanceDetailClient` переведены на него (единая точка после sync `requestProgramInstanceDataMutation`).
- **Скрыть группу:** одно подтверждение — текст для `active` включает предупреждение об активной программе и последствия hide (раньше было guard + второй `confirm`).
- **Дубль «Отключено»:** убран бейдж в свёрнутой строке `<details>` карточки элемента; статус остаётся в строке действий (`InstanceStageItemDoctorRow`).
- **a11y:** `DialogDescription` для завершения программы, отключения элемента с историей; расширено описание модалки «Настройки этапа» (шаблон → правки только для пациента).
- **`CommentBlock`:** опциональный `mutationsDisabled` — при завершённой программе скрыта форма нового комментария и недоступны правки/удаление существующих.
- **DRY shell:** константы шапок/карточек конструктора шаблона импортируются из `treatment-program-shared/treatmentProgramConstructorShellStyles.ts` (алиасы `TPL_*`).
- **Не делали:** UI «добавить элемент из каталога» на экране инстанса — по-прежнему бэклог parity с шаблоном.

Проверки: `pnpm --dir apps/webapp exec tsc --noEmit` → OK; `pnpm --dir apps/webapp exec eslint` по путям `TreatmentProgramInstanceDetailClient`, `TreatmentProgramConstructorClient`, `treatment-program-shared/*`, `CommentBlock` → OK.

---

## 2026-05-08 — Плоские тесты в программе (`clinical_test`) и синхронизация доков

- Продуктовый тип элемента этапа для одного клинического теста: **`clinical_test`**; развёртывание каталожного набора — **`POST .../items/from-test-set`** (шаблон и инстанс). Снимок элемента по-прежнему несёт массив **`tests[]`** там, где нужен состав (например после разворота из набора).
- Документация: `ROADMAP.md` §4, `apps/webapp/src/app/api/api.md`, `docs/README.md`, `ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md`, `PROGRAM_PATIENT_SHAPE_PLAN.md` §1 / §1.1a / таблица completion, `PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/{LOG,BLOCK_LAYOUT_REFERENCE}.md`, JSDoc в `testSetSnapshotView.ts` и `stageItemSnapshot.ts`, лог событий `item_added` при expand — `source: "expand_test_set_into_clinical_tests"`.
- Миграция `0048`: конвертация legacy `test_set` → строки `clinical_test` по строкам каталога **`test_set_items`** (не по JSON snapshot).

---

## 2026-05-08 — Рекомендации: дефолт «постоянная» на экземпляре

- **`createTreatmentProgramInstanceService`:** при копировании шаблона в инстанс и при `doctorAddStageItem` для `recommendation` выставляется **`is_actionable = false`** (постоянная). Раньше было `true` (исполняемая). Переключение «Требует выполнения» — по-прежнему в UI карточки элемента инстанса (`PATCH` с `isActionable`).
- Тест: `instance-service.test.ts` (ожидание после assign).
- Документация: [`ROADMAP.md`](ROADMAP.md) §4, [`PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) §4.1, [`TARGET_STRUCTURE_PATIENT.md`](../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_PATIENT.md) §12.3; backlog «дефолт из каталога/шаблона» — [`docs/TODO.md`](../../TODO.md).

---

## 2026-05-05 — Аудит выполнения и закрытие документации

- Проведён полный аудит против `MASTER_PLAN.md` §Definition of Done и `DECOMPOSITION.md` этапы A–E.
- Все автоматически проверяемые пункты DoD (1–7, 9) **подтверждены** против кода и вывода тестов.
- **Единственный незакрытый пункт** — DoD №8 «ручной smoke» — требует живого стенда; в `MASTER_PLAN.md` шаг 4 помечен `⏳ pending`.
- Документация синхронизирована:
  - `MASTER_PLAN.md`: статус → ✅ выполнен, чеклисты шагов 1–3, 5 закрыты, DoD проставлены.
  - `DECOMPOSITION.md`: таблица этапов A–E обновлена статусами.
  - `ROADMAP.md`: заголовок и §6 Этап 2 отражают факт завершения.
- Оставшаяся работа по инициативе (этапы 3–6 из `ROADMAP.md`): правка инстанса из карточки, inbox «К проверке», каталоги — **отдельная задача**, не блокируется текущим состоянием.

---

## 2026-05-08 — Пустой индивидуальный план и свободный текст рекомендаций (этап 0)

### Сделано

- **`template_id` nullable на дереве создания:** `CreateTreatmentProgramInstanceTreeInput.templateId: string | null`, `TreatmentProgramInstanceStageInput.sourceStageId: string | null` (уже совпадало с БД).
- **`createBlankIndividualPlan`** в `instance-service`: один этап с `sort_order = 0`, заголовок этапа `TREATMENT_PROGRAM_TEMPLATE_STAGE_ZERO_TITLE`, заголовок инстанса по умолчанию `BLANK_INDIVIDUAL_PLAN_DEFAULT_TITLE`.
- **POST** `/api/doctor/clients/[userId]/treatment-program-instances`: тело `kind: "from_template" | "blank"` + **legacy** `{ templateId }` → трактуется как `from_template`.
- **Атомарное добавление свободного текста:** порт `createFreeformRecommendationAndStageItem` (PG транзакция: `recommendations` + `instance_stage_item`), сервис `doctorAddFreeformRecommendationToStageZero`, route `POST .../items/from-freeform-recommendation`. Тег строки каталога: `tp_instance_freeform`.
- **UI:** `PatientTreatmentProgramsPanel` — режим «Пустой план», метка «без шаблона» в списке; `InstanceAddLibraryItemDialog` — вкладки «Каталог» / «Свой текст» только для этапа 0.

### Проверки

- `pnpm --dir apps/webapp exec vitest run` (таргет): `instance-service.test.ts`, `PatientTreatmentProgramsPanel.test.tsx`, `InstanceAddLibraryItemDialog.test.tsx`, `treatment-program-instances/route.test.ts`, `from-freeform-recommendation/route.test.ts`.
- Ручной интеграционный сценарий — см. блок **«Ручной smoke»** ниже (не заменяет CI).
- Документация API: `apps/webapp/src/app/api/api.md` — строка про **`POST .../items/from-freeform-recommendation`**.
- Полный **`pnpm run ci`** (корень монорепо): после фикса импорта константы тега в `pgTreatmentProgramInstance.ts` (value-import вместо `import type`).

### Не делали

- Сущность «Приём», журнал посещений, FK приём → элемент.

### Ручной smoke (перед релизом или после деплоя)

1. Карточка пациента → «Назначить программу лечения» → «Пустой план» → создать; в списке инстансов есть суффикс «без шаблона».
2. То же с заполненным необязательным названием — заголовок инстанса в списке совпадает с вводом.
3. Открыть экземпляр → этап «Общие рекомендации» → добавить «Свой текст» (Markdown) → элемент появляется в списке этапа.
4. Войти как пациент этого пользователя → план лечения → рекомендация этапа 0 отображается.
5. Повторное назначение при уже активной программе → **409** и сообщение о второй активной программе.

Дублирование автоматических проверок: доменная логика этапа 0 для freeform — **`instance-service.test.ts`** (`doctorAddFreeformRecommendationToStageZero`); HTTP-маршрут — **`from-freeform-recommendation/route.test.ts`** (в т.ч. чужой **`stageId`** в URL).

### Доработка после аудита (тот же день)

- Пустой план: в модалке назначения — необязательное поле названия инстанса → `POST { kind: "blank", title? }`; guard «Назначение…» покрыт тестом «кнопка disabled на время POST».
- Этап 0 «Свой текст»: в модалке — **`Textarea`** для тела (в **`bodyMd`**); тест `InstanceAddLibraryItemDialog.test.tsx`.
- API-тесты **`from-freeform-recommendation`**: `401`, `403`, `404` (инстанс / пациент), `400` для не-этапа 0 (в route-тесте — **другой `stageId` в URL** + mock сервиса, зеркало отказа); **`clients/.../treatment-program-instances`**: `kind: "blank"` с `title`.
- Проверка: полный **`pnpm run ci`** после правок.

---

## 2026-05-09 — Аудит экрана инстанса (порядок этапа 0, контракт API)

- **Порядок элементов на этапе 0:** перестановка стрелками учитывает только **`item_type === "recommendation"`** внутри «ленты» этапа 0, чтобы не смешивать с другими строками с `group_id = null` (если они появятся).
- **Документация:** `apps/webapp/src/app/api/api.md` — **`DELETE .../stage-items/[itemId]`**, актуальный ввод freeform через **`Textarea`**; `ROADMAP.md` §4 — удаление строки инстанса при отсутствии истории.