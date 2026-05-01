# AUDIT — Phase 1 (Patient App Visual Redesign — Foundation)

Дата: **2026-04-29**. Режим: **AUDIT** (только документы и ревью кода/diff; **full CI не запускался**).

Источники: `01_FOUNDATION_PLAN.md`, `VISUAL_SYSTEM_SPEC.md` §§7, 9, 12, 14, `LOG.md` (запись Phase 1 / EXEC), фактическое состояние файлов `globals.css`, `AppShell.tsx`, `AppShell.test.tsx`, `patientHomeCardStyles.ts`, `patientVisual.ts`.

---

## 1. Verdict: **PASS WITH MINOR NOTES**

Результат Phase 1 соответствует **`01_FOUNDATION_PLAN.md`**: токены patient-scoped, legacy `:root` patient-переменные сохранены, patient shell получил фон страницы через `--patient-page-bg`, `max-w-[480px]` не менялся, общие helpers добавлены без правок home/nav/header/`button-variants`. Существенных нарушений scope или регрессий doctor/admin по намерению нет.

Замечания касаются **деталей spec §9** (padding/compact), **стиля тестов** (assert по substring класса) и **неиспользованных helpers** до следующих фаз — не блокируют переход к Phase 2.

---

## 2. Mandatory fixes

**Нет.** Перед стартом Phase 2 ничего из Phase 1 diff не обязано откатываться или дорабатывать как блокирующее.

---

## 3. Minor notes

1. **`VISUAL_SYSTEM_SPEC.md` §7.3** предлагает дополнительную шкалу имён (`--patient-radius-sm` …); в репозитории используются имена из **MASTER_PLAN §6** (`--patient-card-radius-mobile` и т.д.) — это **намеренное** следование инициативе, не ошибка; при желании позже добавить алиасы в spec или в CSS.

2. **`VISUAL_SYSTEM_SPEC.md` §9.2** для **compact** карточки: padding `12–18px`, min-height `72–104px`, radius `16–20px`. Текущий `patientHomeCardCompactClass` в основном дублирует радиусы base и не задаёт `min-height` — лёгкое расхождение с текстом spec до Phase 3, когда компоненты начнут использовать класс.

3. **Base card desktop**: в spec указан padding `20–24px` на desktop; сейчас везде `p-4` (16px) без `lg:p-5` — допустимое упрощение Phase 1; уточнить при подключении к блокам.

4. **`AppShell.test.tsx`**: проверки завязаны на подстроку `className` (`bg-[var(--patient-page-bg)]`). **§14** рекомендует избегать хрупких тестов на классы для home-блоков; для smoke shell на Phase 1 приемлемо, в Phase 2 при росте тестов можно смягчить (например, data-attribute или отдельный тестовый id).

5. **`patientHomeCardStyles.ts` / `patientVisual.ts`**: пока **нигде не импортируются** (grep по webapp) — ожидаемо до Phase 3; не мёртвый код в смысле нарушения плана, а заранее подготовленные примитивы.

6. **§12 Accessibility**: классы кнопок в `patientVisual` задают `min-h-[var(--patient-touch)]` / `min-h-10` / `min-h-11` — в целом в духе ≥44px; окончательная WCAG-проверка контраста pastel (§12) остаётся на визуальный QA / Phase 5.

7. **`pnpm --dir apps/webapp typecheck`**: по `LOG.md` падает из-за **`.next/types/validator.ts`** (несуществующие маршруты) — не вводится Phase 1 diff; для gate перед push всё равно нужен зелёный CI/чистый `.next` на стороне команды.

---

## 4. Tests reviewed / run

| Проверка | Статус |
|-----------|--------|
| **`npx vitest run src/shared/ui/AppShell.test.tsx`** (по `LOG.md`) | Задокументировано как **3 passed** при EXEC. |
| **ESLint** на затронутых ts/tsx | По `LOG.md` — ok. |
| **Полный `pnpm run ci` / root CI** | Не запускался (по политике инициативы и запросу аудита). |
| **`pnpm --dir apps/webapp typecheck`** | По `LOG.md` — падает на существующих ошибках `.next/types`; к Phase 1 не относится. |

Ревью содержимого тестов: покрыты **patient** (фон + сохранение `max-w-[480px]`), **default** и **doctor** без `patient-page-bg` — соответствует чеклисту `01_FOUNDATION_PLAN.md` (smoke для не-patient вариантов).

Из **VISUAL_SYSTEM_SPEC §14.1** для Phase 1 не требовались: тесты bottom nav, top nav, расширение `AppShell` под `patientHideBottomNav` — это **Phase 2+**.

---

## 5. Explicit scope-leak check

| Риск утечки | Результат |
|-------------|-----------|
| Редизайн отдельных **`PatientHome*`** блоков | **Нет** — импортов `patientHomeCardStyles` / `patientVisual` в компонентах home не найдено; файлы только добавлены. |
| **`PatientHeader` / `PatientGatedHeader` / `navigation.ts`** | **Нет** изменений (по diff и grep). |
| **`PatientBottomNav`** | Компонента нет; изменений нет. |
| **`AppShell` `max-width` / nav / embed флаги** | **Нет** изменений max-width (`max-w-[480px]` сохранён); логика `patientEmbedMain` / `safe-padding-patient` сохранена. |
| **DB / routes / services** | **Нет** затронутых файлов. |
| **Намеренный doctor/admin UI** | **`button-variants.ts` не менялся**; ветка `variant="doctor"` `AppShell` по-прежнему только `DOCTOR_PAGE_CONTAINER_CLASS`; `default` — прежняя разметка. |
| **Slug / CONTENT_PLAN** | В Phase 1 diff **нет** хардкода slug или контент-плана. |

**Итог:** утечки scope Phase 1 в запрещённые зоны **не обнаружены**.

---

## 6. Readiness for Phase 2

**Да, можно переходить к Phase 2 (Navigation)** по зависимости MASTER_PLAN: Phase 1 завершён с точки зрения foundation (токены, фон shell, примитивы-файлы, smoke-тест shell).

Рекомендации на входе Phase 2 (не блокеры):

- Подключить **`PatientBottomNav` / `PatientTopNav`**, правки **`navigation.ts`**, **`PatientHeader`**, **`AppShell`** (max-width **430** + desktop wide), тесты взаимоисключения nav — по `02_NAVIGATION_PLAN.md`.
- Расширить **`AppShell.test.tsx`** согласно **VISUAL_SYSTEM_SPEC §14.1**, когда появятся bottom/top nav и флаги embed/hide bottom nav.
- Учитывать **`PLAN_INVENTORY.md`**: полный стек главной «Сегодня» может всё ещё отсутствовать — Phase 3 остаётся зависимой от merge/поставки кода, не от Phase 2.

---

*Архивные PROMPT'ы закрытой patient-home инициативы не исполнялись.*
