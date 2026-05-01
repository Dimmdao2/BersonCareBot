# AUDIT — Phase 3 (Patient App Visual Redesign — Home Primary)

Дата: **2026-04-29**. Режим: **AUDIT** (сверка с `03_HOME_PRIMARY_PLAN.md`, `VISUAL_SYSTEM_SPEC.md` §§10.1–10.4, 11, 12, 14 и `LOG.md`; ревью кода; **full CI не запускался**).

Источники ревью кода: `PatientHomeToday.tsx`, `PatientHomeTodayLayout.tsx`, `PatientHomeGreeting.tsx`, `PatientHomeDailyWarmupCard.tsx`, `PatientHomeBookingCard.tsx`, `PatientHomeSituationsRow.tsx`, `patientHomeCardStyles.ts`, `page.tsx` (склейка), тесты `src/app/app/patient/home/*.test.tsx`.

---

## 1. Verdict: **PASS WITH MINOR NOTES**

Результат Phase 3 **соответствует acceptance** `03_HOME_PRIMARY_PLAN.md` и ключевым пунктам **VISUAL_SYSTEM_SPEC §§10.1–10.4, 11, 12, 14** на уровне поведения и архитектурных ограничений: hero — градиентная карточка с CTA и безопасным изображением/фолбэком, booking — success-карточка с корректными href и гостевым режимом, situations — данные из существующего списка разделов без slug/title color mapping, приветствие с TZ на сервере, layout без «дыр» при отсутствии правой колонки, тесты добавлены/обновлены, **нет** правок repos/services/`patient_home_*` data logic.

**Minor notes** — расхождения с буквальным текстом spec (подзаголовок §10.1 vs `03` план, отдельная «accent duration line» §10.2, отсутствие `imageUrl` на `ContentSectionRow`, отсутствие интеграционного теста async `PatientHomeToday` с реальным `getAppDisplayTimeZone`, склейка вне списка allowed в `03`) — **не блокируют** следующие фазы при принятии компромиссов из `LOG.md`.

---

## 2. Mandatory fixes

**Нет.**

---

## 3. Проверка запроса аудита

| Проверка | Результат |
|-----------|-----------|
| **Hero больше не generic image-on-top** | `PatientHomeDailyWarmupCard` использует `patientHomeCardHeroClass` (градиент, `overflow-hidden`, min-height), контент слева, медиа/декор **справа снизу** (`absolute bottom-0 right-0`), не паттерн «картинка сверху + текст» как у `FeatureCard`. |
| **Hero: безопасное image / fallback** | При `imageUrl`: `<img loading="lazy" alt="">` (декоративно), `object-contain`, ограничение контейнера; без URL — декоративный блок `Sparkles` + `aria-hidden`. Текстовый столбец с **`pr-[min(42%,140px)]`** снижает риск перекрытия на 320–390px (§10.2). |
| **Booking success + href / auth** | `patientHomeCardSuccessClass` + success/secondary из `patientVisual`; **guestMode**: оба CTA → `/app?next=…` на `routePaths.patient`; иначе `bookingHref` / `cabinetHref` из `page.tsx`. |
| **Situations: CMS-driven, без slug color mapping** | Данные — `ContentSectionRow[]` (тот же источник, что `listVisible` на странице); плитки **нейтральные** `bg-muted/80`, без ветвлений по `slug`/`title`. **§10.4 `imageUrl`**: в типе раздела поля нет — иконки CMS не подключены (`LOG.md`); fallback — инициалы из `title`. |
| **Layout при отсутствии блоков** | `PatientHomeTodayLayout`: правая колонка только если `situations != null`; hero/booking опциональны. Placeholder-hero при `materials` и пустом списке (§11). |
| **Тесты** | Шесть файлов: layout, sort, warmup, booking, situations, greeting (в т.ч. **4 ветки** `greetingPrefixFromHour` + гость/имя). По `LOG.md` — **15 passed** при EXEC; интеграционного рендера async `PatientHomeToday` с моком TZ **нет** — minor. |
| **Нет утечки data/service** | Новые компоненты **не** добавляют вызовов портов БД из `PatientHome*`; `PatientHomeToday` использует **`getAppDisplayTimeZone`** и тип `ContentSectionRow`; загрузка разделов по-прежнему в `page.tsx` через `deps.contentSections.listVisible` без изменения порта в Phase 3. Таблицы `patient_home_blocks` / `patient_home_block_items` **не** затрагивались. |

---

## 4. Соответствие `03_HOME_PRIMARY_PLAN.md` (дополнительно)

| Пункт плана | Статус |
|-------------|--------|
| Имя `filterAndSortPatientHomeBlocks` | В коде — **`sortPatientContentSectionsForHome`** для **`content_sections`**, не для `patient_home_blocks` (склейка CMS workflow с patient home в дереве **ещё не** на этой странице). Соответствует `LOG.md` / `PLAN_INVENTORY`. |
| Субтитул | **`Готовы к разминке?`** по `03`; **§10.1** предлагает другой starter copy — допустимое отклонение. |
| `page.tsx` вне списка allowed `03` | Минимальная склейка — зафиксировано в `LOG.md`. |

---

## 5. VISUAL_SYSTEM_SPEC (§§10.1–10.4, 11, 12, 14) — кратко

- **§10.2** — отдельная строка-accent длительности под заголовком **не** реализована (длительность в бейдже) — minor.
- **§10.4** — заголовок секции «Разделы» вместо «Ситуации» — minor копирайт.
- **§12** — CTA с текстом; декоративные элементы с `aria-hidden`; полная WCAG-пастель — на visual QA.
- **§14** — семантические тесты без layout-snapshot — ok.

---

## 6. Tests / CI

| Проверка | Статус |
|-----------|--------|
| Targeted vitest Phase 3 (см. `LOG.md`) | **15 passed** задокументировано при EXEC. |
| **Root `pnpm run ci`** | **Не запускался** по запросу аудита. |

---

## 7. Readiness for Phase 4+

**Да**, с учётом backlog в `LOG.md` (длительность/обложка в API, QA 320–390px).

---

## 8. Продуктовое замечание

С главной снят **`PatientHomeBrowserHero`**; доступ к дневнику/прочим быстрым ссылкам — через навигацию Phase 2 и остальные экраны (`LOG.md`). При необходимости — отдельное продуктовое решение, не mandatory Phase 3.
