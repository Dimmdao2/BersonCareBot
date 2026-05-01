# AUDIT — Phase 4 (Patient App Visual Redesign — Home Secondary)

Дата: **2026-04-29**. Режим: **AUDIT** (сверка с `04_HOME_SECONDARY_PLAN.md`, `VISUAL_SYSTEM_SPEC.md` §§10.5–10.10, 11, 12, 14 и `LOG.md`; ревью кода; **full CI не запускался**).

Источники ревью кода: `PatientHomeProgressBlock.tsx`, `PatientHomeNextReminderCard.tsx`, `PatientHomeMoodCheckin.tsx`, `PatientHomeSosCard.tsx`, `PatientHomePlanCard.tsx`, `PatientHomeSubscriptionCarousel.tsx`, `PatientHomeCoursesRow.tsx`, `patientVisual.ts` (расширение Phase 1), `page.tsx` (секция `#patient-home-secondary`), соответствующие `*.test.tsx` (+ по `LOG.md` — `PatientHomePlanCard.test.tsx`, `PatientHomeCoursesRow.test.tsx`, регрессия Phase 3 home).

---

## 1. Verdict: **PASS WITH MINOR NOTES**

Результат Phase 4 **в целом соответствует** `04_HOME_SECONDARY_PLAN.md` и целевым §§**10.5–10.10**, **11**, **12**, **14** `VISUAL_SYSTEM_SPEC.md`: secondary-блоки собраны на `patientHomeCardStyles` / `patientVisual`, SOS — фиксированный layout (красный круг + текст + danger-кнопка), декоративный `imageUrl`, mood — POST `/api/patient/mood` с optimistic rollback, карусель подписок без gating, план без лишнего запроса деталей экземпляра, **нет** правок `modules/patient-practice/*`, `modules/patient-mood/*`, reminders repos/services, migrations, API routes.

**Minor notes** (не блокируют при зафиксированных в `LOG.md` компромиссах): дополнительная нагрузка и состав данных на `/app/patient` при `showPrimaryToday` (новая склейка в `page.tsx` вне списка allowed в `04`); константа **`PATIENT_HOME_DAILY_PRACTICE_TARGET = 3`** до отдельного API; **`contentPages.getBySlug`** для картинки SOS — по сути запрос ради визуала; карточка напоминания показывает **первое** включённое personal-правило по сортировке `updatedAt`, не обязательно «следующее по времени срабатывание»; leading icon плана через `patientIconLeadingClass` (**~44px** mobile vs **48px** в §10.9); `pnpm --dir apps/webapp test` в репозитории может тянуть широкий Vitest-прогон — для узкой проверки предпочтительнее `pnpm exec vitest run <paths>` (зафиксировано в `LOG.md`).

---

## 2. Mandatory fixes

**Нет.**

---

## 3. Проверка запроса аудита (чеклист)

| Проверка | Результат |
|-----------|-----------|
| **Secondary blocks use shared patient primitives** | Используются `patientHomeCardClass` / `Compact` / `Warning` / `Danger` / `GradientWarm`, `patientIconLeadingClass` / `patientIconLeadingWarningClass`, `patientBadgePrimaryClass`, `patientButtonDangerOutlineClass`, `patientButtonWarningOutlineClass`, `patientButtonGhostLinkClass`, токены `--patient-color-primary`, `--patient-text-*`, `--patient-border` и др. Локальные утилиты `cn`, `lucide-react` — по spec §9.4. |
| **No business behavior changed** (строго: код сервисов/repos/API) | Репозитории и API-роуты **не** менялись (`LOG.md`). **Поведение страницы** `/app/patient` расширено: при `cabinet \| materials` загружаются и показываются secondary-блоки (раньше блоков не было) — это **новая продуктовая поверхность**, не смена контрактов существующих сервисов. |
| **No new data queries solely for visuals** | Запросы LFK/reminders/programs/courses/emergency **обеспечивают** прогресс, streak, план, курсы, текст SOS — не «только краска». **Исключение:** `deps.contentPages.getBySlug(sosTopic.id)` для `imageUrl` на SOS — **декоративный** optional; доустранимо передачей `imageUrl` снаружи без лишнего round-trip. |
| **Mood save behavior preserved** | `PatientHomeMoodCheckin`: POST JSON `{ moodIndex }` на `/api/patient/mood` по умолчанию, `aria-pressed`, `aria-label` на слотах, optimistic `setSelected` + откат при `!res.ok` или сетевой ошибке; `disabled` при госте / без `personalDataOk`. |
| **Subscription badge remains visual only** | `PatientHomeSubscriptionCarousel`: `badgeLabel` — span внутри `Link` на `routePaths.notifications` + hash; нет вызовов enroll/toggle API с карточки. |
| **SOS bot scenarios untouched** | Нет изменений integrator/webhook/бот-сценариев; SOS — только UI главной: `href` на `/app/patient/content/[slug]` первого emergency-топика или fallback `routePaths.emergency`. |
| **Tests updated appropriately** | Есть тесты для Progress, NextReminder (+ `formatReminderScheduleLabel`), Mood, SOS, Subscription, Plan, Courses (`LOG.md`). §14.1: submitting-state mood — покрытие частичное (есть `disabled` и fail POST). |

---

## 4. Соответствие `VISUAL_SYSTEM_SPEC.md` §10.5–10.10 (кратко)

| § | Статус |
|---|--------|
| **10.5** | Две зоны, `Flame`, primary fill/value, `role="progressbar"`, stack `flex-col` → `sm:flex-row`, min-height карточки, skeleton при `loading`. Полоса `h-2` (~8px), трек `#e5e7eb`. |
| **10.6** | Warning surface + bell в `patientIconLeadingWarningClass`, CTA `patientButtonWarningOutlineClass`, маршрут напоминаний сохранён через проп `remindersHref` (`patientReminders`). |
| **10.7** | Градиентная карточка, 5 колонок `grid-cols-5`, `min-h-[48px]` на кнопке, active ring/bg, emoji fallback; `imageUrl` фона опционален. CMS `patient_home_mood_icons` в дереве **не** подключены — как в `LOG.md` «отложено». |
| **10.8** | Danger card, круг `48px` (`size-12`), `AlertTriangle` белый на `#ef4444`, кнопка danger-outline; картинка только угол **56px**. |
| **10.9** | Base card, `ClipboardList` leading, «Мой план», ссылка `routePaths.patientTreatmentProgram`; процент/progress bar не показывается без `progressPercent` — на главной `null`. Leading box через `patientIconLeadingClass` (чуть меньше 48px на mobile) — minor. |
| **10.10** | Горизонтальный scroll + `snap-x` / `snap-start`, compact card + badge; courses — vertical list compact cards. |

---

## 5. §11 / §12 / §14

- **§11 Guest/empty:** гость — progress без чисел; mood с `disabled` и подписью; подписки/курсы/SOS без персональных данных; план только при активной программе и персональном доступе.
- **§12 a11y:** mood — `aria-pressed`, подписи слотов; progressbar — `aria-valuenow/min/max`; focus-visible на кнопках; tap ≥44px на mood. WCAG pastel пар — на visual QA.
- **§14:** семантические тесты без layout-snapshot; узкий набор файлов из `04` + доп. тесты Plan/Courses; полный CI по политике аудита **не** гонялся.

---

## 6. Соответствие `04_HOME_SECONDARY_PLAN.md` (scope)

| Пункт | Статус |
|-------|--------|
| Allowed files в `04` | Реализованы перечисленные компоненты + `patientVisual`. **`page.tsx`** изменён для склейки — **вне** списка allowed в `04`, задокументировано в `LOG.md` (аналог Phase 3). |
| Do not edit (services, API, migrations) | Соблюдено. |
| Checklist §Implementation | Выполнено по смыслу; отклонения — см. §1 minor notes. |

---

## 7. Tests / CI

| Проверка | Статус |
|-----------|--------|
| Targeted Vitest (перечень в `LOG.md` / `04`) | По `LOG.md` — targeted прогоны **passed** при EXEC; в этом аудите **повторный прогон не выполнялся**. |
| **Root `pnpm run ci`** | **Не запускался** по запросу аудита. |

---

## 8. Readiness for Phase 5+

**Да**, при принятии backlog из `LOG.md` (practice API, mood icons из настроек, при необходимости убрать/обернуть `getBySlug` только для SOS-декора, уточнить семантику «следующего» напоминания, visual QA 320–390px).

---

## 9. Продуктовое замечание

Появление secondary-секции **только** при `cabinet \| materials` согласовано с текущей склейкой `showPrimaryToday`; мини-приложение бота по-прежнему отдельная ветка (`PatientMiniAppPatientHome`) без этих блоков — осознанное разделение платформ.
