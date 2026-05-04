# PATIENT_HOME_REDESIGN_INITIATIVE

Редизайн главной пациента: переход от «меню разделов» к ежедневной привычке коротких практик («Разминка дня» + ситуации + прогресс + запись на приём + промо подписки/курса).

Документ — **техническое задание для агентов-исполнителей**. Цель: чтобы более простые/дешёвые агенты могли по нему сделать декомпозицию каждой фазы и не упустить деталей, ничего не додумывая. Поэтому здесь зафиксированы:

- **что именно делать** (поля, файлы, маршруты, контракты),
- **что НЕ делать** (явный список),
- **критерии приёмки** по каждой фазе,
- **порядок** фаз и зависимости.

Если в процессе обнаружится конфликт с реальностью кода — **сначала зафиксировать в LOG.md**, обсудить, и только потом отклоняться от ТЗ. Молча отклоняться запрещено.

Визуальная система, навигационные решения и mapping к текущим patient-компонентам зафиксированы отдельно: [`VISUAL_SYSTEM_SPEC.md`](VISUAL_SYSTEM_SPEC.md). Перед задачами по визуальному редизайну, patient shell, header/nav, карточкам главной и переносом стиля на другие patient-страницы читать этот документ вместе с текущим README.

---

## 1. Контекст и цель

### 1.1. Проблема

Текущая главная пациента (`apps/webapp/src/app/app/patient/page.tsx`, `home/PatientMiniAppPatientHome.tsx`, `home/PatientHomeBrowserHero.tsx`) — это набор карточек-разделов (`Кабинет`, `Дневник`, `Помощник`, `Программы лечения`, `Курсы`, `Уроки`). Это:

- не показывает одно главное действие;
- не закрывает сценарий «маленькая практика прямо сейчас» — основной маркетинговый и retention-сценарий;
- не предусматривает витрины подписочного контента и продажи курсов;
- не отражает связь между бесплатной привычкой и платным продуктом.

### 1.2. Цель

Сделать главную «Сегодня» с одним главным действием — **«Начать разминку»** — и понятной структурой:

1. Большая карточка **«Разминка дня»** (одно конкретное короткое видео, сменяемое из админки).
2. Блок **«Запись на приём»** (всегда виден).
3. Горизонтальный ряд **ситуаций** (`Офис`, `Шея и плечи`, `Спина и поясница`, `Дыхание и релакс`, `Молодой маме`, `Антистресс и сон`, `Если болит сейчас`).
4. Прогресс **«сегодня выполнено N из M»** + стрик дней подряд.
5. Карточка **«Следующее напоминание»**.
6. Чек-ин **«Как вы себя чувствуете?»** (1–5).
7. Карточка **«Если болит сейчас»** (SOS).
8. Карточка **«Мой план»** (активная программа лечения / купленный курс).
9. Горизонтальная **карусель подписочных** материалов (на старте — без оплаты, только бейдж «По подписке»).

Один экран — одно главное действие. Меню других разделов — нижняя навигация / шапка.

### 1.3. Сроки и приоритет

Разрабатывать **строго по фазам, последовательно**. Каждая фаза самостоятельна — можно остановиться после её завершения и получить рабочий продукт.

### 1.4. Ежедневное напоминание от бота — кому и зачем

**Ежедневное напоминание от бота** (в коде — ключи `patient_home_morning_ping_*`) — это не напоминание администратору «что-то сделать». Это **исходящее сообщение пользователям** (пациентам), у которых подключён мессенджер (Telegram / MAX и т.д.): в заданное время интегратор рассылает приглашение открыть «Разминку дня» (deeplink в mini-app). Админ в UI только **включает/выключает** рассылку и задаёт **одно глобальное локальное время**; врач как редактор контента главной этим не управляет — это глобальная операционная настройка канала.

### 1.5. FAB быстрого добавления в дневник — устаревшее поведение

Раньше в `AppShell` для пациента показывалась **плавающая кнопка** в углу экрана (`PatientQuickAddFAB`) для быстрого входа в сценарий дневника. Этот паттерн **снят с продукта** (компонент удалён из кодовой базы).

**Зафиксировано для следующих этапов:** не восстанавливать **плавающую кнопку в прежнем виде** (fixed bottom-right из общего shell). Сохранённые **`QuickAddPopup`** и **`GET /api/patient/diary/quick-add-context`** остаются основой для будущего расширенного добавления записей при **другом точке входа** в UX (например из блока самочувствия на главной), а не как обязательный FAB на всех экранах пациента.

---

## 2. Состав и роли

| Роль | Зона ответственности |
|---|---|
| Владелец продукта | Контент: тексты разделов, обложки, иконки, видео, выбор «Разминки дня», список ситуаций |
| Разработчик-агент | Все технические фазы (1–9) по этому ТЗ |
| Аудитор-агент | После каждой фазы: проверка по acceptance criteria + правилам репо |

**Разделение работ**: агенту-исполнителю **не назначается** Phase 0 (это для владельца). Агент начинает с Phase 1 и далее.

### 2.1. Абсолютное правило: slug-и из `CONTENT_PLAN.md` не хардкодить

Slug-и в `CONTENT_PLAN.md` (`office-work`, `face-self-massage`, `office-neck` и т.п.) — **не контракт приложения** и **не runtime-конфигурация**. Это редакционный ориентир для владельца контента: аккуратные URL, понятная структура CMS, список материалов для заполнения.

Запрещено:

- хардкодить slug-и из `CONTENT_PLAN.md` в React-компонентах, сервисах, route handlers, seed-логике или runtime-ветвлениях;
- делать `switch`/`case`, `if (slug === ...)`, маппинги `slug -> блок` или `slug -> иконка` по этим значениям;
- считать, что наличие конкретного slug-а определяет функциональность главной;
- использовать `CONTENT_PLAN.md` как источник runtime-данных.

Разрешено:

- использовать slug-и из `CONTENT_PLAN.md` как примеры в документации;
- использовать их как локальные fixture-значения внутри тестов, если тест проверяет generic-поведение и не требует именно этих slug-ов;
- использовать их владельцу контента при ручном создании CMS-разделов/материалов.

Runtime-источник главной:

- список блоков, видимость и порядок: `patient_home_blocks`;
- элементы внутри блоков: `patient_home_block_items`;
- данные разделов/материалов/курсов: `content_sections`, `content_pages`, `courses`;
- scalar-настройки: `system_settings`.

---

## 3. NOT IN SCOPE — явный список того, что НЕ делать

Эти пункты **запрещено** делать в рамках инициативы. Любой из них — отдельная инициатива/обсуждение.

1. **Платежи, биллинг, оплата подписок, оплата курсов.** Никаких ЮKassa / CloudPayments / Apple Pay / Google Pay. На старте **подписка — только визуальный бейдж**, контент остаётся открытым.
2. **Gating контента подпиской.** Подписочные разделы остаются доступными для просмотра. Никаких 401/403 по визуальному бейджу `По подписке`.
3. **Persona-таксономия как отдельная сущность БД.** Не заводим таблицу `personas`. «Ситуация» = обычный CMS-раздел (`content_sections`), добавленный админом в блок главной `situations`.
4. **Размещение главной на полях `content_sections`.** Запрещено добавлять `home_slot`, `home_sort_order`, `access_type` в `content_sections`. Размещение, порядок, видимость и состав блоков главной живут в отдельной настройке главной: `patient_home_blocks` + `patient_home_block_items`.
5. **Хардкод slug-ов из `CONTENT_PLAN.md`.** Запрещено добавлять runtime-логику, завязанную на конкретные slug-и из контент-плана. См. §2.1.
6. **Изменение модели курсов.** Сущности `courses`, `treatment_program_*` не меняем (см. правила TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md). Только новое поле `linked_course_id` у `content_pages`.
7. **Изменение существующих LFK-таблиц.** См. правило `clean-architecture-module-isolation.mdc` §1a.
8. **Изменение бот-сценариев SOS.** Используем существующий поток.
9. **Перенос Reels-аналитики, шаринга, генерации share-картинок** — отдельная инициатива.
10. **Mood с произвольной шкалой/категориями.** В этой инициативе только score 1–5.
11. **Расширение прав/ролей.** Не трогаем `requireRole`, `requireDoctorAccess` и т.п.
12. **Перерисовка кабинета врача.** Только пациент.
13. **Новые env-переменные.** Все новые настройки — в `system_settings` (`scope=admin`). См. `.cursor/rules/000-critical-integration-config-in-db.mdc` и `.cursor/rules/runtime-config-env-vs-db.mdc`.
14. **Изменение CI workflow** (`.github/workflows/ci.yml`).

---

## 4. Глоссарий

| Термин | Значение |
|---|---|
| **Блок главной** | Настраиваемая область страницы «Сегодня»: `daily_warmup`, `booking`, `situations`, `progress`, `next_reminder`, `mood_checkin`, `sos`, `plan`, `subscription_carousel`, `courses` |
| **Разминка дня** | Блок главной `daily_warmup`; содержит один или несколько материалов `content_pages`, первый видимый item показывается как большая hero-карточка |
| **Ситуация** | Раздел контента (`content_sections`), добавленный в блок `situations`; отображается как маленькая иконка в горизонтальном ряду |
| **Подписочная карусель** | Блок `subscription_carousel`; содержит CMS-разделы / материалы / курсы и показывает их горизонтальными карточками с бейджем |
| **SOS** | Блок `sos`; обычно содержит один материал или раздел с быстрыми рекомендациями при боли |
| **Настройка главной** | Отдельная admin-страница для управления видимостью/порядком блоков и списками материалов внутри блоков |
| **Стрик** | Количество последовательных дней (по timezone приложения), в которые у пользователя есть ≥1 запись `patient_practice_completions` |
| **Чек-ин самочувствия** | Запись `patient_daily_mood` со score 1..5; одна на пользователя в день (override переписывает) |
| **Промо-страница курса** | `content_pages.linked_course_id` указывает на курс; на странице материала — кнопка «Открыть курс» |
| **Ежедневное напоминание от бота** | Исходящее сообщение **пользователю в мессенджер** в заданное время (глобально на продукт), а не напоминание админу. Ключи `patient_home_morning_ping_*`; deeplink на главную / разминку; UI сохранения — у **admin** |
| **FAB дневника (устар.)** | Историческая плавающая кнопка в углу экрана из `AppShell`; **не использовать** в том же виде дальше. См. §1.5 |

---

## 5. Высокоуровневая архитектура решения

### 5.1. Изменения данных

**Изменения существующих таблиц:**

- `content_sections`:
  - `+ cover_image_url text NULL` — большая обложка раздела (например, карточка подписочной карусели)
  - `+ icon_image_url text NULL` — маленькая иконка раздела (например, ряд ситуаций)
- `content_pages`:
  - `+ linked_course_id uuid NULL` — FK на `courses(id) ON DELETE SET NULL`

**Новые таблицы:**

- `patient_home_blocks` — список блоков главной, их видимость и порядок.
- `patient_home_block_items` — элементы внутри блоков (CMS-материал, CMS-раздел, курс, static action), порядок, видимость и overrides.
- `patient_practice_completions` — отметки выполнения (для стрика и «N из M»).
- `patient_daily_mood` — чек-ин самочувствия 1–5.

**system_settings (scope=admin)** — новые ключи:

- `patient_home_daily_practice_target` — целевое число практик/день (number, default 3).
- `patient_home_morning_ping_enabled` — флаг утреннего пинга в боте (boolean, default false).
- `patient_home_morning_ping_local_time` — локальное время утреннего пинга в `HH:MM` (string, default `09:00`).

### 5.2. Изменения UI

- Полностью переписать `/app/patient/page.tsx` и компоненты в `apps/webapp/src/app/app/patient/home/`.
- Добавить расширенный layout-режим для `AppShell variant="patient"` или новый variant — для двух/трёхколоночной компоновки на десктопе.
- Добавить поля обложки/иконки в CMS-форму раздела.
- Добавить отдельную admin-страницу настройки главной с live preview блоков.

### 5.3. Изменения модулей

Новые модули webapp:

- `modules/patient-practice/` — выполнение практик и стрик.
- `modules/patient-mood/` — чек-ин самочувствия.
- `modules/patient-home/` — уже существует (`newsMotivation.ts`, `repository.ts`); расширить новой логикой витрины «Сегодня» и управления блоками.

Новые порты в `infra/repos/`:

- `pgPatientPracticeCompletions.ts`
- `pgPatientDailyMood.ts`
- `pgPatientHomeBlocks.ts`
- `pgPatientHomeBlockItems.ts`
- (расширить) `pgContentSections.ts`, `pgContentPages.ts` — поддержка новых полей.

**Важно по БД:** для всех новых сущностей этой инициативы runtime-доступ к БД должен идти через Drizzle ORM. Имена файлов `pgPatient...` допустимы как локальная naming convention infra-репозиториев, но внутри новых репозиториев запрещены `getPool()`, `pool.query(...)`, `client.query(...)` и ручной SQL. SQL допустим только в Drizzle migration files (`apps/webapp/db/drizzle-migrations/*.sql`) для DDL/check/FK/seed и в `ROLLBACK_SQL.md` как operational-инструкция отката.

---

## 6. Спецификация по фазам

Фазы выполняются **строго по порядку**. Каждая фаза:

- завершается проверками уровня, соответствующего scope фазы (см. `.cursor/rules/test-execution-policy.md`);
- завершается записью в `LOG.md` (создать при начале работ);
- может быть проверена аудитором отдельно.

**Полный `pnpm run ci` не запускать после каждой фазы.** Это дорого и противоречит repo policy. Full CI нужен только:

- в Phase 9 как финальный release/pre-push rehearsal;
- перед фактическим `push`;
- если конкретная фаза меняет repo-level scope: lockfile, root config, CI workflow, shared tooling, cross-app contracts. В этой инициативе штатно почти все фазы — webapp-only, кроме Phase 8 (webapp + integrator), где сначала использовать phase-level проверки обоих приложений.

---

### Phase 0 — Контент и графика (владелец, не агент)

**Зона ответственности:** владелец продукта. Агент-исполнитель не выполняет, но проверяет наличие артефактов перед стартом Phase 1.

#### 0.1. Артефакты (4 таблицы)

Владелец готовит и сохраняет в этой же папке файлы (или CSV/таблицы в любом удобном виде; ниже — рекомендуемый формат markdown в `CONTENT_PLAN.md`):

**Таблица A. Ситуации (бесплатные):**

| slug | Название | Краткое описание | Идея иконки | Кол-во готовых видео | Slug первого/главного материала |
|---|---|---|---|---|---|

Минимально стартовать с разделов: `office`, `neck-shoulders`, `back-low-back`, `breathing`, `mom`, `antistress-sleep`, `pain-now`. Если по разделу нет хотя бы 1 видео — раздел временно НЕ публикуется (`is_visible=false`).

**Таблица B. Подписочная карусель:**

| slug | Название | Сколько материалов | Превью-картинка (имя файла) | Слоган |
|---|---|---|---|---|

**Таблица C. Большие курсы:**

| Идентификатор курса (slug) | Название | Результат для пациента | Длительность | Промо-материалы (slug content_pages) |
|---|---|---|---|---|

Старт: один курс — `back-and-neck-recovery` («Здоровая спина и шея»).

**Таблица D. Разминка дня:**

| Slug материала | Кандидат на старте | Замены через 1–2 недели |
|---|---|---|

#### 0.2. Графика

- 6–7 обложек разделов (`cover_image_url`).
- 6–7 иконок ситуаций (`icon_image_url`) — в одном визуальном стиле.
- 1 hero-картинка для «Разминки дня» + 2 запасных (используется как `image_url` у материала).
- 3 превью для подписочной карусели.
- 1 превью для курса спины (на странице курса/промо).

Форматы:

- Обложка раздела (карусель/фон): **4:3 или 16:9, ~1200×900**, JPG/PNG/WebP.
- Иконка раздела (ряд ситуаций): **квадратная, ~512×512**, прозрачный фон допустим, PNG/SVG (если SVG — webapp загружает как файл, без серверного рендера; при невозможности — PNG).
- Hero «Разминки дня»: **4:3 или 16:9, ~1200×900**.
- Карточка карусели подписки: **3:4 (портрет), ~900×1200**.
- Превью материала: **16:9, ~1200×675**.

#### 0.3. Загрузка файлов

Все файлы **загружаются через CMS-медиатеку** (CMS → раздел медиа). Никаких отдельных папок в репозитории/S3 вне библиотеки. После загрузки они автоматически доступны как `/api/media/{uuid}` и выбираются в формах через `MediaLibraryPickerDialog`.

#### 0.4. Acceptance Phase 0

- Все 4 таблицы заполнены и положены в `docs/PATIENT_HOME_REDESIGN_INITIATIVE/CONTENT_PLAN.md`.
- В медиатеке загружены: ≥6 обложек, ≥6 иконок, ≥3 hero, ≥3 превью карусели.

Phase 0 не блокирует **полностью** Phase 1: разработчик может начать делать миграции и формы CMS параллельно. Но без артефактов Phase 0 нельзя финализировать Phase 3 (не на чем тестировать).

---

### Phase 1 — БД и CMS: медиа разделов + настройка блоков главной

**Цель:** добавить разделам CMS только обложку и иконку, а управление главной вынести в отдельную admin-страницу с блоками, предпросмотром и списками элементов. Без изменений клиентской главной пациента.

**Ключевой принцип:** `content_sections` не знает, где он показан на главной. Раздел — это контентная сущность. Главная — отдельная витрина (`patient_home_blocks` + `patient_home_block_items`).

#### 1.1. Drizzle schema

Файл: `apps/webapp/db/schema/schema.ts` — таблица `contentSections`. Добавить только медиа-поля:

```ts
coverImageUrl: text("cover_image_url"),
iconImageUrl: text("icon_image_url"),
```

Никаких `home_slot`, `home_sort_order`, `access_type` в `content_sections`.

Добавить новые таблицы:

```ts
export const patientHomeBlocks = pgTable("patient_home_blocks", {
  code: text("code").primaryKey().notNull(),
  title: text("title").notNull(),
  description: text("description").default("").notNull(),
  isVisible: boolean("is_visible").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
});

export const patientHomeBlockItems = pgTable("patient_home_block_items", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  blockCode: text("block_code").notNull(),
  targetType: text("target_type").notNull(),
  targetRef: text("target_ref").notNull(),
  titleOverride: text("title_override"),
  subtitleOverride: text("subtitle_override"),
  imageUrlOverride: text("image_url_override"),
  badgeLabel: text("badge_label"),
  isVisible: boolean("is_visible").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("idx_patient_home_block_items_block_sort").using("btree", table.blockCode.asc(), table.sortOrder.asc()),
]);
```

SQL FK/constraints в миграции:

```sql
ALTER TABLE patient_home_block_items
  ADD CONSTRAINT patient_home_block_items_block_fkey
  FOREIGN KEY (block_code) REFERENCES patient_home_blocks(code) ON DELETE CASCADE;

ALTER TABLE patient_home_block_items
  ADD CONSTRAINT patient_home_block_items_target_type_check
  CHECK (target_type IN ('content_page','content_section','course','static_action'));
```

`target_ref`:

- для `content_page` — `content_pages.slug`;
- для `content_section` — `content_sections.slug`;
- для `course` — `courses.id::text` или slug курса, если в текущей модели курса есть стабильный slug; агент обязан проверить фактическую схему `courses`;
- для `static_action` — один из: `booking`, `progress`, `next_reminder`, `mood_checkin`, `plan`.

FK на `content_pages`/`content_sections`/`courses` в `target_ref` **не делать**, потому что ссылка полиморфная. Валидировать в сервисном слое.

#### 1.2. Миграция

Сгенерировать `pnpm --dir apps/webapp run db:generate` (или эквивалент в проекте — см. EXECUTION_RULES.md TREATMENT_PROGRAM_INITIATIVE раздел «Правила Drizzle»). Следующий номер миграции — `0008_*`. Имя осмысленное (например `0008_patient_home_blocks.sql`).

Дополнить миграцию вручную:

- FK `patient_home_block_items.block_code`;
- CHECK `target_type`;
- seed фиксированных блоков:

```sql
INSERT INTO patient_home_blocks (code, title, description, is_visible, sort_order)
VALUES
  ('daily_warmup', 'Разминка дня', 'Главная hero-карточка с материалом дня', true, 10),
  ('booking', 'Запись на приём', 'Карточка записи и моих приёмов', true, 20),
  ('situations', 'Ситуации', 'Горизонтальный ряд иконок ситуаций', true, 30),
  ('progress', 'Прогресс', 'Сегодня выполнено и серия дней', true, 40),
  ('next_reminder', 'Следующее напоминание', 'Ближайшая практика по расписанию', true, 50),
  ('mood_checkin', 'Самочувствие', 'Оценка состояния 1–5', true, 60),
  ('sos', 'Если болит сейчас', 'Быстрый переход к SOS-материалам', true, 70),
  ('plan', 'Мой план', 'Активный курс/программа пациента', true, 80),
  ('subscription_carousel', 'Материалы по подписке', 'Карусель подписочных материалов', true, 90),
  ('courses', 'Курсы', 'Большие курсы', true, 100)
ON CONFLICT (code) DO NOTHING;
```

Проверка: `pnpm --dir apps/webapp run db:verify-public-table-count` и `drizzle-kit check`.

#### 1.3. Domain types и ports

Файл: `apps/webapp/src/infra/repos/pgContentSections.ts`. Расширить `ContentSectionRow` только медиа-полями:

```ts
export type ContentSectionRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  isVisible: boolean;
  requiresAuth: boolean;
  // NEW
  coverImageUrl: string | null;
  iconImageUrl: string | null;
};
```

Расширить `upsert` и `update` только `coverImageUrl`/`iconImageUrl`.

Создать новый модуль:

- `apps/webapp/src/modules/patient-home/blocks.ts`
- `apps/webapp/src/modules/patient-home/ports.ts`
- `apps/webapp/src/modules/patient-home/patient-home.md`

Контракт порта:

```ts
export type PatientHomeBlockCode =
  | "daily_warmup"
  | "booking"
  | "situations"
  | "progress"
  | "next_reminder"
  | "mood_checkin"
  | "sos"
  | "plan"
  | "subscription_carousel"
  | "courses";

export type PatientHomeBlockItemTargetType =
  | "content_page"
  | "content_section"
  | "course"
  | "static_action";

export type PatientHomeBlock = {
  code: PatientHomeBlockCode;
  title: string;
  description: string;
  isVisible: boolean;
  sortOrder: number;
  items: PatientHomeBlockItem[];
};

export type PatientHomeBlockItem = {
  id: string;
  blockCode: PatientHomeBlockCode;
  targetType: PatientHomeBlockItemTargetType;
  targetRef: string;
  titleOverride: string | null;
  subtitleOverride: string | null;
  imageUrlOverride: string | null;
  badgeLabel: string | null;
  isVisible: boolean;
  sortOrder: number;
};

export type PatientHomeBlocksPort = {
  listBlocksWithItems(): Promise<PatientHomeBlock[]>;
  setBlockVisibility(code: PatientHomeBlockCode, visible: boolean): Promise<void>;
  reorderBlocks(orderedCodes: PatientHomeBlockCode[]): Promise<void>;
  addItem(input: Omit<PatientHomeBlockItem, "id" | "sortOrder"> & { sortOrder?: number }): Promise<string>;
  updateItem(id: string, patch: Partial<Pick<PatientHomeBlockItem, "titleOverride" | "subtitleOverride" | "imageUrlOverride" | "badgeLabel" | "isVisible" | "sortOrder">>): Promise<void>;
  deleteItem(id: string): Promise<void>;
  reorderItems(blockCode: PatientHomeBlockCode, orderedItemIds: string[]): Promise<void>;
};
```

Расширить `inMemoryContentSectionsPort` и `createInMemoryContentSectionsPort` (для тестов).

Создать `apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts` и in-memory реализацию для тестов.

`pgPatientHomeBlocks.ts` должен использовать Drizzle db/schema, а не `getPool()` и не `pool.query(...)`.

#### 1.4. CMS UI: форма раздела

Файл: `apps/webapp/src/app/app/doctor/content/sections/SectionForm.tsx`. Добавить только поля:

- **Обложка раздела** — `MediaLibraryPickerDialog kind="image"`, скрытое `<input name="cover_image_url">`.
- **Иконка раздела** — `MediaLibraryPickerDialog kind="image"`, скрытое `<input name="icon_image_url">`.

Серверная валидация в `apps/webapp/src/app/app/doctor/content/sections/actions.ts` (`saveContentSection`):

- URL должен быть пустой строкой или начинаться с `/api/media/` либо быть legacy absolute URL (использовать существующий `shared/lib/mediaUrlPolicy.ts`).

#### 1.5. Admin UI: отдельная страница настройки главной

Создать страницу:

- `apps/webapp/src/app/app/settings/patient-home/page.tsx` — доступ только admin (`requireRole admin` / существующий guard settings).
- title: `Главная пациента`.
- backHref: `/app/settings`.

Создать компоненты:

- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlocksSettingsPageClient.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockPreview.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockItemsDialog.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeAddItemDialog.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeReorderBlocksDialog.tsx`
- `apps/webapp/src/app/app/settings/patient-home/actions.ts`

Страница должна выглядеть как набор блоков, визуально похожих на будущий клиентский экран, но с admin-заголовком каждого блока:

```
┌────────────────────────────────────────────┐
│ Разминка дня                         ⋯     │  ← admin-заголовок
├────────────────────────────────────────────┤
│ [preview как у клиента, но item не кликается]│
└────────────────────────────────────────────┘
```

У каждого блока в правом верхнем углу меню `⋯`:

- `Показать / скрыть` — для всех блоков.
- `Добавить материал` — только для блоков с item-list: `daily_warmup`, `situations`, `subscription_carousel`, `courses`, `sos`.
- `Изменить` — только для блоков с item-list; открывает модалку со списком текущих items.

Отдельная кнопка над списком блоков:

- `Поменять порядок блоков` — открывает модалку со списком названий блоков, drag-drop, `Отменить` / `Сохранить`.

Поведение preview:

- Клик по материалу/иконке/карточке **ничего не делает** (admin preview only).
- Preview использует те же визуальные компоненты/классы, что клиентская главная, насколько возможно.
- Если item не может быть разрешён (удалённый материал/раздел/курс) — показать admin-warning внутри preview, но страницу не ронять.

Добавление item:

- Для `daily_warmup`: выбирать только `content_page`.
- Для `situations`: выбирать только `content_section`.
- Для `subscription_carousel`: выбирать `content_section`, `content_page`, `course`.
- Для `courses`: выбирать только `course`.
- Для `sos`: выбирать `content_section` или `content_page`.
- Список выбора — модалка в стиле существующих CMS-списков: поиск, плоский список, превью/миниатюра, кнопка `Добавить`.
- Для CMS-материалов использовать `content_pages.title`, `summary`, `image_url`.
- Для CMS-разделов использовать `content_sections.title`, `description`, `icon_image_url` или `cover_image_url`.
- Для курсов использовать текущие поля `courses` (агент обязан проверить схему).

Изменение item-list:

- Модалка со списком текущих items.
- Drag-drop или уже существующий шаблон reorder-списка в проекте; если drag-drop компонента нет, использовать кнопки `↑`/`↓` как fallback, но в `LOG.md` явно отметить fallback.
- У каждого item: иконка-глаз `показать/скрыть`, удалить, drag handle.
- Кнопки `Отменить` / `Сохранить`.

#### 1.6. Страница CMS-разделов: показ нового состояния

Файл: `apps/webapp/src/app/app/doctor/content/sections/ContentSectionsListClient.tsx`. В строке раздела отобразить:

- если есть обложка/иконка — маленькие миниатюры через существующий `MediaThumb`.

Не показывать на странице разделов бейджи размещения на главной: теперь это живёт в `/app/settings/patient-home`.

#### 1.7. Тесты

Минимум:

- `apps/webapp/src/infra/repos/pgContentSections.test.ts` — расширить:
  - upsert+get новых полей,
  - listVisible не отбрасывает новые поля.
- `apps/webapp/src/app/app/doctor/content/sections/SectionForm.test.tsx` (новый, аналог существующего `ContentForm.test.tsx`):
  - рендер обложки и иконки,
  - submit передаёт значения в server action.
- `apps/webapp/src/infra/repos/pgPatientHomeBlocks.test.ts`:
  - list seeded blocks,
  - add/update/delete item,
  - reorder blocks,
  - reorder items.
  - статически/через smoke убедиться, что реализация не использует `getPool` / `pool.query`.
- `apps/webapp/src/app/app/settings/patient-home/actions.test.ts`:
  - toggle block visibility,
  - add item with invalid block code → error,
  - add item with invalid target type → error,
  - reorder items чужого block → error.
- RTL-тесты admin UI:
  - блоки рендерятся,
  - меню `⋯` содержит правильные действия,
  - item preview не является ссылкой/кликабельным элементом.

#### 1.8. Acceptance Phase 1

- Миграция `0008_*` применяется на чистой БД и на dev/prod без ошибок (включая backfill).
- В CMS у раздела можно задать обложку и иконку.
- Сохранение работает, страница `/app/doctor/content/sections` отображает миниатюры.
- `/app/settings/patient-home` показывает все seeded-блоки.
- На странице настройки главной можно: скрыть/показать блок, поменять порядок блоков, добавить item в блок, открыть модалку изменения items, скрыть/показать item, удалить item, поменять порядок items.
- Phase-level webapp checks проходят: targeted tests для новых/изменённых файлов, `pnpm --dir apps/webapp typecheck`, `pnpm --dir apps/webapp lint`, `pnpm test:webapp` при завершении фазы.
- Full CI (`pnpm run ci`) не требуется на Phase 1, если не было repo-level изменений.

#### 1.9. Что НЕ делать в Phase 1

- НЕ переписывать главную пациента.
- НЕ добавлять никаких ALLOWED_KEYS.
- НЕ трогать `content_pages`.
- НЕ менять архитектуру курсов.
- НЕ добавлять `home_slot`, `home_sort_order`, `access_type` в `content_sections`.

---

### Phase 2 — Промо-материал курса + целевые настройки главной

**Цель:** связать промо-материал с курсом и добавить только числовые/служебные настройки главной. Выбор «Разминки дня» уже делается через admin-страницу `/app/settings/patient-home` и block item `daily_warmup`, а не через `system_settings`.

#### 2.1. Schema: `content_pages.linked_course_id`

Файл: `apps/webapp/db/schema/schema.ts` — таблица `contentPages`. Добавить:

```ts
linkedCourseId: uuid("linked_course_id"),
```

В SQL миграции:

```sql
ALTER TABLE content_pages
  ADD COLUMN linked_course_id uuid;

ALTER TABLE content_pages
  ADD CONSTRAINT content_pages_linked_course_fkey
  FOREIGN KEY (linked_course_id) REFERENCES courses(id) ON DELETE SET NULL;

CREATE INDEX idx_content_pages_linked_course ON content_pages (linked_course_id);
```

Миграция `0009_*`.

#### 2.2. Repo и форма

`apps/webapp/src/infra/repos/pgContentPages.ts`:

- Добавить `linkedCourseId: string | null` в `ContentPageRow` и в `mapRow`.
- Расширить `upsert` и патч `updateLifecycle` (если требуется update без full upsert).

`apps/webapp/src/app/app/doctor/content/ContentForm.tsx`:

- Добавить `<select name="linked_course_id">` с пустым значением и списком published `courses`. Подгружать список через server-side prop в страницу формы.
- Подпись: `Связан с курсом (если это промо-материал)`.

`apps/webapp/src/app/app/doctor/content/actions.ts`:

- В `saveContentPage` принять `linked_course_id` (UUID или пусто), валидация `z.string().uuid().nullable()`.

#### 2.3. UI на странице материала пациенту

Файл: `apps/webapp/src/app/app/patient/content/[slug]/page.tsx`.

Если у материала `linkedCourseId !== null` и курс существует и опубликован — внизу страницы карточка-CTA:

> **Это часть курса «<название курса>»**  
> [Открыть курс] → ссылка на страницу курса (если уже куплен — на конкретный экземпляр программы; иначе на каталог курсов с подсветкой нужного).

Если курс не найден / не опубликован — блок не отображается (без ошибок).

#### 2.4. system_settings: служебные настройки главной

##### 2.4.1. ALLOWED_KEYS

Файл: `apps/webapp/src/modules/system-settings/types.ts`. В массив `ALLOWED_KEYS` добавить:

```ts
"patient_home_daily_practice_target",
```

##### 2.4.2. ADMIN_SCOPE_KEYS

Файл: `apps/webapp/src/app/api/admin/settings/route.ts`. В массив `ADMIN_SCOPE_KEYS` добавить тот же единственный ключ:

```ts
"patient_home_daily_practice_target",
```

##### 2.4.3. UI (Settings)

Файл: `apps/webapp/src/app/app/settings/patient-home/page.tsx` или `apps/webapp/src/app/app/settings/AppParametersSection.tsx` (предпочтительно на новой странице настройки главной рядом с блоками). Добавить поле:

- Поле `patient_home_daily_practice_target` — `<input type="number" min=1 max=10>`. Default 3.
- Подсказка: «Сколько коротких практик в день показывать как цель прогресса».

#### 2.5. Сервис чтения

Новый файл: `apps/webapp/src/modules/patient-home/todayConfig.ts`:

```ts
export async function getPatientHomeTodayConfig(deps: AppDeps): Promise<{
  dailyWarmupItem: ResolvedPatientHomeBlockItem | null;
  practiceTarget: number;
}>;
```

- Читает блок `daily_warmup` из `patient_home_blocks`/`patient_home_block_items`.
- Берёт первый видимый item блока `daily_warmup`, отсортированный по `sortOrder`.
- Разрешает item в `content_page`; если target удалён/не опубликован — `dailyWarmupItem = null`.
- `practiceTarget` — из `patient_home_daily_practice_target`, default 3.

Использовать в Phase 3.

#### 2.6. Тесты

- `apps/webapp/src/infra/repos/pgContentPages.test.ts` — upsert/get с `linkedCourseId`.
- `apps/webapp/src/app/app/doctor/content/actions.test.ts` — валидация `linked_course_id` (валидный UUID, пустой, мусор).
- `apps/webapp/src/modules/patient-home/todayConfig.test.ts` — все ветви: блок пустой, item есть и материал найден, item есть но материал удалён/не опубликован.
- `apps/webapp/src/modules/system-settings/types.test.ts` (если есть) или `apps/webapp/src/modules/system-settings/service.test.ts` — что новые ключи в whitelist.

#### 2.7. Acceptance Phase 2

- Админ выбирает «Разминку дня» через `/app/settings/patient-home` → блок `daily_warmup` → `Добавить материал`.
- Можно сохранить `practiceTarget` (1..10).
- Врач может связать материал с курсом в CMS.
- На странице материала с `linkedCourseId` показана CTA-карточка курса.
- Phase-level webapp checks зелёные; full CI не требуется, если не было repo-level изменений.

#### 2.8. Что НЕ делать

- Не добавлять `patient_home_daily_warmup_page_slug`.
- Не добавлять ключи утреннего пинга (`patient_home_morning_ping_enabled`, `patient_home_morning_ping_local_time`) — они относятся к Phase 8.
- Не делать второй UI выбора разминки дня в `AppParametersSection`.
- Не модифицировать модель курсов.

---

### Phase 3 — Главная пациента: мобильный layout

**Цель:** заменить текущую главную на новую витрину «Сегодня» в мобильной разметке (одна колонка). Без новых сущностей выполнения и mood — там, где они нужны, **рендерим заглушки** (статический текст).

#### 3.1. Файлы

Полностью переписать:

- `apps/webapp/src/app/app/patient/page.tsx`.

Заменить/удалить:

- `apps/webapp/src/app/app/patient/home/PatientMiniAppPatientHome.tsx` — удалить (переехать в новый общий компонент).
- `apps/webapp/src/app/app/patient/home/PatientHomeBrowserHero.tsx` — удалить.
- `apps/webapp/src/app/app/patient/home/PatientHomeExtraBlocks.tsx` — удалить (в текущем коде он пустой).
- ~~`apps/webapp/src/app/app/patient/home/PatientHomeLessonsSection.tsx`~~ — **удалён из репозитория (2026-05-04)**; блок «уроки»/каталог разделов на главной при появлении — новая реализация (ориентир: `/app/patient/sections` и `FeatureCard` в `apps/webapp/src/shared/ui/FeatureCard.tsx`).

Создать:

- `apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx` — корневой компонент новой главной (server component).
- `apps/webapp/src/app/app/patient/home/PatientHomeGreeting.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeDailyWarmupCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeBookingCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSituationsRow.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.tsx` (заглушка в Phase 3)
- `apps/webapp/src/app/app/patient/home/PatientHomeNextReminderCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeMoodCheckin.tsx` (заглушка в Phase 3)
- `apps/webapp/src/app/app/patient/home/PatientHomeSosCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomePlanCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.tsx`

#### 3.2. Поведение по сессии

Важно по текущей архитектуре `/app/patient`: в Phase 3 `patient/layout.tsx` всё ещё редиректит пользователя без сессии на вход. Поэтому строка «Гость» ниже описывает **целевой non-personal UI-режим**, а не требование открыть `/app/patient` анонимно в Phase 3. На практике в Phase 3 этот режим чаще соответствует авторизованному пользователю без активного patient-tier (`personalTierOk === false`). Настоящая публичная главная без сессии вынесена в отдельную Phase 4.5.

| Состояние | Что показываем |
|---|---|
| Non-personal mode (без patient-tier; после Phase 4.5 также anonymous guest) | Greeting → DailyWarmupCard (из настройки админа; кнопка «Войти, чтобы отмечать прогресс») → BookingCard → SituationsRow → SosCard → SubscriptionCarousel. Никаких персональных данных. |
| Авторизован, без tier `patient` | То же + кнопка «Активировать профиль» в BookingCard. |
| Авторизован, tier `patient` | Полный набор блоков + персональные (PlanCard, NextReminderCard). |

#### 3.3. Источники данных

- **DailyWarmupCard:** `getPatientHomeTodayConfig(deps)` (Phase 2). Берёт первый видимый item блока `daily_warmup`. Если item отсутствует или target не разрешился — карточка показывает мягкий fallback «Скоро здесь появится разминка дня».
- **SituationsRow:** блок `situations` из `patient_home_blocks`. Каждый item должен быть `targetType='content_section'`. Ссылка на `/app/patient/sections/<slug>`. Иконка из `content_sections.iconImageUrl` или `item.imageUrlOverride`. Если URL отсутствует — fallback-`<div>` с инициалом названия.
- **SubscriptionCarousel:** блок `subscription_carousel`. Items могут быть `content_section`, `content_page`, `course`. Карточка показывает `imageUrlOverride` или целевую обложку (`coverImageUrl`/`imageUrl`), `titleOverride` или target title, бейдж `badgeLabel` или default `По подписке`.
- **SosCard:** блок `sos`; берём первый видимый item. Если item отсутствует или target не разрешился — карточка не рендерится.
- **NextReminderCard:** `deps.reminders.listRulesByUser(userId)` → выбрать ближайшее по расписанию. Алгоритм:
  - проходим все enabled rules с `linkedObjectType IN ('lfk_complex','content_section','content_page')`;
  - вычисляем «следующее время срабатывания» относительно сейчас и `daysMask`/`windowStartMinute`/`windowEndMinute` в timezone приложения (`getAppDisplayTimeZone`);
  - выбираем минимальное;
  - если ни одного нет — карточка не рендерится.
  - **NB:** если эта логика тяжёлая, в Phase 3 допустимо упрощённо: брать «самое свежее обновлённое правило» как «следующее напоминание» с пометкой «По расписанию». Точная логика закреплена за Phase 8 (см. RISKS).
- **PlanCard:** `deps.treatmentProgramInstance.listForPatient(userId)` → последний `active`. Если нет — карточка не рендерится.
- **BookingCard:** ссылка на `/app/patient/booking` и `/app/patient/cabinet`. Без серверного запроса.

#### 3.4. Layout

- Используем `AppShell variant="patient"` (узкая колонка). На моб. ширинах оставляем как есть.
- На `md+` главная остаётся узкой (1 колонка) — двухколоночный layout появится в Phase 4.
- Все блоки разделены вертикальным гэпом 24px (Tailwind `gap-6`).
- Карточки — `rounded-2xl border border-border bg-card shadow-sm` (как существующие `routePaths.cabinet`-карточки).

#### 3.5. Тесты

- `apps/webapp/src/app/app/patient/home/PatientHomeToday.test.tsx` — гость и пациент-сценарии (mocked deps), проверяем какие блоки рендерятся.
- `apps/webapp/src/app/app/patient/home/PatientHomeSituationsRow.test.tsx` — пустой список → не рендерится; с данными → корректный список + ссылки.
- `apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx` — то же.
- Snapshot/RTL-тест целой главной в трёх состояниях (anonymous guest / без tier / patient) желателен, но после AUDIT Phase 3 переносится в Phase 4.5, чтобы не тестировать публичный режим до изменения auth/layout.

#### 3.6. Acceptance Phase 3

- На мобильном экран соответствует мобильному макету пользователя (один из трёх присланных, узкий с кнопкой «Записаться»).
- На десктопе временно одна колонка — НЕ хуже, чем сейчас.
- Глобальная навигация (нижняя/шапка) не сломана.
- Удалены deprecated компоненты (`PatientMiniAppPatientHome`, `PatientHomeBrowserHero`, `PatientHomeExtraBlocks`).
- Phase-level webapp checks зелёные; full CI не требуется, если не было repo-level изменений.

#### 3.7. Что НЕ делать

- Не реализовывать реальный progress / mood / streak (заглушки).
- Не делать gating подписочных секций.
- Не трогать `/app/patient/sections/[slug]` (страницы разделов).

---

### Phase 4 — Главная пациента: планшет и десктоп

**Цель:** двухколоночная компоновка для `md+` (как на десктопном макете пользователя).

#### 4.1. Variant `AppShell`

Файл: `apps/webapp/src/shared/ui/AppShell.tsx`. Добавить опцию более широкого контейнера для пациента:

- `variant="patient-wide"` или новый параметр `wide?: boolean`.
- Действует только на `lg+` (≥1024px), max-w-5xl или max-w-6xl. На `md` остаётся 1 колонка узкая.

Применять `variant="patient-wide"` ТОЛЬКО на `/app/patient/page.tsx` (главная). Все остальные пациентские маршруты — по-прежнему `variant="patient"` (узко).

#### 4.2. Сетка главной

В `PatientHomeToday.tsx` ввести two-column grid на `lg+`:

```
┌────────────────────────────────────┐
│ Greeting                            │
├──────────────────┬─────────────────┤
│ DailyWarmupCard  │ BookingCard      │
│                  │ NextReminderCard │
│ SituationsRow    │ SosCard          │
│ ProgressBlock    │ MoodCheckin      │
│ PlanCard         │                  │
│ SubscriptionCarousel (full width)   │
└────────────────────────────────────┘
```

Конкретное распределение:

- **Левая колонка** (≈ 60% ширины): DailyWarmupCard, SituationsRow, ProgressBlock, PlanCard.
- **Правая колонка** (≈ 40%): BookingCard, NextReminderCard, SosCard, MoodCheckin.
- **Полноширинно (под ними):** SubscriptionCarousel.

На `md` (768–1023): одна колонка как в Phase 3.

#### 4.3. Тесты

- Visual regression / snapshot тестирование на трёх размерах (375, 768, 1280 px) — если в репозитории есть playwright/storybook, использовать. Если нет — ограничиться snapshot-RTL для разных классов layout.

#### 4.4. Acceptance Phase 4

- На `lg+` главная имеет две колонки + полноширинную карусель внизу.
- Все ссылки работают.
- Существующие пациентские маршруты не получили `variant="patient-wide"`.
- Phase-level webapp checks зелёные; full CI не требуется, если не было repo-level изменений.

#### 4.5. Что НЕ делать

- Не менять остальные пациентские страницы.

---

### Phase 4.5 — Публичная главная пациента и auth-on-drilldown

**Цель:** открыть точный маршрут `/app/patient` как публичную витрину/полезный вход без сессии, но оставить авторизацию обязательной при проваливании во внутренние страницы и персональные действия.

Эта фаза выполняется после Phase 4, когда мобильный и desktop layout главной стабилизированы. Не смешивать с Phase 5/6, чтобы progress/mood не перепутались с auth-логикой.

#### 4.5.1. Route/layout policy

Файлы-кандидаты:

- `apps/webapp/src/app/app/patient/layout.tsx`
- `apps/webapp/src/app/app/patient/page.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx`
- `apps/webapp/src/modules/platform-access/patientRouteApiPolicy.ts` и тесты, если policy лучше вынести в helper.

Требования:

- Разрешить отсутствие сессии **только** для точного pathname `/app/patient` (query вроде `?from=morning_ping` допустим).
- Все внутренние маршруты `/app/patient/...` без сессии продолжают редиректить на вход с корректным `next`.
- `page.tsx` не должен вызывать `redirect` при `!session` для точного `/app/patient`; вместо этого рендерит non-personal UI.
- `PatientHomeToday` должен принимать `session: AppSession | null`.
- При `session === null`:
  - `personalTierOk=false`;
  - `canViewAuthOnlyContent=false`;
  - не выполнять персональные запросы (`reminders.listRulesByUser`, `treatmentProgramInstance.listForPatient`, progress/mood после Phase 5/6);
  - не показывать имя пользователя и персональные блоки.

#### 4.5.2. Auth-on-drilldown UX

- Клик в раздел/материал/курс/личное действие с публичной главной должен приводить к авторизации перед внутренней страницей.
- Допустимо полагаться на redirect из `patient/layout.tsx` для внутренних `/app/patient/...`.
- Для явных CTA лучше сразу использовать login/start href с `next`, если в проекте уже есть такой helper; не изобретать новый auth-flow.
- Тексты для гостя: «Войти, чтобы отмечать прогресс», «Войти, чтобы открыть материал», «Войти, чтобы записаться» — без обещания доступа к персональным данным до входа.

#### 4.5.3. Media caveat

Не менять безопасность `GET /api/media/:id` в этой фазе. Сейчас CMS-медиа может требовать активную сессию; публичная главная должна мягко деградировать без изображений (fallback-иконки/инициалы/градиенты), если защищённые media URL недоступны анониму. Публичная отдача отдельных ассетов — отдельное продуктово-безопасностное решение, не часть Phase 4.5.

#### 4.5.4. Тесты

- Тест policy/layout helper: exact `/app/patient` без сессии разрешён, `/app/patient/sections/x` и другие внутренние маршруты без сессии редиректят на вход.
- `PatientHomeToday`/page-level RTL или snapshot:
  - anonymous guest: видны только публичные/non-personal блоки, нет имени, нет персональных запросов;
  - authorized без tier: аналогичный non-personal набор + activation CTA;
  - patient: полный набор блоков.
- Регрессия: остальные patient routes не стали публичными.

#### 4.5.5. Acceptance Phase 4.5

- `/app/patient` открывается без сессии и не падает на персональных данных.
- `/app/patient/...` без сессии редиректит на вход с `next`.
- Главная не хардкодит slug-и из `CONTENT_PLAN.md`.
- Protected media не раскрыты публично.
- Phase-level webapp checks зелёные.

#### 4.5.6. Что НЕ делать

- Не открывать публично `/app/patient/sections/*`, `/app/patient/content/*`, кабинет, дневник, покупки, reminders, messages.
- Не менять auth cookies/session модель.
- Не менять `/api/media/:id` access policy.
- Не добавлять платежи/gating.

---

### Phase 5 — Прогресс выполнения и стрик

**Цель:** заменить заглушку `PatientHomeProgressBlock` реальными данными. Добавить кнопку «Готово» на странице материала.

#### 5.1. Schema: `patient_practice_completions`

Файл: новый schema `apps/webapp/db/schema/patientPractice.ts` (или добавить в существующий, если применимо). Таблица:

```ts
export const patientPracticeCompletions = pgTable("patient_practice_completions", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: uuid("user_id").notNull(),  // ← canonical platform user id (см. PLATFORM_IDENTITY)
  contentPageId: uuid("content_page_id").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  source: text().notNull(), // 'home' | 'reminder' | 'section_page' | 'daily_warmup'
  feeling: smallint(),       // 1..5 nullable
  notes: text().default("").notNull(),
}, (table) => [
  index("idx_ppc_user_completed_desc").using("btree", table.userId.asc(), table.completedAt.desc()),
  index("idx_ppc_user_page").using("btree", table.userId.asc(), table.contentPageId.asc()),
]);
```

Миграция `0010_*`.

CHECK-констрейнты в SQL:

```sql
ALTER TABLE patient_practice_completions
  ADD CONSTRAINT ppc_source_check CHECK (source IN ('home','reminder','section_page','daily_warmup'));

ALTER TABLE patient_practice_completions
  ADD CONSTRAINT ppc_feeling_check CHECK (feeling IS NULL OR feeling BETWEEN 1 AND 5);

ALTER TABLE patient_practice_completions
  ADD CONSTRAINT ppc_content_page_fkey FOREIGN KEY (content_page_id)
  REFERENCES content_pages(id) ON DELETE CASCADE;
```

**FK `user_id`:** не делать (canonical user id живёт в нескольких таблицах; политика проекта — без FK на `users` в нерод-сущностях; см. PLATFORM_IDENTITY_SPECIFICATION). Контроль — в сервисе.

#### 5.2. Module и port

Создать:

- `apps/webapp/src/modules/patient-practice/types.ts`
- `apps/webapp/src/modules/patient-practice/ports.ts`:
  ```ts
  export type PatientPracticePort = {
    record(input: { userId: string; contentPageId: string; source: PracticeSource; feeling?: number | null }): Promise<{ id: string }>;
    countToday(userId: string, tz: string): Promise<number>;
    streak(userId: string, tz: string): Promise<number>;
    /** Последние N completions (для аналитики/будущих экранов) */
    listRecent(userId: string, limit: number): Promise<CompletionRow[]>;
  };
  ```
- `apps/webapp/src/modules/patient-practice/service.ts`:
  ```ts
  export function createPatientPracticeService(port: PatientPracticePort) {
    return {
      async record(...) { ... },
      async getProgress(userId: string, tz: string, target: number) {
        const [todayDone, streak] = await Promise.all([port.countToday(userId, tz), port.streak(userId, tz)]);
        return { todayDone, todayTarget: target, streak };
      },
    };
  }
  ```
- `apps/webapp/src/infra/repos/pgPatientPracticeCompletions.ts`:
  - `record` — Drizzle `insert`.
  - `countToday` — Drizzle query через injected db. Если для timezone/date выражения нужен SQL fragment Drizzle (`sql\\`...\\``), он допустим только внутри Drizzle builder, не через `pool.query`.
  - `streak` — простой алгоритм: достать distinct dates последних 60 дней, считать последовательные дни до сегодня (или до вчера, если сегодня ещё нет).
  - `listRecent` — limit/order by completed_at desc.
- `apps/webapp/src/infra/repos/inMemoryPatientPracticeCompletions.ts` — для тестов.

DI: `apps/webapp/src/app-layer/di/buildAppDeps.ts` — добавить `patientPractice`.

#### 5.3. API

Новые маршруты:

- `POST /api/patient/practice/completion`
  - body Zod: `{ contentPageId: string (uuid), source: 'home'|'reminder'|'section_page'|'daily_warmup', feeling?: 1..5 }`.
  - guard: `requirePatientAccessWithPhone`.
  - вызывает `deps.patientPractice.record({ userId: session.user.userId, ... })`.
  - response: `{ ok: true, id }`.
- `GET /api/patient/practice/progress`
  - guard: `requirePatientAccessWithPhone`.
  - response: `{ todayDone, todayTarget, streak }`.

route.ts — тонкие. Бизнес-логика только в сервисе.

#### 5.4. UI

##### 5.4.1. Кнопка «Готово»

Файл: `apps/webapp/src/app/app/patient/content/[slug]/page.tsx` (или соседний клиентский компонент). После видео — клиентский блок:

```
[Я выполнил(а) практику]
```

После клика — модалка / inline-форма:

```
Как самочувствие после?
😣 1   😕 2   😐 3   🙂 4   😄 5
[Сохранить]   [Пропустить]
```

POST в `/api/patient/practice/completion` с `source='section_page'` или `'daily_warmup'` (если открыто с главной — передавать через query `?from=daily_warmup`).

##### 5.4.2. PatientHomeProgressBlock

Файл: `apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.tsx`.

Server component:

- читает `practiceTarget` (Phase 2) и `progress` через `deps.patientPractice.getProgress(userId, tz, target)`;
- рендерит `1 из 3` + полоса прогресса + кружок «N дней подряд» с пиктограммой огонька.

Если `userId` отсутствует (гость) — рендерит мягкую плашку «Войдите, чтобы отслеживать прогресс».

#### 5.5. Тесты

- `apps/webapp/src/modules/patient-practice/service.test.ts`.
- `apps/webapp/src/infra/repos/pgPatientPracticeCompletions.test.ts` (in-memory).
- `apps/webapp/src/app/api/patient/practice/completion/route.test.ts`:
  - 401 без сессии,
  - 400 на мусор,
  - 200 + `{ok:true,id}`.
- `apps/webapp/src/app/api/patient/practice/progress/route.test.ts`.
- `apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.test.tsx`.

#### 5.6. Acceptance Phase 5

- Кнопка «Готово» работает на странице материала.
- Прогресс на главной показывает реальные числа.
- Стрик корректно считается (подтверждается тестом на синтетических данных за несколько дней).
- Phase-level webapp checks зелёные; full CI не требуется, если не было repo-level изменений.

#### 5.7. Что НЕ делать

- Не менять структуру записей в дневнике симптомов / ЛФК.
- Не привязывать completions автоматически к LFK-сессиям.
- Не делать gamification (badges, achievements) — отдельная инициатива.

---

### Phase 6 — Чек-ин самочувствия

**Цель:** заменить заглушку `PatientHomeMoodCheckin` и сохранить запись в БД.

#### 6.1. Schema: `patient_daily_mood`

```ts
export const patientDailyMood = pgTable("patient_daily_mood", {
  userId: uuid("user_id").notNull(),
  moodDate: date("mood_date").notNull(),
  score: smallint().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.moodDate] }),
  check("pdm_score_check", sql`score BETWEEN 1 AND 5`),
]);
```

Миграция `0011_*`.

`mood_date` — локальная дата по `getAppDisplayTimeZone()`. Хранится как `date` без TZ; вычисление даты — на стороне сервиса.

#### 6.2. Module и port

- `modules/patient-mood/ports.ts`:
  ```ts
  export type PatientMoodPort = {
    upsertToday(userId: string, tz: string, score: number): Promise<{ moodDate: string; score: number }>;
    getToday(userId: string, tz: string): Promise<{ score: number; moodDate: string } | null>;
  };
  ```
- `modules/patient-mood/service.ts` — обёртки.
- `infra/repos/pgPatientDailyMood.ts` — реализация через Drizzle (`insert(...).onConflictDoUpdate(...)`), без `pool.query`.
- `infra/repos/inMemoryPatientDailyMood.ts`.
- DI: `buildAppDeps.ts` → `patientMood`.

#### 6.3. API

- `POST /api/patient/mood` — body `{ score: 1..5 }`. guard `requirePatientAccessWithPhone`.
- `GET /api/patient/mood/today` — guard тот же.

#### 6.4. UI

`PatientHomeMoodCheckin.tsx`:

- 5 emoji-кнопок 1..5.
- При сохранённом score сегодня — подсветка выбранного + текст «Записано» + ссылка «Изменить».
- На клик — POST. Optimistic update; на ошибку — toast «Не удалось сохранить, попробуйте позже».

#### 6.5. Тесты

- `modules/patient-mood/service.test.ts`.
- `infra/repos/pgPatientDailyMood.test.ts` (in-memory).
- `app/api/patient/mood/route.test.ts`.
- `app/api/patient/mood/today/route.test.ts`.
- `app/app/patient/home/PatientHomeMoodCheckin.test.tsx`.

#### 6.6. Acceptance Phase 6

- Можно поставить score, перезаписать, увидеть на главной.
- Дата корректно вычисляется по timezone приложения.
- Phase-level webapp checks зелёные; full CI не требуется, если не было repo-level изменений.

#### 6.7. Что НЕ делать

- Не связывать mood с дневником симптомов автоматически.
- Не делать комментариев / тегов настроения.
- Не делать историю настроений на главной (отдельный экран — backlog).

---

### Phase 7 — Подписочная карусель + бейджи

**Цель:** довести подписочные блоки до целевого вида: бейдж «По подписке» в карусели и на связанных страницах. Без gating.

#### 7.1. Карусель главной

`PatientHomeSubscriptionCarousel.tsx`:

- Горизонтальный скролл (CSS `overflow-x-auto snap-x snap-mandatory`).
- Каждая карточка: `imageUrlOverride` или target image, `titleOverride` или target title, бейдж `badgeLabel` (если пустой — default `По подписке` для блока `subscription_carousel`).
- Карточка ≈ 280–320 px, видна часть следующей (peek), чтобы намекнуть на скролл.

#### 7.2. Страница раздела (subscribe-aware)

Файл: `apps/webapp/src/app/app/patient/sections/[slug]/page.tsx`.

- Если раздел добавлен в блок `subscription_carousel` или item имеет `badgeLabel='По подписке'` — показываем бейдж в шапке + информационный блок:
  > **По подписке.** Доступ ко всем материалам этого раздела включён в подписку BersonCare. Совсем скоро!
- Контент **остаётся открытым**. Никаких 401/403.
- Если материал связан с курсом через `content_pages.linked_course_id` — показывать ссылку «Открыть курс».

#### 7.3. Тесты

- `PatientHomeSubscriptionCarousel.test.tsx` (рендер карточек, бейджи).
- `app/app/patient/sections/[slug]/page.test.tsx` — снэпшот для раздела, добавленного в блок `subscription_carousel`.

#### 7.4. Acceptance Phase 7

- Карусель видна, скроллится горизонтально, peek-эффект работает.
- Бейджи отображаются согласно настройкам items (`badgeLabel`) и default-логике блока.
- Контент раздела доступен для всех (нет gating).
- Phase-level webapp checks зелёные; full CI не требуется, если не было repo-level изменений.

#### 7.5. Что НЕ делать

- НИКАКИХ платежей.
- НИКАКОГО реального gate.

---

### Phase 8 — Бот: утренний пинг разминки и связь с напоминаниями

> **Режим плана Phase 8:** `EXEC` (выполнение инициировано 2026-04-28).

**Цель:** включить ежедневное напоминание «Разминка дня» через интегратор + использовать существующие reminders для практик.

#### 8.1. Утренний пинг

##### 8.1.1. system_settings

Использовать ключи, которые заводятся в начале Phase 8:

- `patient_home_morning_ping_enabled` — `boolean`. Default false. **Завести в Phase 8 ALLOWED_KEYS / ADMIN_SCOPE_KEYS.**
- `patient_home_morning_ping_local_time` — `string` `HH:MM` (default `09:00`).

Эти два ключа не относятся к Phase 2. Их нужно добавить в начале Phase 8 в обоих местах: `types.ts` (`ALLOWED_KEYS`) и `apps/webapp/src/app/api/admin/settings/route.ts` (`ADMIN_SCOPE_KEYS`).

##### 8.1.2. Логика

Использовать существующий механизм reminders (apps/integrator). Создать **системное правило**, которое для каждого пользователя с активным подключенным каналом срабатывает раз в день в `patient_home_morning_ping_local_time` (по timezone приложения):

- Проверить `patient_home_morning_ping_enabled = true` в `system_settings`. Если false — не делать ничего.
- Получить текущую «Разминку дня» из `patient_home_blocks` / `patient_home_block_items` (блок `daily_warmup`), без `patient_home_daily_warmup_page_slug` и без хардкода slug-ов.
- Сформировать сообщение:
  > «Доброе утро! Разминка дня готова — 3 минуты. Открыть?»
  > [Inline-кнопка] «Открыть» → deeplink на mini-app `/app/patient` (с query `?from=morning_ping`).
- Отправить в Telegram/MAX через существующий канал отправки.

**Важно:** реализация конкретной системной задачи зависит от существующего планировщика интегратора. Перед началом Phase 8 агент должен:

1. Прочитать код `apps/integrator/src/infra/runtime/worker/main.ts` и существующие cron/scheduled jobs.
2. Зафиксировать в `LOG.md` предложенную точку расширения (новый job `morning_warmup_ping` vs встраивание в существующий поток reminders).
3. Реализовать минимально инвазивно.

#### 8.2. Точный расчёт ближайшего напоминания для главной

В Phase 3 для `PatientHomeNextReminderCard` допустима упрощённая эвристика (`pickNextReminderRuleForHome`: самое свежее обновлённое включённое правило). В Phase 8 её нужно заменить точным расчётом ближайшего срабатывания:

- Вынести чистую функцию уровня модуля patient-home/reminders, например `getNextReminderOccurrence(rule, now, timezone)`.
- Учитывать только enabled rules с `linkedObjectType IN ('lfk_complex','content_section','content_page')`.
- Учитывать `daysMask`, `windowStartMinute`, `windowEndMinute`, `intervalMinutes` и timezone приложения (`getAppDisplayTimeZone`).
- Вернуть `null`, если правило невалидно или не имеет будущего срабатывания в разумном горизонте.
- `PatientHomeNextReminderCard` должна показывать человеческий label ближайшего срабатывания, а не общий текст «По расписанию».
- Не менять схему `reminder_rules`.

Минимальный тестовый набор:

- сегодня до окна → ближайшее сегодня в `windowStartMinute`;
- сегодня внутри окна → ближайший интервал в окне;
- сегодня после окна → ближайший разрешённый день из `daysMask`;
- disabled/custom/unlinked rules игнорируются;
- timezone влияет на дату/день недели.

#### 8.3. Напоминания на ситуации (без изменения схемы)

Использовать существующий `linkedObjectType='content_section'` и `'content_page'` (уже есть в `ReminderRule`). Просто на стороне бота при срабатывании напоминания корректно формировать текст сообщения с использованием `iconImageUrl`/`title` раздела.

В этой инициативе допустимо ограничиться лёгким улучшением шаблона (использовать `title` раздела/страницы и кнопку deeplink на mini-app).

#### 8.4. Тесты

- Юнит-тест на формирование сообщения утреннего пинга (snapshot).
- Тест функции «следует ли отправить пинг прямо сейчас» (по timezone).
- Юнит-тесты точного расчёта ближайшего reminder occurrence для главной.

#### 8.5. Acceptance Phase 8

- При `patient_home_morning_ping_enabled=true` пользователь получает в указанное время сообщение в боте.
- Кнопка ведёт в mini-app, и landing — главная пациента (с UTM/`from`).
- Карточка следующего напоминания на главной показывает ближайшее время по `daysMask`/window/timezone, а не эвристику по `updatedAt`.
- Phase-level checks зелёные: webapp для settings/UI + integrator targeted/phase tests для worker/ping. Full CI допустим только если Phase 8 затронула repo-level contracts/configs; иначе отложить до Phase 9.

#### 8.6. Что НЕ делать

- Не менять структуру `reminder_rules`.
- Не делать персональные расписания утреннего пинга у каждого пользователя — глобальный admin-уровень.
- Не делать поддержку «запретить пинг для конкретного пользователя» — отдельная задача (можно добавить позже через flag в settings/profile).

---

### Phase 9 — QA, миграции данных, релиз

**Цель:** финальная проверка качества, документация, релиз.

#### 9.1. Чек-лист

- Финальный pre-push rehearsal: `pnpm install --frozen-lockfile && pnpm run ci`. Зелёный или documented blocker.
- Прогон с реальной БД: `USE_REAL_DATABASE=1 pnpm --dir apps/webapp run test:with-db` (если применимо к новым модулям).
- Ручная QA-сессия:
  - гость на мобильном,
  - гость на десктопе,
  - авторизованный без курса — мобильный/десктоп,
  - авторизованный с курсом — мобильный/десктоп.
- Snapshot главной до/после в `docs/PATIENT_HOME_REDESIGN_INITIATIVE/RELEASE_SNAPSHOTS/`.
- Обновить `docs/README.md` ссылкой на эту инициативу (раздел «Активные инициативы»).
- Дополнить `apps/webapp/src/modules/patient-home/patient-home.md` (если файл есть) или создать его — описать новые компоненты.
- В `LOG.md` зафиксировать дату завершения каждой фазы.

#### 9.2. Откатные миграции

Для каждой DDL-миграции (`0008` … `0011`) подготовить **обратный SQL** в комментариях верхней части миграционного файла или в `docs/PATIENT_HOME_REDESIGN_INITIATIVE/ROLLBACK_SQL.md`. Не использовать автоматический down — только инструкция.

#### 9.3. Acceptance Phase 9

- Все вышеуказанные пункты выполнены.
- Релиз через `bash deploy/host/deploy-prod.sh` (на main; CI workflow это делает автоматически после успешного `ci`).
- На production проверены: главная пациента, страница раздела, страница материала, кнопка «Готово», чек-ин mood, утренний пинг (вручную включить флаг и проверить).

---

## 7. Архитектурные ограничения и правила (кратко)

Эти правила применяются на каждой фазе. Их нарушение — REWORK.

1. **Drizzle для всех новых таблиц и runtime-запросов.** Никакого raw SQL в `infra/repos/*` для новых сущностей: не использовать `getPool()`, `pool.query(...)`, `client.query(...)`. Новые репозитории работают через Drizzle db/schema. SQL допустим только в Drizzle migration files (`apps/webapp/db/drizzle-migrations/*.sql`) для DDL/check/FK/seed и в `ROLLBACK_SQL.md` как operational-инструкция отката. Миграции — через `drizzle-kit generate`.
2. **Module isolation.** `modules/*` не импортирует `@/infra/db/*` и `@/infra/repos/*`. Порт описывается в `modules/<domain>/ports.ts`, реализация — в `infra/repos/pg<Domain>.ts`. См. `.cursor/rules/clean-architecture-module-isolation.mdc`.
3. **Тонкие route handlers.** Только parse → validate → auth → call service → http. Никакой бизнес-логики.
4. **system_settings (scope=admin) для scalar runtime-настроек.** Не env. Не хардкод. Состав/порядок блоков главной — не env и не system_settings JSON, а отдельные таблицы `patient_home_blocks` / `patient_home_block_items`. См. `.cursor/rules/000-critical-integration-config-in-db.mdc`.
5. **`ALLOWED_KEYS` + `ADMIN_SCOPE_KEYS`** — обновлять оба массива при добавлении ключа.
6. **integrator mirror** — новые `system_settings` ключи синхронизируются автоматом через существующий `syncSettingToIntegrator` (см. `.cursor/rules/system-settings-integrator-mirror.mdc`). Никаких дополнительных вызовов синхронизации в route handlers.
7. **Перед пушем** — `pnpm install --frozen-lockfile && pnpm run ci`. См. `.cursor/rules/pre-push-ci.mdc`.
8. **Не смешивать фазы.** Каждая фаза — отдельный коммит/набор коммитов. Не начинать N+1 до зелёного gate N.
9. **Нет FK на `users` в новых таблицах.** Контроль user_id — на сервисном уровне (политика PLATFORM_IDENTITY).
10. **Никаких CI-изменений** без отдельного решения.
11. **Документация модулей** — каждый новый модуль `modules/<domain>/` должен иметь файл `<domain>.md` с кратким описанием.

---

## 8. Acceptance criteria — сводка по фазам

| Phase | Главный гейт |
|---|---|
| 1 | Миграция применена; CMS форма раздела поддерживает обложку/иконку; `/app/settings/patient-home` управляет блоками и items; phase-level webapp checks зелёные |
| 2 | `linked_course_id` сохраняется и видно в форме; admin может задать daily_warmup через блок главной; тесты `todayConfig` зелёные |
| 3 | Главная пациента переписана на новые компоненты; non-personal/без tier/patient — разные наборы блоков; deprecated компоненты удалены |
| 4 | На lg+ две колонки + полноширинная карусель; на md одна колонка; другие пациентские маршруты не задеты |
| 4.5 | Точный `/app/patient` открыт без сессии; внутренние `/app/patient/...` остаются за авторизацией; protected media не раскрыты |
| 5 | Кнопка «Готово» работает; стрик корректно считается; PatientHomeProgressBlock показывает реальные данные |
| 6 | Mood checkin сохраняется/перезаписывается; «сегодня» по TZ |
| 7 | Карусель + бейджи; контент остаётся открытым; никакого gate |
| 8 | Утренний пинг включается флагом; ссылка ведёт в mini-app; ближайшее напоминание на главной считается по расписанию/timezone |
| 9 | Все QA-сценарии пройдены; release snapshots сохранены; `pnpm install --frozen-lockfile && pnpm run ci` зелёный; LOG.md закрыт |

---

## 9. Риски и предупреждения

1. **Расчёт «следующего напоминания» в Phase 3.** Существующая модель `ReminderRule` хранит правила, но «когда сработает в следующий раз» — это recurrent calc (windowStart/End + daysMask). В Phase 3 допустима упрощённая версия; точный расчёт закреплён за Phase 8.
2. **Стрик и timezone.** Стрик чувствителен к timezone. Использовать единственный источник — `getAppDisplayTimeZone()`. Не допускать смесь `now()` и `now() AT TIME ZONE`.
3. **Главная-героика на десктопе** — узкая колонка `variant="patient"` сильно ограничивает. Поэтому в Phase 4 вводится `variant="patient-wide"` или эквивалент. **Применять только на главной.** Иначе ломается консистентность пациентских страниц.
4. **Деление существующих компонентов.** При удалении `PatientMiniAppPatientHome` и `PatientHomeBrowserHero` проверить, что они не импортированы откуда-либо ещё (Grep).
5. **Кнопка «Записаться».** На мобильном макете она внутри hero, на втором мобильном макете — отдельной строкой. На десктопе — отдельная карточка. В коде это решается одним компонентом `PatientHomeBookingCard`, рендеримым в разных местах layout.
6. **Утренний пинг и нагрузка.** При большом числе пользователей рассылка одним всплеском в 09:00 может перегрузить очередь. В Phase 8 агенту следует свериться с существующим throttle/rate-limit интегратора (см. `RUBITIME_BOOKING_PIPELINE.md` — там 5500ms throttle для booking). Аналогичный sane default рекомендован.
7. **Аналитика не входит.** Никаких новых событий аналитики (`mixpanel`, `amplitude`, `tracking`) в инициативе. Только UTM `?from=...` в существующих ссылках.

---

## 10. Структура папки инициативы

```
docs/PATIENT_HOME_REDESIGN_INITIATIVE/
├── README.md              ← этот файл (ТЗ)
├── CONTENT_PLAN.md        ← заполняет владелец (Phase 0)
├── LOG.md                 ← журнал работ агентов (создаётся при старте)
├── ROLLBACK_SQL.md        ← откатные SQL для миграций
└── RELEASE_SNAPSHOTS/     ← скриншоты до/после
    ├── README.md          ← инструкция и QA-матрица
    ├── before/
    └── after/
```

При появлении дополнительных артефактов (отдельных промптов, аудит-отчётов и т.п.) — добавлять рядом и ссылаться из `README.md`.

---

## 11. Связанные документы и ссылки

- Архитектура CMS: `docs/ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md`.
- Кабинет специалиста: `docs/ARCHITECTURE/SPECIALIST_CABINET_STRUCTURE.md`.
- Платформенная модель: `docs/ARCHITECTURE/FULL PLATFORM MODEL.md`.
- Курсы и программы лечения: `docs/TREATMENT_PROGRAM_INITIATIVE/README.md`.
- Правила Drizzle/архитектуры: `docs/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md`.
- system_settings vs env: `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`.
- Платформенный пользователь и trusted phone: `docs/ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md`.
- Server conventions: `docs/ARCHITECTURE/SERVER CONVENTIONS.md`.

---

## 12. Чеклист агента-исполнителя на каждую фазу

Перед началом фазы:

- [ ] Прочитал README.md полностью и раздел текущей фазы.
- [ ] Прочитал указанные `.cursor/rules/*` файлы (см. §7).
- [ ] Зафиксировал план фазы в `LOG.md` (короткий: что планирую сделать, какие файлы трогаю).
- [ ] Сверился с NOT IN SCOPE (§3) — ничего из запрещённого не делаю.

В процессе фазы:

- [ ] Все новые сущности через Drizzle, миграция в `apps/webapp/db/drizzle-migrations/`.
- [ ] В новых runtime-репозиториях нет `getPool`, `pool.query`, `client.query`; используются Drizzle db/schema.
- [ ] Все новые модули соблюдают module isolation (§7.2).
- [ ] Все route handlers тонкие.
- [ ] Все новые UI-компоненты содержат minimum 1 unit/RTL тест.
- [ ] Никаких новых env-переменных.

Перед завершением фазы:

- [ ] Запущены проверки правильного уровня по `.cursor/rules/test-execution-policy.md`; full CI только на Phase 9 / pre-push / repo-level scope.
- [ ] Acceptance criteria фазы выполнены (см. §6 раздел «Phase X»).
- [ ] Запись в `LOG.md`: что сделано, какие файлы изменены, gate verdict.
- [ ] Если есть отклонения от ТЗ — описаны в `LOG.md` и согласованы.

---

**Версия:** 1.0  
**Дата создания:** 2026-04-28
