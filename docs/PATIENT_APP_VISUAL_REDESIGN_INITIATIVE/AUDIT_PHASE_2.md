# AUDIT — Phase 2 (Patient App Visual Redesign — Navigation)

Дата: **2026-04-29**. Режим: **AUDIT** (сверка с планом, spec и кодом; **full CI не запускался**).

Источники: `02_NAVIGATION_PLAN.md`, `VISUAL_SYSTEM_SPEC.md` §§5, 12, 14, `LOG.md` (запись Phase 2 / EXEC), фактическое состояние `AppShell.tsx`, `PatientHeader.tsx`, `PatientGatedHeader.tsx`, `PatientBottomNav.tsx`, `PatientTopNav.tsx`, `navigation.ts`, соответствующие `*.test.tsx` / `navigation.test.ts`.

---

## 1. Verdict: **PASS WITH MINOR NOTES**

Результат Phase 2 **соответствует acceptance** `02_NAVIGATION_PLAN.md` и целевой модели **VISUAL_SYSTEM_SPEC §5** (breakpoint `lg`, взаимоисключение bottom/top nav, бренд на desktop, отсутствие desktop Back и top Home, отсутствие settings gear в patient header, «Дневник» в bottom nav без «Профиль», профиль справа, общая логика активного пункта, маршруты через `routePaths` / `PATIENT_PRIMARY_NAV_ITEMS`).

**Minor notes** касаются в основном **буквального текста §5.1** (fixed bottom, литералы цветов/типографики), **пробелов в тестах** (нет явной проверки `aria-current`, нет кейсов `patientHideBottomNav` / `patientEmbedMain` в `AppShell.test`) и **дублирования разметки** reminders/messages/profile между `PatientHeader` и `PatientTopNav` (уже зафиксировано в `LOG.md` как backlog). Это **не блокирует** переход к Phase 3.

---

## 2. Mandatory fixes

**Нет.** Перед стартом Phase 3 ничего из Phase 2 не обязано исправляться как блокирующее для соответствия плану навигации и acceptance criteria Phase 2.

---

## 3. Проверка требований (чеклист аудита)

| Требование | Результат |
|-------------|-----------|
| Bottom nav только **&lt; lg** | `PatientBottomNav`: класс **`lg:hidden`** (скрыт с `1024px`). |
| Desktop top nav только **lg+** | Обёртка в `AppShell`: **`hidden lg:block`** + `PatientTopNav` внутри. |
| **Нет одновременно видимых** двух primary nav | CSS: на ширине `lg+` bottom `display: none`, top виден; на **`&lt; lg`** наоборот. Оба узла могут быть в DOM при `showPatientShellNav`, но не оба отображаются. |
| Бренд **BersonCare** на desktop | `PatientTopNav`: иконка + текст «BersonCare» (видно только вместе с top bar на `lg+`). |
| **Нет desktop Back** | `PatientHeader`: `showMobileBack = !isDesktop && showBack` + `useViewportMinWidthLg()`. |
| **Нет top Home** | Ссылка Home из шапки удалена; «домой» — пункт **Сегодня** в primary nav. |
| **Нет settings gear** в patient header | `patientNavByPlatform`: без `settings`; в `PatientHeader` нет кейса settings; sheet-меню не содержит шестерёнки (и `hasSheetMenu` сейчас `false` — отдельный продуктовый момент). |
| Bottom nav: **Дневник**, не **Профиль** | `PATIENT_PRIMARY_NAV_ITEMS` — пять пунктов; профиль только в header/top bar. |
| **Профиль** сверху/справа | Mobile: иконка в правой группе `PatientHeader`; desktop при `patientShellNavDocked`: в **`PatientTopNav`** справа (в шапке страницы дубли убраны). |
| **a11y**: роли / `aria` | `aria-label` на `nav` «Основная навигация» (bottom + блок ссылок в top); **`aria-current="page"`** на активном `Link` в bottom/top; icon-only ссылки — **`aria-label`** (Напоминания, Сообщения, Профиль и т.д.); кнопка Back — `aria-label={backLabel}`. |
| **Тесты** уместны | Пять файлов из плана: bottom/top nav, `AppShell` (в т.ч. mutual exclusivity по классам + `data-patient-shell-max-px`), `PatientHeader`, `navigation.test.ts`. Полный root **`pnpm run ci`** по запросу аудита **не выполнялся**. |

### 3.1. Соответствие VISUAL_SYSTEM_SPEC

- **§5.1 / §5.2** — логика breakpoints и состав пунктов соблюдены; высота bottom bar с safe-area и `min-h-[72px]`, tap **≥ 44px** на пунктах — в духе spec.
- **§5.1 «Fixed bottom»** — в коде nav стоит **в потоке flex** внизу `AppShell`, не **`position: fixed`**. Поведение ближе к «footer primary nav»; возможное пересечение с **`PatientQuickAddFAB`** на отдельных экранах — зона **визуального QA** / последующего уточнения, не нарушение явного acceptance в `02_NAVIGATION_PLAN.md`.
- **§5.1 визуальные литералы** (например `rgba(255,255,255,0.96)`, inactive `#667085`, shadow `0 -4px 16px…`, label active **700**) — частично заменены на **токены** (`--patient-surface`, `--patient-text-muted`, тень `0_-4px_12px…`, `font-medium`). Соответствие «пиксель в пиксель» spec не требовалось планом Phase 2 как gate.

### 3.2. `patientHideBottomNav` / embed / guest

- **`patientEmbedMain`** и **`patientBrandTitleBar`**: `showPatientShellNav === false` → ни top, ни bottom primary nav — согласовано с планом и `LOG.md`.
- **`patientHideBottomNav`**: скрывает **и** bottom, **и** top nav (зафиксировано в `LOG.md`).
- **`AppShell.test.tsx`**: **нет** отдельных кейсов на отсутствие nav при embed / `patientHideBottomNav` — см. §4 minor / follow-up.

---

## 4. Minor notes

1. **§14.1 (Test Expectations):** нет assert на **`aria-current="page"`** для активного маршрута в `PatientBottomNav.test.tsx` / `PatientTopNav.test.tsx` (pathname в тестах зафиксирован на `/app/patient` — добавить одну строку было бы дёшево).

2. **`AppShell.test.tsx`:** mutual exclusivity проверяется **по responsive-классам**, без mock **`matchMedia`** и без сценария «nav отсутствует» при `patientHideBottomNav` / `patientEmbedMain` — рекомендуемое усиление перед долгим regression, не блокер Phase 3.

3. **`VISUAL_SYSTEM_SPEC.md` §4 таблица** по-прежнему частично описывает *предыдущее* состояние (например старые `headerRightIcons`); после Phase 2 имеет смысл **точечно обновить §4** в отдельном docs-PR, чтобы инвентарь не вводил в заблуждение.

4. **Дублирование** разметки иконок напоминаний / сообщений / профиля в **`PatientHeader`** и **`PatientTopNav`** — технический долг (см. `LOG.md` Phase 2); вне обязательного scope Phase 2.

5. **`pnpm --dir apps/webapp test -- <paths>`** по-прежнему может тянуть широкий прогон из-за обёртки `ensure-booking-sync-built.sh` + `vitest --run` без жёсткого filter — для целевых прогонов надёжнее **`npx vitest run <files>`** из каталога `apps/webapp` (как в `LOG.md`).

---

## 5. Tests

| Проверка | Статус |
|-----------|--------|
| **`npx vitest run`** на 5 файлах из `02_NAVIGATION_PLAN.md` / `LOG.md` | По `LOG.md` — **23 passed** при EXEC Phase 2. |
| **Full `pnpm run ci`** | **Не запускался** (по запросу аудита). |
| **Ревью покрытия §14.1** для Phase 2 | Обязательные пункты для nav/header/shell **выполнены**; расширения §14.1 для **home-блоков** относятся к **Phase 3+**, не к Phase 2. |

---

## 6. Readiness for Phase 3

**Да — можно переходить к Phase 3** (редизайн блоков главной / примитивы карточек и т.д. по `MASTER_PLAN` и следующим phase-планам), при условии соблюдения scope инициативы (не трогать запрещённые patient-страницы вне плана, не ломать doctor/admin).

Рекомендации на входе Phase 3 (не блокеры):

- Короткий **visual QA** по §14.3 spec (390px, 768–1024px, 1280px): пересечение FAB / bottom bar, плотность top bar, контраст активных пунктов.
- По желанию: доп. тесты **`aria-current`**, **`patientHideBottomNav` / embed** в `AppShell.test.tsx`.
- Учитывать **`PLAN_INVENTORY.md` / LOG**: полный стек `PatientHomeToday*` может всё ещё отличаться от spec §4 — Phase 3 должен явно опираться на **фактический код** + `VISUAL_SYSTEM_SPEC`, не на устаревшую строку таблицы без проверки.
