# AUDIT — Visual Final (Patient App Visual Redesign)

Дата: **2026-04-29**. Режим: **AUDIT** (финальный визуальный аудит инициативы).  
**Full root `pnpm run ci` в рамках этого аудита не запускался** (см. §6).

**Охват кода:** ревью соответствует **`README.md`**, **`MASTER_PLAN.md`**, **`05_TESTS_QA_CLEANUP_PLAN.md`**, полному **`VISUAL_SYSTEM_SPEC.md`**, записям **`LOG.md`** (Phase 0–5), а также **`AUDIT_PHASE_0.md` … `AUDIT_PHASE_4.md`**.  
**Важно:** в **`origin/main...HEAD`** на момент аудита вошли в основном **документы** (планы инициативы, `VISUAL_SYSTEM_SPEC.md`, см. коммит «планы»); **реализация webapp** (shell, nav, `PatientHome*`, тесты) находится в **рабочем дереве** ветки `patient-app-visual-redesign-initiative` и описана в `LOG.md` — ниже проверки относятся к этому фактическому diff + зафиксированным фазовым аудитам.

---

## 1. Verdict: **PASS WITH MINOR NOTES**

Инициатива в основной визуальной части **выполнена**: patient shell/nav, patient-scoped токены (`#app-shell-patient` в `globals.css`), общие примитивы (`patientHomeCardStyles.ts`, `patientVisual.ts`) и новые блоки главной `/app/patient` соответствуют направлению **`VISUAL_SYSTEM_SPEC.md`** и **`MASTER_PLAN.md`**. **Намеренного** редизайна doctor/admin и расширения **`button-variants.ts`** в visual-scope нет.

После независимого повторного аудита (2026-04-29) обязательные cleanup-пункты закрыты FIX-проходом: FAB убран из `AppShell`; `PatientBottomNav` переведён в `fixed bottom`; для поставки инициативы используется отдельный commit-пакет только по файлам visual redesign.

---

## 2. Mandatory fixes

**Закрыто в FIX-проходе 2026-04-29:**

1. **Устаревший FAB убран из shell runtime.**  
   `AppShell.tsx` больше не импортирует и не монтирует `PatientQuickAddFAB`.

2. **Bottom nav приведён к spec-поведению.**  
   `PatientBottomNav.tsx` переведён в app-like `fixed bottom` (`lg:hidden`) с patient nav shadow token.

3. **Поставка инициативы отделена от параллельной CMS-работы на уровне коммита.**  
   Для merge используется отдельный commit-пакет по файлам visual redesign (без включения несвязанных изменений других инициатив).

**Статус проверок после FIX (2026-04-29):** targeted Vitest (shell/nav + home-пакет) — **44 passed**; дополнительные `PatientHomePlanCard`, `PatientHomeCoursesRow`, `PatientHomeGreeting` — **10 passed**; `pnpm --dir apps/webapp lint` (по изменённым файлам) — **passed**; `pnpm --dir apps/webapp typecheck` — **passed**. Root **`pnpm run ci`** не запускался.

---

## 3. Minor notes

1. **`VISUAL_SYSTEM_SPEC.md` §4:** таблица «текущее состояние» может устаревать после merge — рекомендуется docs-follow-up (уже в Phase 0–2 аудитах).
2. **`PatientHomeDailyWarmupCard.test.tsx`:** в фикстуре href используется slug **`neck`** — это **тестовый** путь для стабильного assert, **не** импорт или runtime-маппинг из `CONTENT_PLAN.md`; продакшен строит пути из **`encodeURIComponent(slug)`** данных CMS.
3. **Константа `PATIENT_HOME_DAILY_PRACTICE_TARGET = 3`:** визуальный прогресс до отдельного patient-practice API (Phase 4 LOG).
4. **Дублирование** иконок reminders/messages/profile в `PatientHeader` и `PatientTopNav` — backlog (Phase 2 LOG); пользователь видит один набор на desktop, но код и счётчик reminders дублируются в двух компонентах.

---

## 4. Visual QA residual risks

Ручной прогон по **`05_TESTS_QA_CLEANUP_PLAN.md`** (ширины 320 / 360 / 390 / 768 / ~1024 / 1280, WebView, гость / частичный tier / полные данные / пустые блоки / mood с картинками и emoji) **остаётся на владельца продукта/дизайна**.

Риски до закрытия QA:

- **Контраст** pastel warning/danger (§12) без инструментальной проверки.
- **Tablet / граница `lg`:** переключение bottom ↔ top nav и выравнивание сетки.
- **Hero на узкой ширине:** перекрытие текста декором (частично смягчено `pr-[min(42%,140px)]` в Phase 3 аудите).
- **Скриншоты before/after** в `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/references/` — в LOG только плейсхолдеры.

---

## 5. Tests reviewed/run

| Источник | Содержание |
|----------|------------|
| **Ревью по spec §14 и `05`** | Покрытие: shell/header, bottom/top nav (**в т.ч. `aria-current`**, mutual exclusivity по классам), primary/secondary home-карточки, семантика без хрупких Tailwind-снапшотов на блоках (hero image/fallback, situations без slug-palette, subscription как link, mood disabled при pending POST и т.д.). |
| **`AUDIT_PHASE_1` … `AUDIT_PHASE_4`** | Все фазы: **mandatory fixes = нет**; замечания перенесены в §3–4 при необходимости. |
| **Прогон в рамках независимого повторного аудита** | `pnpm --dir apps/webapp exec vitest run` по пакету из **`LOG.md` Phase 5** (14 файлов: `PatientHome*` primary/secondary, `AppShell`, `PatientHeader`, `PatientBottomNav`, `PatientTopNav`) — **44 passed**, exit **0**. |
| **Дополнительные home tests** | `PatientHomePlanCard.test.tsx`, `PatientHomeCoursesRow.test.tsx`, `PatientHomeGreeting.test.tsx` — **10 passed**, exit **0**. |
| **`pnpm --dir apps/webapp typecheck`** | **passed** на повторной проверке 2026-04-29; старое замечание про `.next/types/validator.ts` на этом срезе больше не актуально. |
| **`pnpm --dir apps/webapp lint`** | **passed** (`eslint .` + `check-media-preview-invariants.sh`) на повторной проверке 2026-04-29. |
| **Root `pnpm run ci`** | **Не выполнялся** (не требовался для этого аудита). |

Примечание: полный root **`pnpm run ci`** по правилам проекта остаётся pre-push барьером, а не обязательным шагом каждого визуального аудита.

---

## 6. Explicit confirmations

| Утверждение | Подтверждение |
|-------------|----------------|
| **Нет runtime slug hardcode из `CONTENT_PLAN.md`** | В рабочем дереве patient home **нет** импорта/ссылки на `CONTENT_PLAN`; нет ветвлений стиля по slug из плана; slug в тестах — **фикстуры URL**. |
| **Нет намеренного doctor/admin redesign** | `AppShell` для `variant === "doctor"` сохраняет узкий контейнер **`DOCTOR_PAGE_CONTAINER_CLASS`**; изменения сосредоточены на **`variant === "patient"`**. **`button-variants.ts`** в scope инициативы **не** менялся (LOG Phase 1 / grep по home-компонентам — опора на `patientVisual`, не рефактор `buttonVariants` doctor/admin). |
| **Не добавлено subscription gating** | `PatientHomeSubscriptionCarousel`: визуальные ссылки/бейджи без enroll API (Phase 4 аудит + тест «только Link»). |
| **Не добавлены env vars для интеграций/визуала** | Grep по `shared/ui` patient-файлам: **нет** новых `process.env` / `NEXT_PUBLIC_` в рамках проверенных путей; токены в **CSS** и существующие bootstrap-env не расширялись под эту задачу. |
| **FAB не возвращён в runtime** | После FIX `AppShell` больше не монтирует `PatientQuickAddFAB`; запрет из `MASTER_PLAN.md §3` / `VISUAL_SYSTEM_SPEC.md §1.2` соблюдён. |
| **Scope поставки отделяется commit-пакетом** | В рабочем дереве есть параллельные изменения других инициатив, но финальный commit по visual redesign формируется отдельно и не включает несвязанные файлы. |
| **Full CI не гонялся без причины** | Root **`pnpm run ci`** в этом аудите **не** запускался; targeted Vitest — да; соответствует **`README.md` §Проверки** и **`MASTER_PLAN.md` §10**. |

---

*Архивные PROMPT'ы `PATIENT_HOME_REDESIGN_INITIATIVE` и планы `.cursor/plans/phase_3_patient_home_*` / `phase_4.5_patient_home_*` не исполнялись.*
