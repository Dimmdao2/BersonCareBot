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

## 2026-05-05 — Аудит выполнения и закрытие документации

- Проведён полный аудит против `MASTER_PLAN.md` §Definition of Done и `DECOMPOSITION.md` этапы A–E.
- Все автоматически проверяемые пункты DoD (1–7, 9) **подтверждены** против кода и вывода тестов.
- **Единственный незакрытый пункт** — DoD №8 «ручной smoke» — требует живого стенда; в `MASTER_PLAN.md` шаг 4 помечен `⏳ pending`.
- Документация синхронизирована:
  - `MASTER_PLAN.md`: статус → ✅ выполнен, чеклисты шагов 1–3, 5 закрыты, DoD проставлены.
  - `DECOMPOSITION.md`: таблица этапов A–E обновлена статусами.
  - `ROADMAP.md`: заголовок и §6 Этап 2 отражают факт завершения.
- Оставшаяся работа по инициативе (этапы 3–6 из `ROADMAP.md`): правка инстанса из карточки, inbox «К проверке», каталоги — **отдельная задача**, не блокируется текущим состоянием.
