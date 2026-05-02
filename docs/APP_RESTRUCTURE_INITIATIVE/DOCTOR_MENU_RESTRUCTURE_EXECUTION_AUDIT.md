# Аудит выполнения: этап 2 «Меню врача» (DOCTOR_MENU_RESTRUCTURE)

**Дата аудита:** 2026-05-02.  
**Пост-аудит (документы + код):** 2026-05-02 — см. §10 и запись «пост-аудит этапа 2» в [`LOG.md`](LOG.md).

---

## 1. Резюме

Исполнение этапа **соответствует** Definition of Done из ТЗ. Перечисленные ниже хвосты **закрыты пост-аудитом** (кроме пункта, зависящего от продуктового решения про синхронизацию кластера с `pathname` — см. §8 п.2).

**Закрыто после первоначального аудита:**

1. [`DoctorHeader.tsx`](../../apps/webapp/src/shared/ui/DoctorHeader.tsx): `aria-label` shortcut на список клиентов — «Пациенты» (как в меню).
2. [`LOG.md`](LOG.md): блок «Проверки» этапа 2 дополнен полной командой `pnpm exec eslint` со списком файлов.
3. Устаревшие ссылки на `DOCTOR_MENU_ENTRIES` в живых документах инициативы приведены к модели `doctorNavLinks` / кластеры ([`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md), [`CMS_AUDIT.md`](CMS_AUDIT.md)); [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) — уточнена проверка `rg`.
4. Исторические строки в [`LOG.md`](LOG.md) (чек-листы пунктов 2–3) обновлены под отсутствие `DOCTOR_MENU_ENTRIES`.

---

## 2. Методология проверки

*(Без изменений по смыслу от первоначального аудита.)*

1. Построчное сопоставление разделов ТЗ «Целевое меню», «Поведение аккордеона», «Scope», «Definition of Done» с текущим кодом в `apps/webapp/src/shared/ui/` и CMS-сайдбаром.
2. Просмотр [`doctorNavLinks.ts`](../../apps/webapp/src/shared/ui/doctorNavLinks.ts), [`DoctorMenuAccordion.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.tsx), интеграций в sidebar/header, [`doctorScreenTitles.ts`](../../apps/webapp/src/shared/ui/doctorScreenTitles.ts), [`ContentPagesSidebar.tsx`](../../apps/webapp/src/app/app/doctor/content/ContentPagesSidebar.tsx).
3. Поиск остаточных строк `Обзор` / `Клиенты и подписчики` в doctor UI shared.
4. Сверка записи в [`LOG.md`](LOG.md) с фактическими артефактами и с правилом execution log из `.cursor/rules/plan-authoring-execution-standard.mdc`.

Автоматический прогон полного `pnpm run ci` в рамках этого аудита **не** выполнялся повторно; в журнале зафиксированы точечные `vitest run` и `eslint` по затронутым файлам.

---

## 3. Соответствие ТЗ (чек-лист)

**Цель и группировка**

- Пункты сгруппированы по кластерам с подписями из ТЗ: «Работа с пациентами», «Назначения», «Контент приложения», «Коммуникации», «Система». Подтверждено в [`doctorNavLinks.ts`](../../apps/webapp/src/shared/ui/doctorNavLinks.ts) (`CLUSTER_*`).
- Порядок отображения включает standalone «Библиотека файлов» **между** «Контент приложения» и «Коммуникации» — функция `getDoctorMenuRenderSections()` (соответствует блок-схеме ТЗ).

**Переименования в меню**

- «Обзор» → «Сегодня» (`overview` link label).
- «Клиенты и подписчики» → «Пациенты» (пункт меню; URL с `scope=appointments` сохранён).
- «Комплексы» → «Комплексы ЛФК» в меню; заголовки экранов ЛФК в [`doctorScreenTitles.ts`](../../apps/webapp/src/shared/ui/doctorScreenTitles.ts) для `/app/doctor/lfk-templates*` по-прежнему «Комплексы» / конструктор — **не противоречит** формулировке ТЗ («в меню», без обязательной смены внутренних заголовков).

**Аккордеон и localStorage**

- Открыт ровно один кластер: ветка рендера `{open ? cluster.items.map(...) : null}` при `open === openClusterId === cluster.id`.
- Ключ: константа `DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY === "doctorMenu.openCluster.v1"` — совпадает с ТЗ.
- Дефолт без валидного сохранённого id: `DOCTOR_MENU_DEFAULT_CLUSTER_ID === "patients-work"` (= «Работа с пациентами»).
- Невалидный id в storage: при чтении используется `isDoctorMenuClusterId`; иначе состояние не перезаписывается дефолтом в effect — начальное состояние уже дефолтное → соответствует «использовать дефолтный кластер».
- Смена кластера: `persistOpenCluster` вызывает `setOpenClusterId` и `localStorage.setItem`.
- SSR: прямого чтения `localStorage` при первом render нет; чтение после mount в `useEffect` (с точечным `eslint-disable` для `set-state-in-effect` из-за гидрации — осознанный компромисс).

**Desktop / mobile**

- Один источник секций: `DoctorMenuAccordion` с `variant="sidebar"` в [`DoctorAdminSidebar.tsx`](../../apps/webapp/src/shared/ui/DoctorAdminSidebar.tsx) и `variant="sheet"` + `onNavigate={closeMenu}` в [`DoctorHeader.tsx`](../../apps/webapp/src/shared/ui/DoctorHeader.tsx).
- Служебный блок «Профиль и настройки» / «Выйти» вне аккордеона — сохранён в обоих местах.

**Библиотека файлов**

- Пункт в основном меню: `href` `/app/doctor/content/library`, standalone массив `DOCTOR_MENU_STANDALONE_LINKS`.
- CMS-сайдбар: ссылки на библиотеку нет — конец [`ContentPagesSidebar.tsx`](../../apps/webapp/src/app/app/doctor/content/ContentPagesSidebar.tsx) заканчивается системными папками без `/library`.

**Screen titles (шаг 6 ТЗ)**

- `/app/doctor` → «Сегодня».
- `/app/doctor/online-intake` → «Онлайн-заявки».
- `/app/doctor/content/library` → «Библиотека файлов».

**Scope**

- Новые маршруты, env, БД, зависимости для аккордеона — не добавлялись (подтверждено обзором изменений).
- Логика CMS (фильтры статей, системные папки, query params) не менялась, кроме удаления одной ссылки — соблюдено.

---

## 4. Логика функций (инспекция кода)

| Функция / участок | Назначение | Проверка корректности |
|-------------------|------------|------------------------|
| `getDoctorMenuRenderSections()` | Единый порядок секций для sidebar и Sheet | Фиксированная последовательность: 3 кластера → standalone → 2 кластера; покрыто unit-тестом порядка типов секций. |
| `isDoctorMenuClusterId(id)` | Валидация значения из `localStorage` | Совпадение с `DOCTOR_MENU_CLUSTERS[].id`. |
| `isDoctorNavItemActive(href, pathname)` | Подсветка активного пункта | Спец-случай `/app/doctor` (только корень); для `/app/doctor/content` исключён префикс `/app/doctor/content/library`, чтобы медиатека не подсвечивала «CMS» — разумное уточнение UX; тесты в `doctorNavLinks.test.ts`. |
| `DOCTOR_MENU_LINKS` | Плоский список без служебных действий | Сборка из кластеров + standalone; тест на отсутствие `/app/settings` и наличие library. |
| `DoctorMenuAccordion` | UI + состояние открытого кластера | `persistOpenCluster` синхронизирует React и `localStorage`; ссылки вызывают `onNavigate` в Sheet; кластерные кнопки с `aria-expanded` / `aria-controls`. |

---

## 5. Тесты

Файлы, явно затрагивающие этап:

- [`doctorNavLinks.test.ts`](../../apps/webapp/src/shared/ui/doctorNavLinks.test.ts) — `isDoctorNavItemActive`, структура меню, порядок секций, `DOCTOR_MENU_LINKS`.
- [`DoctorMenuAccordion.test.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.test.tsx) — дефолтный кластер, переключение, localStorage, standalone библиотека, `onNavigate`.
- [`doctorScreenTitles.test.ts`](../../apps/webapp/src/shared/ui/doctorScreenTitles.test.ts) — «Сегодня», online-intake, library.
- [`ContentPagesSidebar.test.tsx`](../../apps/webapp/src/app/app/doctor/content/ContentPagesSidebar.test.tsx) — отсутствие ссылки «Библиотека файлов».

Рекомендуемая повторяемая команда (из журнала):

```bash
cd apps/webapp && pnpm exec vitest run \
  src/shared/ui/doctorNavLinks.test.ts \
  src/shared/ui/doctorScreenTitles.test.ts \
  src/shared/ui/DoctorMenuAccordion.test.tsx \
  src/app/app/doctor/content/ContentPagesSidebar.test.tsx
```

---

## 6. Журнал [`LOG.md`](LOG.md)

**Сильные стороны**

- Блоки «Сделано», «Решения», «Проверки», «Вне scope»; отдельная запись «пост-аудит» с фиксами по этому документу.
- В записи этапа 2 команда `pnpm exec eslint` перечисляет **все** затронутые пути (копипаст-готовность).

**Зазоры:** нет; ранее отмеченный зазор по списку файлов для ESLint **снят** 2026-05-02.

---

## 7. Пометки о выполнении в планах

| Артефакт | Состояние (после пост-аудита 2026-05-02) |
|-----------|------------------------------------------|
| [`DOCTOR_MENU_RESTRUCTURE_PLAN.md`](DOCTOR_MENU_RESTRUCTURE_PLAN.md) | Статус «выполнено», раздел «Аудит выполнения», уточнение про `aria-label` в `DoctorHeader`. |
| Cursor plan (`.cursor/plans/…`) | Вне репозитория; канон — ТЗ + этот аудит + `LOG.md`. |
| [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) | Шаги этапа 2 и проверка `rg` приведены в соответствие с кодом. |
| [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md) | Таблица «выполнено» и этап 6: ссылки на кластерное меню вместо `DOCTOR_MENU_ENTRIES`. |

---

## 8. Рекомендации (не блокируют закрытие этапа)

1. ~~Выровнять `aria-label` у иконки клиентов в шапке~~ — **сделано** (см. [`LOG.md`](LOG.md) пост-аудит).
2. При необходимости улучшить UX глубоких ссылок: открытый кластер **не** синхронизируется с `pathname` (осознанное ограничение); требует продуктового решения.

---

## 9. Итоговый вердикт

**Этап 2 по [`DOCTOR_MENU_RESTRUCTURE_PLAN.md`](DOCTOR_MENU_RESTRUCTURE_PLAN.md) выполнен;** хвосты первоначального аудита закрыты пост-аудитом. Критические нарушения scope или DoD не выявлены.

---

## 10. Лог пост-аудитных правок (2026-05-02)

- **Код:** `DoctorHeader` — `aria-label` «Пациенты».
- **Журнал:** [`LOG.md`](LOG.md) — полный список путей `eslint` в проверках этапа 2; запись «пост-аудит»; уточнения исторических чек-листов.
- **Документы инициативы:** этот файл (§1, §6–§9), [`DOCTOR_MENU_RESTRUCTURE_PLAN.md`](DOCTOR_MENU_RESTRUCTURE_PLAN.md), [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md), [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md), [`CMS_AUDIT.md`](CMS_AUDIT.md), [`TARGET_STRUCTURE_DOCTOR.md`](TARGET_STRUCTURE_DOCTOR.md).
