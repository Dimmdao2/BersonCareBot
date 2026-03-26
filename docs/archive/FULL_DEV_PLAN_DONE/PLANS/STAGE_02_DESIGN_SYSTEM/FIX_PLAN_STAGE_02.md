# FIX_PLAN — этап 2 (дизайн-система)

## 1. Статус этапа

**Выполнен в большей части:** Tailwind/shadcn, `PatientHeader` с `pageTitle`, Sheet-меню, `DoctorHeader` в `apps/webapp/src/app/app/doctor/layout.tsx`, `DoctorNavigation` в `src` отсутствует, `public/icons/README.md` есть, `react-hot-toast` используется (например в `PatientHeader`). Остаётся техдолг по **смешению legacy-классов** (`.button`, `.panel`, `.auth-input`) и **жёстко заданным цветам** в layout врача.

---

## 2. Найденные проблемы

### Критичные

Нет.

### Средние

| Файл / модуль | Суть | Шаг плана | Тип |
|---------------|------|-----------|-----|
| `apps/webapp/src/app/app/doctor/layout.tsx` | Фон `bg-[#f5f7fb]` — хардкод вне токенов темы; план **2.2** и общие правила — `hsl(var(--...))` / семантические классы. | 2.2 / 2.7 | стили / фронт |
| `apps/webapp/src/app/app/doctor/page.tsx` | Блок «Быстрые действия» использует классы **`button`**, **`panel`**, **`feature-grid`** из legacy-слоя вместо `Button`/`Card` из `@/components/ui`. | 2.2 / 2.6 | фронт / стили |
| `apps/webapp/src/app/app/doctor/clients/DoctorClientsPanel.tsx` | Поле поиска с классом **`auth-input`** — не shadcn `Input`, обход стороной типизированных примитивов. | 2.2 / 2.6 | фронт / стили |
| `apps/webapp/src/app/app/doctor/clients/page.tsx` | Разметка **`master-detail`**, **`panel`**, **`stack`** — наследие глобального CSS; при миграции этапа 2 на «чистый» Tailwind чеклист в `PLAN.md` всё ещё может быть частично открыт. | 2.5–2.7 | фронт / стили |

### Мелкие

| Файл / модуль | Суть | Шаг плана | Тип |
|---------------|------|-----------|-----|
| `apps/webapp/src/app/globals.css` | Большой legacy-блок (`.button`, `.panel`, …) сосуществует с Tailwind — ожидаемый долг до полного переноса экранов. | 2.1–2.2 | стили |
| `apps/webapp/src/app/app/doctor/layout.tsx` | Комментарий `TODO(STAGE_02): sidebar placeholder` — опциональный подпункт **2.7** не закрыт (не обязательно баг). | 2.7 | мёртвый код / документация в коде |

---

## 3. Пропущенные шаги

- Полное закрытие чеклиста «Общий критерий завершения этапа 2» в `PLAN.md` (все пункты с `[ ]`) — **не подтверждено** без ручной сверки; по коду видны остаточные legacy-классы на новых экранах (дашборд этапа 9, панели клиентов).

---

## 4. Лишние изменения

Не анализировались (этап 2 не изолирован в diff).

---

## 5. План исправлений

1. **`doctor/layout.tsx`**: заменить `bg-[#f5f7fb]` на класс из темы (`bg-background` / `bg-muted` / кастомный CSS variable в `:root`), согласовать с `globals.css`.
2. **`doctor/page.tsx`**: переписать блок быстрых действий на `Button` + `Card` (или сетка `Link` с `buttonVariants`); убрать зависимость от `.button` / `.panel` для этого экрана.
3. **`DoctorClientsPanel.tsx`**: заменить `auth-input` на `Input` из `@/components/ui/input` с теми же `id`/a11y для e2e.
4. **`clients/page.tsx`**: постепенно заменять `panel`/`stack`/`master-detail` на утилиты Tailwind (`flex`, `gap`, `grid`, `border`) или shared-обёртки из `shared/ui`, не дублируя разметку; обновить e2e-селекторы при смене классов.
5. **`globals.css`**: после переноса каждого экрана — удалять неиспользуемые правила (как позволяет план этапа 1/2).
6. `pnpm run ci` после правок.

---

*Аудит: `PLAN.md` этапа 2, файлы `layout.tsx`, `doctor/page.tsx`, `DoctorClientsPanel.tsx`, `globals.css`.*
