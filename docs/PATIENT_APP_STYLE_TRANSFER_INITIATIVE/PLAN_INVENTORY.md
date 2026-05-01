# PLAN_INVENTORY — Patient App Style Transfer (Phase 0)

Дата: **2026-05-01**. Режим: **readonly inventory** по текущему дереву `apps/webapp`; app-код не менялся при составлении (фиксация — docs-only FIX Phase 0).

## 0. Документы, ветка, рабочее дерево

- Прочитаны: `README.md`, `MASTER_PLAN.md`, `CHECKLISTS.md`, `00_INVENTORY_PLAN.md`, `01_PRIMITIVES_PLAN.md`, `AUDIT_PHASE_0.md`.
- **Текущая git-ветка (на момент инвентаризации):** `feat/patient-home-cms-editor-uxlift-2026-04-29`.
- **Рабочая ветка инициативы (для EXEC Phase 1+):** по `README.md` ожидается `patient-app-style-transfer-initiative` — переключение на неё — ответственность EXEC-агента, не часть этого файла.
- Не путать с **`docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/PLAN_INVENTORY.md`** — другая инициатива и другой смысл baseline.

## 1. Маршруты (`page.tsx`) под `apps/webapp/src/app/app/patient/**`

Ниже **34** entry-роута (факт дерева). Группировка по фазам style-transfer (`MASTER_PLAN.md` + `CHECKLISTS.md` §4). Роуты вне чеклиста помечены «extra» — их тоже нужно учитывать при полном переносе chrome.

### Phase 2 — static / read-only

| Маршрут (от `/app/patient`) | Файл |
|----------------------------|------|
| `/sections` | `sections/page.tsx` |
| `/sections/[slug]` | `sections/[slug]/page.tsx` |
| `/content/[slug]` | `content/[slug]/page.tsx` |
| `/courses` | `courses/page.tsx` |
| `/treatment-programs` | `treatment-programs/page.tsx` |
| `/treatment-programs/[instanceId]` | `treatment-programs/[instanceId]/page.tsx` |

### Phase 3 — interactive

| Маршрут | Файл |
|---------|------|
| `/profile` | `profile/page.tsx` |
| `/notifications` | `notifications/page.tsx` |
| `/reminders` | `reminders/page.tsx` |
| `/reminders/journal/[ruleId]` | `reminders/journal/[ruleId]/page.tsx` |
| `/diary` | `diary/page.tsx` |
| `/diary/symptoms` | `diary/symptoms/page.tsx` |
| `/diary/symptoms/journal` | `diary/symptoms/journal/page.tsx` |
| `/diary/lfk` | `diary/lfk/page.tsx` |
| `/diary/lfk/journal` | `diary/lfk/journal/page.tsx` |
| `/support` | `support/page.tsx` |
| `/help` | `help/page.tsx` |
| `/purchases` | `purchases/page.tsx` |
| `/bind-phone` | `bind-phone/page.tsx` |

### Phase 4 — booking / cabinet

| Маршрут | Файл |
|---------|------|
| `/booking` | `booking/page.tsx` |
| `/booking/new` | `booking/new/page.tsx` |
| `/booking/new/city` | `booking/new/city/page.tsx` |
| `/booking/new/service` | `booking/new/service/page.tsx` |
| `/booking/new/slot` | `booking/new/slot/page.tsx` |
| `/booking/new/confirm` | `booking/new/confirm/page.tsx` |
| `/cabinet` | `cabinet/page.tsx` |

### Главная и прочие patient pages (в CHECKLISTS как «home» / не сведены в §4)

| Маршрут | Файл | Примечание |
|---------|------|------------|
| `/` (home) | `page.tsx` | Источник эталонного chrome; часть блоков в `home/*.tsx`. |
| `/messages` | `messages/page.tsx` | extra |
| `/emergency` | `emergency/page.tsx` | extra |
| `/lessons` | `lessons/page.tsx` | extra |
| `/install` | `install/page.tsx` | extra |
| `/address` | `address/page.tsx` | extra |
| `/intake/nutrition` | `intake/nutrition/page.tsx` | extra |
| `/intake/lfk` | `intake/lfk/page.tsx` | extra |

## 2. Style debt (наблюдаемые паттерны)

Подсчёты и примеры — **grep по `apps/webapp/src/app/app/patient/**/*.tsx`** (и `.ts`). Цель Phase 1+: заменить на patient-scoped примитивы без смены смысла разметки.

### 2.1. Поверхности: `bg-card`, `border-border`, `rounded-xl` / `rounded-2xl`, `shadow-sm`

- **`bg-card`:** **23 файла** затрагивают этот класс (включая коллокации с `border`, `rounded-*`, `shadow-sm`).
- Типичный повторяющийся кусок:  
  `rounded-2xl border border-border bg-card p-4 shadow-sm` (секции diary, notifications, help, support, purchases и т.д.).
- **Generic shadcn `Card`:** используется с классами `bg-card` / `rounded-xl` например в `diary/lfk/LfkComplexCard.tsx`, `cabinet/CabinetActiveBookings.tsx`, `reminders/ReminderRulesClient.tsx` — style debt (обёртка + токены), не требование менять структуру карточек.

### 2.2. Типографика: `text-muted-foreground`

- Широко распространён (подписи, empty states, лейблы). Для style-transfer целесообразны patient-muted текстовые примитивы (**не** менять строки UI).

### 2.3. Кнопки: `Button`, `buttonVariants` из `@/components/ui/button`

- Много импортов `@/components/ui/button`, `@/components/ui/button-variants` в patient (profile, diary, booking, cabinet, bind-phone, reminders — см. grep в дереве).
- В **`patientVisual.ts`** уже есть patient-кнопки (`patientButtonPrimaryClass`, …) — Phase 1 расширяет слой примитивов, чтобы страничные фазы не тянули классы с главной.

### 2.4. `Badge` из `@/components/ui/badge`

- Booking wizard (шаги «Шаг N»), cabinet, diary journal, reminders — семантика шагов/статусов **продуктова**; визуально — заменить на patient pill/badge классы **без** изменения текста шагов.

### 2.5. Формы: `border-input`, `bg-background`, `focus-visible:ring-ring`

- Встречаются в diary/intake/support — выравнивание под patient form surface (**без** изменения полей и валидации).

## 3. Что уже есть (опора Phase 1)

| Артефакт | Путь |
|----------|------|
| Patient shell | `apps/webapp/src/shared/ui/AppShell.tsx` (`id="app-shell-patient"`) |
| Top nav | `apps/webapp/src/shared/ui/PatientTopNav.tsx` |
| Кнопки / clamp | `apps/webapp/src/shared/ui/patientVisual.ts` |
| Карточки главной (эталон + **осторожно**) | `apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts` |

## 4. Style debt vs product / content debt

| Категория | Примеры в коде | Действие в рамках инициативы |
|-----------|----------------|------------------------------|
| **Style debt** | `bg-card` + generic `Card`/`Button`/`Badge`; `text-muted-foreground`; повторяющиеся секционные оболочки | Замена на patient primitives / классы, сохранение DOM и copy. |
| **Product / content debt** | Тексты empty states, порядок блоков, сценарии booking/LFK/программ, данные на странице | Только зафиксировать в `LOG.md` при аудите; **не** «улучшать» агентом. |
| **Граница** | Смена класса muted-текста при **том же** тексте — style; смена формулировок empty state — product. | |

## 5. Home-specific: не экспортировать как «общий» chrome

Файл **`patientHomeCardStyles.ts`** содержит:

- Семантические варианты главной: **Hero**, **GradientWarm**, **Mood checkin shell** (`patientHomeMoodCheckinShellClass` с `max-lg:` сбросами), **hero radius** (`--patient-hero-radius-*`).
- Бейджи с метриками hero/useful post.

**Правило:** не переносить hero-специфичные и mood-shell паттерны на остальные страницы. В Phase 1 извлекать только **обобщаемые** атомы (базовая карточка/компакт/list row/section surface/hints из `MASTER_PLAN.md` §5), совместимые с `VISUAL_SYSTEM_SPEC` и токенами `#app-shell-patient`.

## 6. Компоненты, пересекающиеся с не-patient UI

- Импорты из `@/components/ui/*` — общие shadcn; глобально их менять **нельзя** (`01_PRIMITIVES_PLAN.md`). Меняются только patient-страницы / patient-классы.
- **`apps/webapp/src/app/app/settings/patient-home/**`** — админка настроек главной; вне scope patient style-transfer для страниц пациента (не трогать визуально в этой инициативе).

## 7. Тесты (ориентир по областям)

Примеры тестов рядом с целевыми фичами (не исчерпывающий список):

- Home: `home/PatientHomeToday.test.tsx`, `PatientHomeTodayLayout.test.tsx`, др.
- Top nav: `shared/ui/PatientTopNav.test.tsx`
- Sections: `sections/[slug]/page.subscription.test.tsx`
- Patient header: `shared/ui/PatientHeader.test.tsx`

**Правило:** обновлять тесты только если меняются селекторы/разметка при style pass (`CHECKLISTS.md` §7).

## 8. Область файлов по фазам (кратко)

| Фаза | Охват |
|------|--------|
| **1** | Только shared primitives (`01_PRIMITIVES_PLAN.md` — см. §9). |
| **2** | Статические/каталожные страницы + колонка Phase 2 в §1. |
| **3** | Profile, notifications, reminders, diary, support, help, purchases, bind-phone + клиенты рядом. |
| **4** | `booking/new/*`, `cabinet/*`, связанные компоненты записи. |
| **5** | QA, маршрутная матрица, документация, global audit prep. |

## 9. Команды проверок по фазам (без избыточного root CI)

Согласовано с `MASTER_PLAN.md` §8 и `01_PRIMITIVES_PLAN.md`:

- **Phase 1 (после изменений TS):**  
  `pnpm --dir apps/webapp typecheck`  
  `pnpm --dir apps/webapp exec eslint src/shared/ui/patientVisual.ts` (добавить путь к `patientPrimitives.ts`, если появится).
- **Фазы 2–4:** при существенном style pass — `pnpm --dir apps/webapp lint`; точечные `vitest run` по затронутым тестам.
- **Root `pnpm run ci`:** только pre-push / явный запрос — **не** после каждого шага.

## 10. Отложенные продуктовые вопросы (не решать в style-transfer)

- Унификация **wording** empty states между разделами.
- Любые изменения **шагов** booking или статусной модели приёмов.
- Добавление/удаление блоков на страницах, смена IA или маршрутов.

## 11. Phase 1 — GO / NO-GO и точный список файлов

### Вердикт: **GO**

Обоснование: инвентарь стилевого долга и маршрутов зафиксирован; границы style vs product разделены; эталонные пути (`patientVisual.ts`, `patientHomeCardStyles.ts`, shell) существуют в дереве; следующий шаг — EXEC Phase 1 строго по `01_PRIMITIVES_PLAN.md` (без restyling страниц).

### Точный список файлов, которые Phase 1 **разрешено** менять

Из **`01_PRIMITIVES_PLAN.md`** (Allowed files):

1. `apps/webapp/src/shared/ui/patientVisual.ts`
2. `apps/webapp/src/shared/ui/patientPrimitives.ts` — **только если** вынос размера/читаемости из `patientVisual.ts` (опционально).
3. Тесты — **только если** добавлены новые компоненты, требующие тестов (при одних только class-константах обычно не требуются).
4. `docs/PATIENT_APP_STYLE_TRANSFER_INITIATIVE/LOG.md` — после каждого EXEC/FIX.

**Не входят в Phase 1:** любые `apps/webapp/src/app/app/patient/**/page.tsx` и страничные клиенты — restyling страниц начинается с **Phase 2** после аудита Phase 1.
