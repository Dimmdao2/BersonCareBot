# Этап 6: Расширение модуля дневников

> Приоритет: P2  
> Зависимости: Этап 2 (дизайн-система), Этап 1 (багфиксы дневника)  
> Риск: средний (миграции БД, обратная совместимость)

---

## Фактические файлы миграций (реализация в репозитории)

| Файл | Содержание |
|------|------------|
| `022_reference_tables_and_seed.sql` | `reference_categories`, `reference_items`, seed пяти категорий |
| `023_symptom_tracking_extension.sql` | Ссылки на справочники, `side`, `diagnosis_*`, `stage_ref_id`, `deleted_at` |
| `024_lfk_extension.sql` | Поля сессий ЛФК и расширение `lfk_complexes` |

---

## Для агента в режиме «авто»: как пользоваться этим документом

1. **Выполнять только один микрошаг за прогон** (например, только `6.1.1`), если иное не оговорено явно.
2. **Не объединять** миграции БД с крупным рефакторингом UI в одном коммите без необходимости — сначала данные и API, потом UI.
3. **Перед началом этапа 6** убедиться в актуальном списке миграций: `apps/webapp/migrations/*.sql` — номера **монотонно растут**; следующий свободный файл на момент составления плана — **`022_*.sql`** (после `021_login_tokens_session_issued.sql`). Если в репозитории уже есть `022+`, взять **следующий свободный номер** и **заменить** его во всех упоминаниях этого плана в своём PR (не переименовывать чужие применённые миграции).
4. **Жёсткие запреты (весь этап 6):**
   - не менять уже существующие файлы миграций `001`–`021` (и любые уже в main), кроме случая явного hotfix по согласованию;
   - не удалять колонки/таблицы дневников без отдельного ADR;
   - не ослаблять авторизацию на doctor/admin-маршрутах «для удобства тестов» — только осмысленные тестовые фикстуры/mocks;
   - не писать секреты в репозиторий;
   - не добавлять зависимости без необходимости; если добавляете — обосновать в описании PR и прогнать `pnpm run ci`.
5. **Обязательное чтение перед кодом:** `docs/ARCHITECTURE/SERVER CONVENTIONS.md` (если трогаете деплой/БД), `README.md`, `docs/README.md`; для webapp — существующие паттерны: `buildAppDeps`, `apps/webapp/src/app/api/integrator/diary/*`, server actions в `apps/webapp/src/app/app/patient/diary/*/actions.ts`.
6. **Финальная проверка всего этапа 6:** `pnpm install --frozen-lockfile && pnpm run ci` и `pnpm --dir apps/webapp run test:e2e` (как в `.cursor/rules/pre-push-ci.mdc`).

---

## Карта микрошагов (DAG)

Выполнять **по порядку номеров**, если нет явной пометки «можно параллельно».

| ID | Содержание |
|----|------------|
| **6.0** | Инвентаризация и выбор номеров миграций |
| **6.1.1** | SQL: справочники + seed |
| **6.1.2** | Доменные типы, порты, PG-репозиторий |
| **6.1.3** | HTTP API: GET публичный, POST doctor, PATCH admin + тесты маршрутов |
| **6.1.4** | Подключение к `buildAppDeps` / DI (если требуется для actions) |
| **6.2.1** | `ReferenceSelect` + кэш справочников |
| **6.2.2** | Тесты UI-компонента (Vitest + Testing Library, минимум) |
| **6.3.1** | SQL: расширение `symptom_trackings` |
| **6.3.2** | Репозитории, типы, server actions / integrator API — новые поля |
| **6.3.3** | Тесты: unit/repo/route/e2e-inprocess для roundtrip |
| **6.4.1** | Форма симптома: поля + `ReferenceSelect` |
| **6.4.2** | Валидация «хотя бы название ИЛИ тип» + сохранение + тесты |
| **6.5.1** | SQL: `deleted_at` (и правила списков) при необходимости |
| **6.5.2** | Server actions/API: переименовать / архив / удалить |
| **6.5.3** | UI: меню «⋮», модалки подтверждения |
| **6.6.1** | SQL: `lfk_sessions` + `lfk_complexes` расширение |
| **6.6.2** | Репозитории + actions + integrator ответы |
| **6.6.3** | Тесты roundtrip + обновление e2e in-process |
| **6.7.1** | UI форма ЛФК: дата/время, длительность, слайдеры, комментарий |
| **6.7.2** | Ограничения, UX (toast), тесты |
| **6.8.1** | Страница `/app/patient/diary` с табами + query `tab=` |
| **6.8.2** | Редиректы со старых URL + e2e |
| **6.9.1** | `QuickAddPopup` + видимость по данным |
| **6.9.2** | Встраивание в `AppShell`, сохранение, e2e |

Ниже — **детальные инструкции** по каждому шагу.

---

### 6.0 Инвентаризация и номера миграций

**Цель:** зафиксировать, под какими именами будут новые файлы миграций, чтобы не было коллизий.

**Разрешено:** чтение репозитория; запись только в этот `PLAN.md` при обнаружении расхождения номеров (таблица «фактические имена файлов»).

**Запрещено:** менять код приложения.

**Действия:**

1. Выполнить `ls apps/webapp/migrations/*.sql | sort` и записать **последний номер**.
2. Назначить последовательность для этапа 6 (по умолчанию):
   - `022_*` — справочники;
   - `023_*` — расширение `symptom_trackings`;
   - `024_*` — soft-delete / `deleted_at` **или** включить в `023` одной миграцией, если шаги 6.3 и 6.5 делаются одним PR (предпочтительно **одна миграция на симптомы** с nullable `deleted_at`, чтобы не плодить файлы — см. 6.5.1);
   - `025_*` (при необходимости) — если разделили soft-delete отдельно;
   - `026_*` — расширение ЛФК (`lfk_sessions`, `lfk_complexes`).

   **Корректировка:** если после `021` уже есть `022`, сдвинуть всю цепочку вниз, сохраняя порядок: справочники → симптомы → ЛФК.

**Проверки конца шага:**

- В документе/комментарии к задаче явно указаны **итоговые имена** файлов миграций.

**Критерий успеха:**

- Нет пересечения имён с существующими файлами в `apps/webapp/migrations/`.

---

### 6.1.1 SQL: `reference_categories`, `reference_items`, seed

**Цель:** таблицы справочников и начальные данные.

**Разрешено:** новый файл миграции `022_reference_tables_and_seed.sql` (или согласованное имя из 6.0).

**Запрещено:** менять таблицы дневников; добавлять бизнес-логику вне SQL.

**Содержание SQL (уточнение к исходному плану):**

- `reference_categories`: поля как в разделе «Подэтап 6.1» исходного текста + **`tenant_id UUID NULL`**.
- `reference_items`: `UNIQUE(category_id, code)`, индекс `(category_id, sort_order)`.
- Seed: категории и коды **`symptom_type`**, **`body_region`**, **`diagnosis`**, **`disease_stage`**, **`load_type`** с перечисленными в исходном плане значениями (стабильные `code`, человекочитаемые `title`).

**Проверки конца шага:**

- Локально: применить миграции к dev/test БД по принятому в проекте способу (см. `docs/README.md` / скрипты) **или** убедиться, что CI/migrate шаг проходит.
- `pnpm run ci` (если миграции подхватываются сборкой — всегда).

**Критерий успеха:**

- Миграция применяется без ошибки;
- В БД есть строки seed для всех пяти категорий.

---

### 6.1.2 Домен: типы, порты, PG-репозиторий справочников

**Цель:** чтение категорий/items из БД в коде.

**Разрешено:** `apps/webapp/src/modules/references/` (или согласованное имя), `apps/webapp/src/infra/repos/pg*References*.ts`, обновление экспортов индексов.

**Запрещено:** HTTP-маршруты; изменение UI.

**Действия:**

- Описать типы: `ReferenceCategory`, `ReferenceItem` (с `metaJson`, `isActive`, `sortOrder`).
- Порт: list items by category code (только `is_active = true` для «витрины»); отдельные методы для admin archive при необходимости.
- Реализация на PG с параметризованными запросами.

**Тесты (обязательно):**

- Unit/integration на repo: выборка по `categoryCode` возвращает seed; порядок `sort_order`.

**Проверки конца шага:**

- `pnpm --dir apps/webapp test` — новые тесты зелёные;
- `pnpm run ci`.

**Критерий успеха:**

- Repo вызывается из тестов и возвращает ожидаемые seed-записи.

---

### 6.1.3 HTTP API справочников

**Цель:** контракты API из исходного плана 6.1.

**Маршруты (уточнение):**

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/references/[categoryCode]` | публичный read для заполнения селектов (только `is_active=true`) |
| `POST` | `/api/doctor/references/[categoryCode]` | только врач (сессия/роль как у других doctor API в проекте) |
| `PATCH` | `/api/admin/references/[itemId]/archive` | только админ; **soft-delete**: `is_active = false` |

**Разрешено:** только файлы `route.ts` под `apps/webapp/src/app/api/...`, общие утилиты авторизации, zod-схемы тел.

**Запрещено:** подключать UI; ослаблять проверку роли.

**Правила удаления (как в исходном плане):**

- Врач **не** удаляет — только добавляет item в категорию (если бизнес это допускает для категории `is_user_extensible` — логику согласовать с колонкой `is_user_extensible`; при неясности — **только** категории с `is_user_extensible = true` для POST doctor).

**Тесты (обязательно):**

- Файлы `*.route.test.ts` рядом с маршрутами: 200 GET; 401/403 doctor/admin без прав; 200 POST при doctor; PATCH archive при admin; GET после archive не отдаёт item в списке для новых выборов.

**Проверки конца шага:**

- `pnpm run ci`.

**Критерий успеха:**

- Все три маршрута покрыты тестами; поведение soft-delete подтверждено тестом GET.

---

### 6.1.4 DI: `buildAppDeps`

**Цель:** если patient server actions или другие модули получают справочники через deps — провести проводку.

**Разрешено:** `apps/webapp/src/app-layer/di/buildAppDeps.ts` и типы deps.

**Запрещено:** менять несвязанные модули.

**Проверки:** `pnpm run ci`.

**Критерий успеха:** typecheck чистый; deps собирается.

---

### 6.2.1 Компонент `ReferenceSelect`

**Цель:** переиспользуемый выбор из справочника.

**Props (минимум):** `categoryCode`, `value`, `onChange`, `placeholder`, `allowFreeText?`, опционально `disabled`, `className`.

**Поведение:**

- Загрузка через `GET /api/references/:categoryCode` при монтировании.
- Поиск/фильтрация по списку (client-side достаточно для MVP).
- `allowFreeText`: возможность ввести значение не из списка (хранить в форме как текст — маппинг на `meta_json` или отдельное поле **уточняется в 6.4**; не ломать обратную совместимость).

**Кэш:** один раз за сессию — `React.Context` провайдер на уровне patient layout **или** `sessionStorage` с ключом по `categoryCode` (единый подход в рамках PR).

**Запрещено:** дублировать fetch на каждый ререндер без кэша.

**Тесты:** см. 6.2.2.

---

### 6.2.2 Тесты `ReferenceSelect`

**Цель:** стабильность компонента.

**Разрешено:** Vitest + `@testing-library/react`, мок `fetch`.

**Проверки:** `pnpm --dir apps/webapp test`; `pnpm run ci`.

**Критерий успеха:** отображение опций; фильтр поиска; free text при флаге.

---

### 6.3.1 SQL: расширение `symptom_trackings`

**Цель:** колонки из исходного плана 6.3.

**Файл:** например `023_symptom_tracking_extension.sql`.

**Колонки (все nullable для совместимости):**

- `symptom_type_ref_id`, `region_ref_id` → `reference_items(id)`;
- `side` — `CHECK (side IN ('left','right','both'))`;
- `diagnosis_text`, `diagnosis_ref_id`, `stage_ref_id`.

**Запрещено:** менять NOT NULL у старых полей без миграции данных.

**Проверки:** применение миграции; `pnpm run ci`.

**Критерий успеха:** старые строки остаются валидны; новые колонки NULL.

---

### 6.3.2 Репозитории и API действий

**Цель:** чтение/запись новых полей в `pgSymptomDiary` (и связанных слоях), обновление типов `DiariesPort` / методов create/update tracking.

**Разрешено:** `apps/webapp/src/infra/repos/pgSymptomDiary.ts`, `modules/diaries`, server actions `symptoms/actions.ts`, при необходимости — ответы `/api/integrator/diary/symptom-trackings`.

**Запрещено:** ломать существующие поля `symptom_title`, `symptom_key`.

**Тесты:**

- Расширить/добавить тесты репозитория и route integrator, если меняется JSON.

**Проверки:** `pnpm run ci`.

---

### 6.3.3 Тесты roundtrip + e2e in-process

**Цель:** регресс дневника симптомов.

**Действия:**

- Обновить **`apps/webapp/e2e/diaries-inprocess.test.ts`**: при наличии новых методов deps — проверить roundtrip с **частично заполненными** ref-полями (если API позволяет).

**Проверки:** `pnpm --dir apps/webapp run test:e2e` (папка `e2e/`).

**Критерий успеха:** старые сценарии e2e зелёные; добавлены проверки новых полей **или** явный комментарий «поля опциональны, roundtrip только title» — но тогда unit-тесты обязаны покрыть ref-колонки.

---

### 6.4.1–6.4.2 UI формы симптома

**6.4.1 — разметка:** файл `CreateTrackingForm.tsx` — все поля из исходного плана 6.4 (`ReferenceSelect`, сторона кнопками, диагноз text + select).

**6.4.2 — правила:**

- **Обязательность:** хотя бы одно из: **название (текст)** ИЛИ **тип симптома** (ref). Остальное опционально.
- Сохранение через существующий паттерн server actions.

**Тесты:**

- По возможности — компонентный тест сабмита с моком action;
- Минимум один интеграционный тест на уровне action с фикстурой пользователя (если в проекте принято).

**Проверки:** `pnpm run ci`.

**E2E (рекомендуется в этом же подэтапе):** расширить `e2e/diaries-inprocess.test.ts` или добавить **`e2e/diary-symptoms-ui-inprocess.test.ts`** — импорт страницы/формы без браузера, проверка что форма экспортируется и action вызывается (как сейчас для diary pages).

---

### 6.5.1 SQL: `deleted_at` для трекингов (если требуется отдельно)

Если в `023` не добавили — отдельная миграция: `deleted_at TIMESTAMPTZ NULL`, индекс при необходимости.

**Семантика (уточнение):**

- **Архивировать:** `is_active = false` (уже есть в таблице).
- **Удалить:** `is_active = false` + `deleted_at = now()` **или** только `deleted_at` — **выбрать одну модель** и придерживаться в списках: основной список скрывает `deleted_at IS NOT NULL` **и** при необходимости `is_active = false`.

**Запрещено:** физическое удаление строк без явного решения.

---

### 6.5.2 Server actions: переименовать / архив / удалить

**Цель:** методы на deps или прямые вызовы repo с проверкой `user_id`.

**Обязательно:** каждое действие проверяет, что tracking принадлежит текущему пользователю.

**Тесты:** unit/route тесты на отказ чужого `trackingId`.

---

### 6.5.3 UI: меню «⋮»

**Цель:** как в исходном плане 6.5 — dropdown, inline rename, подтверждение удаления (shadcn `AlertDialog` или аналог по дизайн-системе этапа 2).

**Проверки:** `pnpm run ci`; ручной smoke опционален.

**E2E:** добавить сценарий в in-process: компонент списка импортируется, **или** минимальный тест на наличие обработчиков (если UI e2e без браузера ограничен).

---

### 6.6.1 SQL: ЛФК

**Файл:** например `026_lfk_extension.sql` (номер согласовать с 6.0).

**`lfk_sessions`:** `duration_minutes`, `difficulty_0_10`, `pain_0_10`, `comment`, `recorded_at`; backfill `recorded_at = completed_at` где NULL.

**`lfk_complexes`:** `symptom_tracking_id`, `region_ref_id`, `side`, `diagnosis_text`, `diagnosis_ref_id` — как в исходном плане.

---

### 6.6.2–6.6.3 Репозитории, actions, тесты

Аналогично 6.3: обновить `pgLfkDiary`, `lfk/actions`, integrator `lfk-complexes` / сессии, **тесты route**, обновить **`e2e/diaries-inprocess.test.ts`** для roundtrip с новыми полями (хотя бы nullable).

---

### 6.7.1–6.7.2 UI форма ЛФК-сессии

По исходному плану 6.7: дата/время, длительность, range 0–10, комментарий max 200 символов, toast.

**Тесты:** валидация длины комментария (unit); при возможности — компонентный тест слайдеров.

---

### 6.8.1–6.8.2 Табы и редиректы

**6.8.1:** единая страница `/app/patient/diary` с клиентским переключением вкладок «Симптомы» | «ЛФК», состояние из `searchParams.tab` (`symptoms` | `lfk`).

**6.8.2:** `next.config` или `page.tsx` редиректы: `/app/patient/diary/symptoms` → `/app/patient/diary?tab=symptoms`, `/app/patient/diary/lfk` → `?tab=lfk`.

**Тесты e2e (обязательно):**

- Новый или расширенный **`e2e/diaries-inprocess.test.ts`**: импорт новой страницы `/app/patient/diary/page` (если async — как у существующих), проверка экспорта;
- Проверка строк редиректа **или** отдельный минимальный тест на `redirect` конфиг (если принято).

**Запрещено:** ломать глубокие ссылки без редиректа.

---

### 6.9.1–6.9.2 Quick add

По исходному плану 6.9: `QuickAddPopup`, кнопка «+», условная видимость, интеграция в `AppShell`.

**Тесты:**

- Unit: рендер при моках «есть симптомы / есть комплексы»;
- **E2E in-process:** импорт `AppShell` или точки монтирования кнопки, что обработчики не падают (по аналогии с другими e2e).

**Проверки:** `pnpm run ci` + `pnpm --dir apps/webapp run test:e2e`.

---

## Сводка: что считать «шаг завершён»

Для **каждого** микрошага выше обязательны:

1. **Код** только в рамках «Разрешено».
2. **Тесты** из раздела шага (если указаны «обязательно»).
3. Команда **`pnpm run ci`** зелёная после шага (допустимо локально прогонять только `pnpm --dir apps/webapp test` на ранних итерациях, но **перед merge — полный `ci`**).
4. Для шагов с **изменением пользовательских потоков** — обновление **`apps/webapp/e2e/*`** (in-process паттерн проекта).

---

## Общий критерий завершения этапа 6

- [x] Справочники: таблицы, seed, API (GET/doctor/admin), UI `ReferenceSelect`.
- [x] Симптомы: расширенная модель, форма, управление (переименовать / архив / удалить с проверкой владельца).
- [x] ЛФК: расширенные сессии и комплексы, форма с датой/времени и ползунками.
- [x] Вкладки «Симптомы» / «ЛФК» на `/app/patient/diary` + редиректы со старых путей.
- [x] Попап быстрого добавления.
- [x] `pnpm run ci` проходит.
- [x] `pnpm --dir apps/webapp run test:e2e` проходит.

См. также `SECURITY.md` в этой папке.

---

## Приложение: исходные технические фрагменты (сохранены)

### Подэтап 6.1 — backend (SQL-черновик)

```sql
CREATE TABLE IF NOT EXISTS reference_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  is_user_extensible BOOLEAN NOT NULL DEFAULT false,
  owner_id UUID,
  tenant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reference_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES reference_categories(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  meta_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category_id, code)
);
CREATE INDEX idx_ref_items_category ON reference_items(category_id, sort_order);
```

Seed-категории и значения — как в предыдущей версии плана (симптомы, регионы, диагнозы, стадии, тип нагрузки).

### Подэтап 6.3 — расширение `symptom_trackings`

```sql
ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS symptom_type_ref_id UUID REFERENCES reference_items(id);
ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS region_ref_id UUID REFERENCES reference_items(id);
ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS side TEXT CHECK (side IN ('left', 'right', 'both'));
ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS diagnosis_text TEXT;
ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS diagnosis_ref_id UUID REFERENCES reference_items(id);
ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS stage_ref_id UUID REFERENCES reference_items(id);
```

### Подэтап 6.6 — ЛФК

```sql
ALTER TABLE lfk_sessions ADD COLUMN IF NOT EXISTS duration_minutes SMALLINT;
ALTER TABLE lfk_sessions ADD COLUMN IF NOT EXISTS difficulty_0_10 SMALLINT CHECK (difficulty_0_10 BETWEEN 0 AND 10);
ALTER TABLE lfk_sessions ADD COLUMN IF NOT EXISTS pain_0_10 SMALLINT CHECK (pain_0_10 BETWEEN 0 AND 10);
ALTER TABLE lfk_sessions ADD COLUMN IF NOT EXISTS comment TEXT;
ALTER TABLE lfk_sessions ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;
UPDATE lfk_sessions SET recorded_at = completed_at WHERE recorded_at IS NULL;

ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS symptom_tracking_id UUID REFERENCES symptom_trackings(id);
ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS region_ref_id UUID REFERENCES reference_items(id);
ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS side TEXT CHECK (side IN ('left', 'right', 'both'));
ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS diagnosis_text TEXT;
ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS diagnosis_ref_id UUID REFERENCES reference_items(id);
```

---

*Документ обновлён: микрошаги для режима «авто», исправлена нумерация миграций относительно текущего репозитория (`022+`), добавлены границы ответственности и обязательные проверки.*
