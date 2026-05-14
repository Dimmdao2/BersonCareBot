# MASTER PLAN: убрать прямое назначение ЛФК — оставить только программу лечения

**Дата:** 2026-05-05  
**Статус:** ✅ выполнен (2026-05-05) — ручной smoke на живом стенде остаётся за командой  
**Папка инициативы:** `docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/`

Детальная декомпозиция по этапам A–E: [`DECOMPOSITION.md`](DECOMPOSITION.md).

---

## Проблема

В карточке клиента (`ClientProfileCard.tsx`) **два независимых механизма** назначения:

| Секция | Компонент | Сервис/хранилище | Статус |
|--------|-----------|------------------|--------|
| `lfk` | `AssignLfkTemplatePanel` | `lfkAssignments.assignTemplateToPatient` → `patient_lfk_assignments` | **Legacy — убираем** |
| `treatment-programs` | `PatientTreatmentProgramsPanel` | `treatmentProgramInstance.assignTemplateToPatient` → `treatment_program_instances` | **Целевой — оставляем** |

Врач видит кнопку «Назначить комплекс ЛФК» рядом с кнопкой «Назначить программу». В целевой доменной модели ЛФК-комплекс — это *элемент этапа* в программе лечения, а не самостоятельное назначение.

---

## Цель

Убрать прямой путь «выбрать ЛФК-шаблон → назначить пациенту» из карточки клиента.  
Сохранить редактор **переопределений упражнений** (`DoctorLfkComplexExerciseOverridesPanel`) — он нужен для legacy-данных.  
Заменить инлайн-`Select` в `PatientTreatmentProgramsPanel` на **CTA → модалку** с поиском.  
Раздел «Программы лечения» становится единственной и удобной точкой назначения.

---

## Scope

### Разрешено трогать

- `apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx`
- `apps/webapp/src/app/app/doctor/clients/ClientProfileCard.backLink.test.tsx`
- `apps/webapp/src/app/app/doctor/clients/AssignLfkTemplatePanel.tsx` (удалить)
- `apps/webapp/src/app/app/doctor/clients/assignLfkTemplateAction.ts` (удалить)
- `apps/webapp/src/app/app/doctor/clients/[userId]/page.tsx`
- `apps/webapp/src/app/app/doctor/clients/page.tsx`
- `apps/webapp/src/app/app/doctor/clients/PatientTreatmentProgramsPanel.tsx` (модалка)
- опционально новый файл `AssignTreatmentProgramTemplateModal.tsx` рядом — если разметка модалки > ~60 строк
- `docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md`

### Вне scope

- `infra/repos/pgLfkAssignments.ts` — не трогать; legacy назначения существуют в БД
- `patient_lfk_assignments` таблица — не трогать
- `DoctorLfkComplexExerciseOverridesPanel.tsx` — не трогать (нужен для редактуры legacy)
- API `treatment-program-instances` — не менять контракт; POST уже есть и работает
- Пациентский UI (`app/patient/*`) — не трогать
- LFK-каталоги в кабинете врача — не трогать
- `RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md` — только читать

---

## Карта файлов (до изменений)

```
apps/webapp/src/app/app/doctor/clients/
├── [userId]/page.tsx                           ← читает publishedLfkTemplates + lfkExerciseLinesByComplexId
├── page.tsx                                    ← читает publishedLfkTemplates на верхнем уровне (всегда!)
├── ClientProfileCard.tsx                       ← секция lfk с AssignLfkTemplatePanel
├── ClientProfileCard.backLink.test.tsx         ← проверить наличие мок-пропсов
├── AssignLfkTemplatePanel.tsx                  ← удалить
├── assignLfkTemplateAction.ts                  ← удалить
├── DoctorLfkComplexExerciseOverridesPanel.tsx  ← оставить (legacy)
└── PatientTreatmentProgramsPanel.tsx           ← заменить inline Select на CTA → Dialog
```

**Важный факт о `page.tsx` (список):** `publishedLfkTemplates` загружается в `Promise.all` на
верхнем уровне — **вне** ветки `selected ? Promise.all(...)`. Это значит, что лишний запрос
`listTemplates` выполняется **при каждом рендере списка клиентов**, даже если никакой клиент
не выбран. Удаление этого запроса — полезный side-effect шага 1.

---

## Принятые решения (все открытые вопросы закрыты)

> Раньше эти вопросы были помечены как «нужна эскалация» в `DECOMPOSITION.md`. Ниже — финальные ответы.

| Вопрос | Решение | Обоснование |
|--------|---------|-------------|
| **CTA текст** | **«Назначить программу лечения»** | Полное, однозначное, в медицинском контексте не режет ухо |
| **toast.success после назначения** | **Да** — добавить `toast.success` | `react-hot-toast` уже в проекте; `DoctorLfkComplexExerciseOverridesPanel` в той же папке уже использует; удаляемая ЛФК-панель тоже использовала; единообразие |
| **Источник toast** | `import toast from "react-hot-toast"` — пакет уже в зависимостях webapp | — |
| **Текст 409 / ошибки в модалке** | Показывать `data.error` из API **дословно**, как есть — строка уже человекочитаемая: `"У пациента уже есть активная программа. Завершите текущую программу или дождитесь её завершения перед назначением новой."` | `SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE` в `instance-service.ts` — уже осмысленный русский текст; отдельная локализация не нужна |
| **Где показывать ошибку** | **Inline в модалке** (под списком), не toast | 409 — это ограничение, требующее осознанного решения врача (завершить текущую); toast пропустить легче |
| **Поиск в модалке** | **Всегда** показывать поле поиска, без threshold-константы | Проще и предсказуемее; одно поведение при любом числе шаблонов |
| **Подсказка «Комплексы — через программу»** | **Не добавлять** | Секция ЛФК — просмотр legacy-данных; врач уже видит новый раздел «Программы лечения»; педагогическая подсказка в ЛФК-секции — лишний шум |
| **Тест для модалки** | Добавить `PatientTreatmentProgramsPanel.test.tsx`: открытие модалки, успешное назначение (mock `fetch`), показ 409 ошибки. `pnpm --dir apps/webapp test -- PatientTreatmentProgramsPanel` | По `test-execution-policy.md` — step-level, targeted Vitest по файлу |
| **a11y в модалке** | Shadcn `Dialog` покрывает focus-trap, Escape, `role="dialog"`, `aria-modal` из коробки. `DialogContent` добавить `max-h-[80vh] overflow-y-auto` для мобильных | Достаточно для первого прохода; отдельный a11y-аудит — при баг-репортах |
| **Модалка в отдельном файле?** | Если разметка модалки > ~60 строк — вынести в `AssignTreatmentProgramTemplateModal.tsx` | Конкретный порог, не «при росте сложности» |

---

## Шаг 1 — Удалить `AssignLfkTemplatePanel` из карточки и вычистить пропсы

**Файлы:** `ClientProfileCard.tsx`, `[userId]/page.tsx`, `page.tsx`, тест.

### 1.1 `ClientProfileCard.tsx`

- Удалить `import { AssignLfkTemplatePanel } from "./AssignLfkTemplatePanel"`.
- Удалить из `ClientProfileCardProps`:
  - `publishedLfkTemplates`
  - `assignLfkEnabled`
- Удалить из `ClientProfileCardInner` параметры и дефолты `publishedLfkTemplates = []`, `assignLfkEnabled = false`.
- В секции `doctor-client-section-lfk`: убрать только рендер `<AssignLfkTemplatePanel ... />`. Остальное — без изменений: список `lfkComplexes`, `recentLfkSessions`, `DoctorLfkComplexExerciseOverridesPanel`. Никаких подсказок не добавлять — текущий empty state «Нет комплексов ЛФК.» достаточен.

### 1.2 `[userId]/page.tsx`

- Убрать `deps.lfkTemplates.listTemplates({ status: "published" })` из `Promise.all`.
- Убрать пропсы `publishedLfkTemplates` и `assignLfkEnabled` из `<ClientProfileCard ...>`.
- `lfkExerciseLinesByComplexId` — **не трогать**, используется `DoctorLfkComplexExerciseOverridesPanel`.

### 1.3 `page.tsx` (список клиентов)

- Убрать `deps.lfkTemplates.listTemplates({ status: "published" })` из верхнеуровневого `Promise.all` (строка 69 в текущем файле) — это избавляет от лишнего запроса к БД при каждом рендере списка.
- Убрать передачу пропсов `publishedLfkTemplates` и `assignLfkEnabled` в `<ClientProfileCard>`.

### 1.4 `ClientProfileCard.backLink.test.tsx`

Убрать `publishedLfkTemplates` / `assignLfkEnabled` из mock-объекта, если есть:
```bash
rg "publishedLfkTemplates|assignLfkEnabled" apps/webapp/src/app/app/doctor/clients/ClientProfileCard.backLink.test.tsx
```

### Чеклист шага 1

```bash
rg "AssignLfkTemplatePanel" apps/webapp/src
rg "publishedLfkTemplates|assignLfkEnabled" apps/webapp/src/app/app/doctor/clients
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp lint
```

Ожидаемый результат: первые два — пусто; typecheck и lint — без ошибок.

> ✅ **Выполнено 2026-05-05.** Все четыре команды — зелёные.

---

## Шаг 2 — Удалить файлы `AssignLfkTemplatePanel.tsx` и `assignLfkTemplateAction.ts`

Только после зелёного шага 1.

Перед удалением — финальная проверка:
```bash
rg "assignLfkTemplateFromDoctor|assignLfkTemplateAction|AssignLfkTemplatePanel" apps/webapp/src
```

После удаления:
```bash
pnpm --dir apps/webapp exec tsc --noEmit
```

> `lfkAssignments` в `buildAppDeps` и `pgLfkAssignments.ts` не трогаем — используются в purge, merge, diaries.

> ✅ **Выполнено 2026-05-05.** Файлы удалены; внешних ссылок нет; `tsc --noEmit` — чисто.

---

## Шаг 3 — Модалка выбора шаблона программы в `PatientTreatmentProgramsPanel`

### Что изменится

Сейчас: `Select` + кнопка «Назначить программу» inline в основном потоке.  
После: одна кнопка **«Назначить программу лечения»** → открывает `Dialog`.

### Структура `Dialog`

```
Dialog
  DialogHeader
    DialogTitle: "Выберите шаблон программы лечения"

  DialogContent
    <input type="text" placeholder="Поиск по названию" />   ← всегда показывать
    <ul>                                                      ← прокручиваемый список
      <li role="radio" onClick={() => setSelected(t.id)}>    ← кликабельные строки
        {t.title}  [галочка если выбран]
      </li>
      ...
    </ul>
    {assignError ? <p role="alert">{assignError}</p> : null}  ← inline, не toast

  DialogFooter
    <Button variant="ghost" onClick={closeModal}>Отмена</Button>
    <Button disabled={!selected || assigning} onClick={assign}>
      {assigning ? "Назначение…" : "Назначить"}
    </Button>
```

### Правила реализации

- Фильтрация — на клиенте по `templates`, поле поиска — всегда видно.
- `POST` на `/api/doctor/clients/${patientUserId}/treatment-program-instances` — тот же эндпоинт, что сейчас. Не создавать дублирующую функцию.
- **Успех:** `toast.success("Программа лечения назначена")` + `setOpen(false)` + `setSelected("")` + `await load()`.
- **409 и любая ошибка:** показать `data.error` из ответа API **inline** в модалке (под списком, `role="alert"`). Не toast — врач должен прочитать и принять решение.
- **a11y:** `DialogContent` задать `className="max-h-[80vh] overflow-y-auto"`. Остальное — shadcn Dialog из коробки.
- Если разметка модалки > ~60 строк — вынести в `AssignTreatmentProgramTemplateModal.tsx` рядом.

### Добавить тест `PatientTreatmentProgramsPanel.test.tsx`

Три сценария:
1. Клик по CTA → модалка открывается.
2. Выбор шаблона → клик «Назначить» → `fetch` POST вызван с корректным `{ templateId }` → модалка закрывается, `toast.success` вызван (mock).
3. `fetch` возвращает `{ ok: false, error: "У пациента уже есть..." }` → текст ошибки в DOM, модалка не закрыта.

```bash
pnpm --dir apps/webapp test -- PatientTreatmentProgramsPanel
```

### Чеклист шага 3

- [x] Нет inline `Select` шаблона в основном потоке карточки.
- [x] `Dialog` открывается по кнопке.
- [x] Поиск по названию фильтрует список.
- [x] Успешное назначение: toast + обновление списка инстансов.
- [x] 409: текст ошибки inline в модалке, диалог остаётся открытым.
- [x] `pnpm --dir apps/webapp exec tsc --noEmit && pnpm --dir apps/webapp lint` — чисто.
- [x] `pnpm --dir apps/webapp test -- PatientTreatmentProgramsPanel` — зелёный.

> ✅ **Выполнено 2026-05-05.** 3 новых теста; 539 файлов / 2763 теста — зелёные; lint и typecheck — без ошибок.

---

## Шаг 4 — Ручной smoke

> ⏳ **Pending — требует живого стенда.** Автоматические проверки (typecheck, lint, тесты) пройдены. Smoke должна пройти команда перед merge/deploy.

- [ ] Карточка клиента с legacy ЛФК-комплексами: видно список + `DoctorLfkComplexExerciseOverridesPanel`, кнопки «Назначить комплекс ЛФК» **нет**.
- [ ] Карточка без ЛФК: секция ЛФК показывает «Нет комплексов ЛФК.», без лишних подсказок.
- [ ] «Программы лечения»: список инстансов загружается; CTA открывает модалку; поиск фильтрует; назначение создаёт instance и обновляет список.
- [ ] При повторном назначении активной программы: модалка остаётся открытой, показана ошибка-объяснение.
- [ ] Нет JS-ошибок в консоли на `/app/doctor/clients/[userId]` и в split-view.

---

## Шаг 5 — Документация

- [x] Запись в [`LOG.md`](LOG.md): что сделано, что не трогали, результаты проверок.
- [x] При закрытии вехи — строка в [`ROADMAP.md`](ROADMAP.md).

> ✅ **Выполнено 2026-05-05.**

---

## Definition of Done

1. ✅ В карточке клиента **нет** кнопки «Назначить комплекс ЛФК»; нет `AssignLfkTemplatePanel`.
2. ✅ Файлы `AssignLfkTemplatePanel.tsx` и `assignLfkTemplateAction.ts` удалены из репозитория.
3. ✅ Пропсы `publishedLfkTemplates` и `assignLfkEnabled` удалены из `ClientProfileCardProps` и всех мест вызова.
4. ✅ `DoctorLfkComplexExerciseOverridesPanel` остаётся и корректно рендерится.
5. ✅ `PatientTreatmentProgramsPanel` — единственный путь назначения; работает через **модалку** с поиском, inline-ошибкой и `toast.success`.
6. ✅ `pnpm --dir apps/webapp exec tsc --noEmit` и `lint` — без ошибок.
7. ✅ Тест `PatientTreatmentProgramsPanel.test.tsx` — зелёный (3 новых сценария).
8. ⏳ Ручной smoke — pending на живом стенде.
9. ✅ `LOG.md` обновлён.

---

## Что намеренно не делаем

- Не убираем `lfkAssignments` из `buildAppDeps` и `pgLfkAssignments.ts` — используется в purge/merge/diaries.
- Не трогаем API-эндпоинты LFK.
- Не меняем `DoctorLfkComplexExerciseOverridesPanel`.
- Не строим «полный каталог» шаблонов внутри модалки (фильтры по body region, master-detail) — для этого есть раздел «Шаблоны программ» в меню врача.
- Не переносим секцию «Программы лечения» выше по карточке (отдельное решение по IA).
- Не добавляем миграции и не меняем схему БД.
- Не добавляем ссылку «Открыть текущую программу» в 409-ошибке — за рамками scope первого прохода.

---

## Риски

| Риск | Митигация |
|------|-----------|
| `page.tsx` (список клиентов) загружает `publishedLfkTemplates` на верхнем уровне, независимо от `selected` | Явно указано в шаге 1.3; убрать именно строку 69 `deps.lfkTemplates.listTemplates(...)` из верхнего `Promise.all` |
| В тестах mock-объект `profile` содержит `lfkComplexes` | Поле остаётся в `ClientProfile` (нужно для `DoctorLfkComplexExerciseOverridesPanel`); удаляются только пропсы `publishedLfkTemplates` / `assignLfkEnabled` |
| Другой код импортирует `assignLfkTemplateAction` | `rg` перед удалением файлов (шаг 2) |
| `lfkExerciseLinesByComplexId` не передаётся в split-view `page.tsx` | Pre-existing gap; не вводим и не чиним в этом проходе |
| Длинные названия шаблонов в модалке на узком экране | `max-h-[80vh] overflow-y-auto` + `truncate` / `break-words` на строках списка по ситуации |

---

## Зависимости от других инициатив

- **`PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE`** — смежная; пациентский UI программ. Не блокирует и не блокируется.
- **`ASSIGNMENT_CATALOGS_REWORK_INITIATIVE`** (архив) — каталоги уже приведены в порядок; не затрагивается.
