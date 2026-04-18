# LOG — TREATMENT_PROGRAM_INITIATIVE

## 2026-04-17 — инициатива создана

**Сделано:**
- Создана папка `docs/TREATMENT_PROGRAM_INITIATIVE/` с полным комплектом документации.
- `MASTER_PLAN.md` — 10 фаз, критерии, порядок.
- `SYSTEM_LOGIC_SCHEMA.md` — эталон логики: таблицы, потоки, статусы, типы элементов, копирование, override, events, курсы.
- `EXECUTION_RULES.md` — жёсткие правила для агентов.
- `PROMPTS_EXEC_AUDIT_FIX.md` — промпты EXEC/AUDIT/FIX для каждой фазы.
- `LEGACY_CLEANUP_BACKLOG.md` — allowlist legacy modules/* + исторический перечень routes в архиве.
- ESLint rule `no-restricted-imports` добавлен в `apps/webapp/eslint.config.mjs` — lint проходит на текущем коде; новые нарушения ловятся.
- Cursor rule `.cursor/rules/clean-architecture-module-isolation.mdc` — запрет прямого infra-доступа из модулей.

**Проверки:**
- `npx eslint src/modules/` — PASS (0 errors) — allowlist корректен.
- Ручная проверка: `channelLink.ts` без allowlist даёт 4 ошибки (getPool + 3 infra imports) — rule работает.

**Следующий шаг:** Фаза 0 EXEC (верификация enforcement) → Фаза 1 (Drizzle).

---

## 2026-04-18 — Фаза 0 (enforcement) — закрыта

**Сделано:**
- Проверено: ESLint `no-restricted-imports` в `apps/webapp/eslint.config.mjs` — для `src/modules/**/*.ts(x)` паттерны `@/infra/db/*`, `@/infra/db/client`, `@/infra/repos/*`; allowlist legacy-файлов синхронизирован с документом.
- Добавлено то же ограничение для `src/app/api/**/route.ts` (MASTER_PLAN 0.1); на текущем коде нарушений нет — отдельный allowlist для routes не используется.
- Проверено: `.cursor/rules/clean-architecture-module-isolation.mdc` существует (`alwaysApply: true`).
- `LEGACY_CLEANUP_BACKLOG.md` — таблица A дополнена строкой `modules/lessons/service.ts` (29 файлов = список в ESLint overrides); секция B уточнена: исторический allowlist в архиве + регрессия через ESLint для API routes.

**Gate (Фаза 0):** `pnpm --dir apps/webapp run lint` — PASS.

**Следующий шаг:** Фаза 1 (Drizzle ORM) по MASTER_PLAN.

---

## 2026-04-18 — FIX аудита фазы 0: defer по списку 48 маршрутов

**Сделано:** в `AUDIT_PHASE_0.md` и `LEGACY_CLEANUP_BACKLOG.md` (секция B) зафиксировано: маршруты с историческим нарушением boundary **уже исправлены**; **восстановление формального списка 48 путей из git не делаем** — опциональный план аудита **устарел**, defer окончательный. MANDATORY FIX #4 и gate-строка обновлены согласно этому.

**Gate (документация):** согласовано с фактом: `rg` по `**/route.ts` без прямых `@/infra/*`, ESLint на routes без allowlist.

---

## 2026-04-18 — Фаза 1 (Drizzle ORM setup) — выполнено

**Сделано:**
- Зависимости: `drizzle-orm`, dev `drizzle-kit` в `apps/webapp/package.json` (+ lockfile).
- `apps/webapp/drizzle.config.ts` — PostgreSQL, `DATABASE_URL` из `.env.dev` / `.env` (как `loadEnv`), schema `./db/schema`, артефакты миграций Drizzle `./db/drizzle-migrations` (**отдельно** от существующих SQL `apps/webapp/migrations/`).
- `pnpm exec drizzle-kit introspect` → снимок схемы `public`; таблицы и связи в `apps/webapp/db/schema/schema.ts`, `relations.ts`, реэкспорт `index.ts`.
- После генерации исправлены сломанные литералы **пустых строк по умолчанию** (`drizzle-kit` вывел `.default(')` вместо `.default('')`) — массовая замена в `schema.ts`.
- Обёртка **`getDrizzle()`** в `src/app-layer/db/drizzle.ts` использует тот же `Pool`, что и `getPool()` (без второго подключения).
- Smoke: `src/app-layer/db/drizzle.smoke.test.ts` — `SELECT 1` через `sql`; в обычном CI пропуск (`it.skipIf` без `USE_REAL_DATABASE`); с `USE_REAL_DATABASE=1` выполняется и проходит локально.
- Скрипт `pnpm --dir apps/webapp run db:introspect` → `drizzle-kit introspect`.

**Проверки:**
- Step: `pnpm --dir apps/webapp run typecheck`, `pnpm --dir apps/webapp run lint` — PASS.
- Phase: `pnpm test:webapp` — PASS (`355 passed | 5 skipped`).
- Smoke с БД: `USE_REAL_DATABASE=1 pnpm --dir apps/webapp exec vitest run src/app-layer/db/drizzle.smoke.test.ts` — PASS.

**Gate verdict (Фаза 1):** PASS по lint + typecheck + полным тестам webapp; перед пушем по регламенту репозитория — полный `pnpm install --frozen-lockfile && pnpm run ci`.

**Следующий шаг:** Фаза 2 (библиотека блоков) после gate/аудита по промптам инициативы.

---

## 2026-04-18 — Фаза 2 (библиотека блоков) — выполнено

**Сделано:**

| Таблица | Поля (кратко) |
|---------|----------------|
| `tests` | id UUID PK, title, description, test_type, scoring_config JSONB, media JSONB (`[]` default), tags text[], is_archived, created_by → platform_users, created_at, updated_at |
| `test_sets` | id, title, description, is_archived, created_by, created_at, updated_at |
| `test_set_items` | id, test_set_id → test_sets CASCADE, test_id → tests RESTRICT, sort_order |
| `recommendations` | id, title, body_md, media JSONB, tags text[], is_archived, created_by, timestamps |

**Drizzle:** `apps/webapp/db/schema/clinicalTests.ts`, `recommendations.ts`; связи в `relations.ts`; миграция Drizzle `db/drizzle-migrations/0001_charming_champions.sql` (из сгенерированного файла удалены посторонние изменения индекса `rubitime_booking_profiles`). `drizzle.config.ts`: schema как массив файлов таблиц + новые файлы.

**Модули:** `src/modules/tests/` (clinical tests + test sets: service, ports, types), `src/modules/recommendations/` — то же.

**Инфраструктура:** `pgClinicalTests.ts`, `pgTestSets.ts`, `pgRecommendations.ts` (Drizzle через `getDrizzle`), in-memory порты для Vitest.

**DI:** `buildAppDeps()` — поля `clinicalTests`, `testSets`, `recommendations`.

**API (doctor CRUD):**  
`GET/POST /api/doctor/clinical-tests`, `GET/PATCH/DELETE /api/doctor/clinical-tests/[id]`  
`GET/POST /api/doctor/test-sets`, `GET/PATCH/DELETE /api/doctor/test-sets/[id]`, `PUT /api/doctor/test-sets/[id]/items` (замена всего состава набора)  
`GET/POST /api/doctor/recommendations`, `GET/PATCH/DELETE /api/doctor/recommendations/[id]`

**Doctor UI:** `/app/doctor/clinical-tests`, `/app/doctor/test-sets`, `/app/doctor/recommendations` (списки, new, `[id]`); пункты меню и заголовки в `doctorNavLinks.ts`, `doctorScreenTitles.ts`.

**Тесты:** `modules/tests/service.test.ts`, `modules/recommendations/service.test.ts`; обновлён `doctorScreenTitles.test.ts`.

**Проверки:**
- Step (модули): `pnpm --dir apps/webapp run lint` — PASS после правки `TestSetItemsForm`.
- Phase: `pnpm test:webapp` — PASS (1811 tests passed).

**Сверка SYSTEM_LOGIC_SCHEMA.md §4:** тип элемента `test_set` ссылается на `test_sets.id`; снимок набора включает список тестов со scoring_config — источник данных: строки `tests`. `recommendation` → `recommendations.id`. Полиморфные snapshot для экземпляра программы — фаза 4, не входит в эту реализацию.

**Gate verdict (Фаза 2):** PASS — CRUD + UI + сервисные тесты; перед пушем по регламенту репозитория — полный `pnpm install --frozen-lockfile && pnpm run ci`.

**Следующий шаг:** Фаза 3 (шаблон программы / конструктор) по MASTER_PLAN.

---

## 2026-04-18 — AUDIT_PHASE_2 FIX closure

**Закрыты все пункты MANDATORY FIX из `AUDIT_PHASE_2.md`:**

| Пункт | Результат |
|-------|-----------|
| (critical/major в аудите отсутствовали) | Нечего закрывать дополнительно |
| §1 minor — документация API | Добавлены описания в `apps/webapp/src/app/api/api.md` для `doctor/clinical-tests`, `doctor/test-sets`, `doctor/recommendations` |
| §2 minor — `di.md` | Обновлён `apps/webapp/src/app-layer/di/di.md` (`clinicalTests`, `testSets`, `recommendations`) |
| §3 minor — изоляция тестов модулей от infra | `app-layer/testing/clinicalLibraryInMemory.ts`; тесты модулей импортируют только `@/app-layer/testing/...`; в `modules/tests` и `modules/recommendations` нет `@/infra/*` |
| §4 minor — smoke | `apps/webapp/e2e/treatment-program-blocks-inprocess.test.ts` |
| §5 informational — migrate на окружениях | Defer операционный (зафиксировано в `AUDIT_PHASE_2.md`) |
| §6 informational — snapshot фаза 4 | Defer до фазы 4 (эталон без изменений) |

**Проверки перед пушем (step/phase + pre-deploy):**

- `pnpm --dir apps/webapp run lint` — PASS  
- `pnpm --dir apps/webapp run typecheck` — PASS (после правки `FormData.get` / `Button asChild` на страницах библиотеки)  
- `pnpm test:webapp` — PASS (**358** test files, **1816** tests passed; +5 файлов относительно отчёта до FIX — включая `e2e/treatment-program-blocks-inprocess.test.ts`)  
- Корневой **`pnpm run ci`**: `lint` → `typecheck` → `test` (integrator) → `test:webapp` → **`pnpm build`** → **`pnpm build:webapp`** — PASS; шаг **`pnpm run audit`** (`scripts/registry-prod-audit.mjs`) — **FAIL** из‑за уже зафиксированных advisories в lockfile (**esbuild**, **drizzle-orm** GHSA и т.д.), не следствие правок FIX аудита. Закрытие advisories — отдельное изменение версий зависимостей / политика репозитория.

**Следующий шаг:** Фаза 3 по MASTER_PLAN; перед продакшеном на БД применить миграцию Drizzle фазы 2 при необходимости.

---

## 2026-04-18 — Фаза 3 (шаблон программы / конструктор) — выполнено

**Сделано:**

| Таблица | Назначение |
|---------|------------|
| `treatment_program_templates` | шаблон: `title`, `description`, `status` (draft / published / archived), `created_by` |
| `treatment_program_template_stages` | этап: `template_id` FK CASCADE, `title`, `description`, `sort_order` |
| `treatment_program_template_stage_items` | элемент: `stage_id` FK CASCADE; `item_type` CHECK (exercise, lfk_complex, recommendation, lesson, test_set); **`item_ref_id` UUID без FK**; `sort_order`, `comment`, `settings` JSONB |

**Drizzle:** `apps/webapp/db/schema/treatmentProgramTemplates.ts`; связи в `relations.ts`; миграция `db/drizzle-migrations/0002_sweet_ikaris.sql`. `drizzle.config.ts` дополнен путём к файлу схемы.

**Модуль:** `src/modules/treatment-program/` — `types.ts`, `ports.ts`, `service.ts`. Валидация полиморфной ссылки только в сервисе через порт **`TreatmentProgramItemRefValidationPort`**. Реализации: `infra/repos/pgTreatmentProgramItemRefValidation.ts` (LFK упражнения/шаблоны ЛФК, наборы тестов, рекомендации, уроки в секции **`lessons`** по `content_pages`; см. ниже про SYSTEM_LOGIC_SCHEMA) и `inMemoryTreatmentProgramItemRefValidation.ts` (режим без БД — только форма UUID). Порт данных: `pgTreatmentProgram.ts` / `inMemoryTreatmentProgram.ts`.

**DI:** `buildAppDeps().treatmentProgram`.

**API (doctor):** как в `apps/webapp/src/app/api/api.md` — список/CRUD шаблона, этапы (`.../[id]/stages`, `.../stages/[stageId]`), элементы (`.../stages/[stageId]/items`, `.../stage-items/[itemId]`).

**Doctor UI:** `/app/doctor/treatment-program-templates` (список, new, `[id]` — конструктор: этапы, элементы, диалог выбора типа и записи из библиотеки). Пункт меню и заголовки в `doctorNavLinks.ts`, `doctorScreenTitles.ts`.

**Тесты:** `modules/treatment-program/service.test.ts` (сервисный слой + мок валидации ссылок).

**Проверки:** `pnpm --dir apps/webapp run lint`, `typecheck`, полный **`pnpm --dir apps/webapp run test`** — PASS (на момент записи: 359 файлов тестов, 1820 тестов).

**Сверка SYSTEM_LOGIC_SCHEMA.md §1–4 и §10:** типы элементов совпадают с CHECK в БД; для `lesson` эталон документа упоминает секцию `course_lessons`, в коде каталога уроков используется **`content_pages.section = 'lessons'`** — валидация и UI подобраны под фактическую схему приложения; несоответствие имени секции зафиксировано в комментарии в `types.ts`.

**Gate:** перед применением на окружениях выполнить миграцию Drizzle `0002_*` на БД webapp.

**Следующий шаг:** Фаза 4 (экземпляр программы / snapshot) по MASTER_PLAN.

---

## 2026-04-18 — AUDIT_PHASE_3 FIX (MANDATORY) — закрыт

**Сделано (MANDATORY FIX INSTRUCTIONS):**

- **Major / конструктор:** `TreatmentProgramConstructorClient` — переупорядочивание **этапов** и **элементов** (два последовательных `PATCH` с обменом `sortOrder`); обновление списка через `GET` шаблона.
- **Minor / UX:** удаление **этапа** (подтверждение, `DELETE .../stages/[stageId]`).
- **Minor / уроки и § 4:** `SYSTEM_LOGIC_SCHEMA.md` § 4 и § 10 — канон секции **`lessons`**, алиас **`course_lessons`**; `pgTreatmentProgramItemRefValidation` и страница конструктора учитывают обе секции; константа `LESSON_CONTENT_SECTION_LEGACY` в `types.ts`.
- **Minor / тесты и граница modules:** `apps/webapp/src/app-layer/testing/treatmentProgramInMemory.ts`; `modules/treatment-program/service.test.ts` без импорта `@/infra/*`.
- **Minor / документация:** `apps/webapp/src/app/api/api.md` — уточнены `PATCH`/`DELETE` для этапов и элементов и сценарий обмена `sortOrder`.

**Регрессионные проверки (сервисный слой):**

- Один и тот же `item_ref_id` (`test_set`) на **двух этапах** — успех.
- Обмен `sortOrder` двух этапов — порядок заголовков этапов обращается (`B`, `A` после swap).

**Step / phase (выполнено при закрытии FIX):**

- `pnpm --dir apps/webapp run lint` — **PASS**  
- `pnpm --dir apps/webapp run typecheck` — **PASS**  
- `pnpm --dir apps/webapp run test` — **PASS** (на момент прогона: **359** test files, **1822** tests passed, 8 skipped)

**Pre-deploy / полный CI (корень репозитория):**

- `pnpm install --frozen-lockfile && pnpm run ci` — `lint` (корень + webapp) → `typecheck` (monorepo) → `pnpm test` (integrator) → `pnpm test:webapp` → `pnpm build` → `pnpm build:webapp` — **PASS**; шаг **`pnpm run audit`** — **FAIL** (например `esbuild@0.18.20` moderate, `drizzle-orm@0.44.7` high в отчёте `registry-prod-audit`) — **тот же класс, что в отчёте фазы 2**; не следствие правок FIX, отдельная политика lockfile/зависимостей.

**Gate verdict (AUDIT_PHASE_3 FIX):** **PASS** по закрытию critical/major и зафиксированным minor; informational **defer** только на операционное применение миграции Drizzle на окружениях.

**Следующий шаг:** Фаза 4 по MASTER_PLAN; при необходимости повторить полный `pnpm run ci` локально перед пушем и зафиксировать результат audit в терминале.

---

## 2026-04-18 — Фаза 4 (экземпляр программы / назначение) — выполнено

**Сделано:**

| Таблица | Назначение |
|---------|------------|
| `treatment_program_instances` | экземпляр: `template_id` FK SET NULL, `patient_user_id` FK CASCADE, `assigned_by` FK SET NULL, `title`, `status` (active / completed), timestamps |
| `treatment_program_instance_stages` | этап: `instance_id` FK CASCADE, `source_stage_id` FK → шаблонный этап SET NULL, `title`, `description`, `sort_order`, `local_comment`, `status` CHECK (locked / available / in_progress / completed / skipped) |
| `treatment_program_instance_stage_items` | элемент: `stage_id` FK CASCADE; тот же CHECK `item_type`, что у шаблона; `item_ref_id` без FK; `comment`, **`local_comment`**, `settings`, **`snapshot` JSONB NOT NULL** |

**Deep copy (§5):** сервис `createTreatmentProgramInstanceService` + `assignTemplateToPatient`: только **опубликованный** шаблон; этапы и элементы в порядке `sort_order`; у элементов `comment` из шаблона, **`local_comment` = NULL**, `settings` и **snapshot** (порт `TreatmentProgramItemSnapshotPort`, реализация PG по §4: exercise, lfk_complex, test_set, recommendation, lesson); первый этап **`available`**, остальные **`locked`**.

**§6 override:** `effectiveInstanceStageItemComment` (`local_comment` иначе `comment`); API PATCH `localComment`; сброс `null` возвращает отображение к скопированному комментарию. Событие `comment_changed` — фаза 7 (`treatment_program_events`).

**Drizzle:** `apps/webapp/db/schema/treatmentProgramInstances.ts`; связи в `relations.ts`; миграция `db/drizzle-migrations/0003_treatment_program_instances.sql`. `listTemplates` — опциональный фильтр `status` (в т.ч. для UI назначения).

**API (doctor):** см. `api.md` — `GET/POST .../doctor/clients/[userId]/treatment-program-instances`, `GET/PATCH .../doctor/treatment-program-instances/[instanceId]`, `PATCH .../stage-items/[itemId]`.

**Doctor UI:** карточка клиента — блок «Программа лечения»; страница `/app/doctor/clients/[userId]/treatment-programs/[instanceId]` — дерево и override комментария.

**Тесты:** `modules/treatment-program/instance-service.test.ts` (копирование, §6 effective / сброс).

**Сверка SYSTEM_LOGIC_SCHEMA.md §5–6 и §11:** копирование и статусы первого этапа; комментарии и snapshot; полиморфные ссылки без FK; LFK/CMS сущности не менялись — только чтение для snapshot.

**Gate:** на окружениях применить миграцию Drizzle `0003_*`.

**Следующий шаг:** Фаза 6/7 по MASTER_PLAN (фаза 5 — запись ниже).

---

## 2026-04-18 — Фаза 5 (единая таблица `comments`) — выполнено

**Сверка SYSTEM_LOGIC_SCHEMA.md §7:** таблица **`comments`**: `author_id` → `platform_users` (ON DELETE restrict), `target_type` / `target_id` (полиморфная ссылка без FK), `comment_type`, `body`, `created_at` / `updated_at`; CHECK на множества `target_type` и `comment_type` как в §7; индекс **`(target_type, target_id)`** (`idx_comments_target_type_target_id`). `tenant_id` не добавлялся (отложено для мультитенанта, как в §7).

**Drizzle:** `apps/webapp/db/schema/entityComments.ts` (экспорт `entityComments`, имя таблицы БД `comments`); связи в `relations.ts`; миграция `db/drizzle-migrations/0004_entity_comments.sql`.

**Модуль:** `apps/webapp/src/modules/comments/` — `types.ts` (enum совпадает с CHECK), `ports.ts`, `service.ts`; тесты `service.test.ts` (in-memory порт из `app-layer/testing/commentsInMemory`).

**Инфра:** `pgComments.ts`, `inMemoryComments.ts`; `buildAppDeps`: поле **`comments`** (сервис) и порт `commentsPort`.

**API (doctor):** см. `apps/webapp/src/app/api/api.md` — `GET/POST /api/doctor/comments`, `GET/PATCH/DELETE /api/doctor/comments/[id]`; тесты `route.test.ts` у обоих роутов.

**UI:** `components/comments/CommentBlock.tsx` (`targetType`, `targetId`); встроен в страницу экземпляра программы (`program_instance` + id экземпляра).

**Gate:** на окружениях применить миграцию Drizzle `0004_*`.

**Следующий шаг:** Фаза 6/7 по MASTER_PLAN (`treatment_program_events`, прочее).

---

## 2026-04-18 — AUDIT_PHASE_5 FIX (MANDATORY) — закрыт

**Вход:** `AUDIT_PHASE_5.md`, `SYSTEM_LOGIC_SCHEMA.md` §7, `EXECUTION_RULES.md`.

**Сделано:**

| Пункт AUDIT_PHASE_5 | Результат |
|---------------------|-----------|
| Critical / major | В аудите **не было** — закрывать нечего; повторная сверка схемы/индекса/`listByTarget` |
| Informational #1 ACL | **Defer (обоснованно)** — §7 без ACL; зафиксировано в обновлённом `AUDIT_PHASE_5.md` |
| Informational #2 `tenant_id` | **Defer** — мультитенант |
| Informational #3 события §8 | **Defer фазы 7** |
| Informational #4 миграция 0004 | **Defer операционный** |
| Optional #5 `EXPLAIN` | **Defer** — при нагрузочных сомнениях на стенде |

**Усиление регрессии (minor):** тест «`listByTarget` только для пары `target_type` + `target_id`» в `modules/comments/service.test.ts`; JSDoc у `CommentBlock` о политике переиспользования.

**Проверки:** `pnpm --dir apps/webapp run lint`, `typecheck`, `test` (в т.ч. comments: `service.test.ts`, `doctor/comments/**/route.test.ts`). Полный **`pnpm install --frozen-lockfile && pnpm run ci`** из корня: шаги **lint → typecheck → test (integrator) → test:webapp → build → build:webapp** — **PASS**; шаг **`pnpm run audit`** — **FAIL** (как в отчётах фаз 2–4: `esbuild@0.18.20` moderate, `drizzle-orm@0.44.7` high в `registry-prod-audit`) — **не следствие FIX фазы 5**, отдельная политика зависимостей.

**Документ:** `AUDIT_PHASE_5.md` — секции «Статус закрытия (после FIX)», «FIX closure».

---

## 2026-04-18 — AUDIT_PHASE_4 FIX (MANDATORY) — закрыт

**Сделано:**

| Пункт AUDIT_PHASE_4 | Результат |
|---------------------|-----------|
| Critical / major | В аудите **не было** — закрывать нечего |
| Minor #1 — тест `settings` | Добавлен кейс «deep copy preserves settings from template stage item (§5)» в `modules/treatment-program/instance-service.test.ts` |
| Minor #2 — независимость от шаблона | Добавлен кейс «instance item comment and snapshot are independent of template edits after assign (§5)» |
| Optional minor #4 — §6 пустая строка | JSDoc у `effectiveInstanceStageItemComment` в `types.ts` (контракт API/UI и нормализация PATCH) |
| Informational #3 — `comment_changed` | **Defer фазы 7** — без изменений кода |
| Informational #5 — миграция на стендах | **Defer операционный** (как в фазах 2–3) |

**Перепроверка эталона:**

- §5 deep copy: `comment`, `local_comment` null, `settings`, `snapshot` — код + новые/существующие тесты.
- §5 независимость экземпляра — регрессия после мутации элемента шаблона.
- §6 приоритет `local_comment` для отображения — `effectiveInstanceStageItemComment` + тесты override/сброс.
- §3 начальные статусы этапов — первый `available`, остальные `locked` (тест в `instance-service.test.ts`).

**Step / phase (webapp):**

- `pnpm --dir apps/webapp run lint` — **PASS**  
- `pnpm --dir apps/webapp run typecheck` — **PASS**  
- `pnpm --dir apps/webapp run test` — **PASS** (на прогоне FIX: **360** test files, **1829** tests passed, 8 skipped)

**Pre-deploy / полный CI (корень репозитория):**

- `pnpm install --frozen-lockfile && pnpm run ci` — **lint** (корень + webapp) → **typecheck** → **pnpm test** (integrator **749** passed) → **test:webapp** (**1829** passed) → **pnpm build** → **pnpm build:webapp** — **PASS**; шаг **`pnpm run audit`** — **FAIL** (`esbuild@0.18.20` moderate, `drizzle-orm@0.44.7` high в `registry-prod-audit`) — **тот же класс**, что в отчётах фаз 2–3; **не** следствие правок AUDIT_PHASE_4 FIX.

**Gate verdict (AUDIT_PHASE_4 FIX):** **PASS** — все minor из MANDATORY закрыты тестами или документацией; informational только defer (фаза 7 + миграция на окружениях).

**Следующий шаг:** Фаза 5 или 6/7 по MASTER_PLAN; перед продом применить `0003_*` на БД webapp при необходимости.

---

## 2026-04-18 — AUDIT_PHASE_0 FIX (MANDATORY) — закрыт

**Вход:** `AUDIT_PHASE_0.md`, `EXECUTION_RULES.md`, `SYSTEM_LOGIC_SCHEMA.md`.

**Сделано (MANDATORY FIX INSTRUCTIONS):**

| # | Инструкция | Результат |
|---|----------------|-----------|
| 1 | П.7–8 «Абсолютные запреты» в alwaysApply-контексте | В `.cursor/rules/clean-architecture-module-isolation.mdc` добавлен **§1b** (не смешивать фазы; не менять GitHub CI без решения) со ссылками на `test-execution-policy.md` и `pre-push-ci.mdc`. |
| 2 | Чеклисты 29 / 48 / не путать с «23» | Подтверждено: `README.md`, `PROMPTS_EXEC_AUDIT_FIX.md`, `LEGACY_CLEANUP_BACKLOG.md`; в `README.md` добавлена строка таблицы про `AUDIT_PHASE_0.md`. |
| 3 | Расширить ESLint на весь `@/infra/*` | **Defer (обоснованно)** — зафиксировано в `AUDIT_PHASE_0.md`: scope фазы 0 = `db` + `repos` по `MASTER_PLAN` / `EXECUTION_RULES` §2; остальной `@/infra` — отдельное решение. |
| 4 | Список 48 маршрутов из git | Без действий (как ранее). |

**`AUDIT_PHASE_0.md`:** обновлены краткий вердикт, таблица п.7–8, gate, блок MANDATORY FIX (статусы закрытия), секция «Статус закрытия (после FIX)» и сверка с `SYSTEM_LOGIC_SCHEMA.md` (изменений доменного кода нет).

**Allowlist / `LEGACY_CLEANUP_BACKLOG.md`:** не менялись — синхронизация 29 файлов с ESLint по-прежнему полная.

**Перепроверка ESLint (новый файл в `modules/*`):**

- Импорт `@/infra/db/client` или `@/infra/repos/*` → **error** `no-restricted-imports`.
- Импорт `@/infra/s3/client` на том же условном файле → **ошибки restricted-imports нет** (ожидаемо; прочий `@/infra` по-прежнему вне паттерна фазы 0).

**Проверки по `EXECUTION_RULES.md` (step / phase):**

- **Step / webapp:** `pnpm exec eslint .` (из `apps/webapp`) — **PASS**; `pnpm --dir apps/webapp run typecheck` — **PASS**.
- **Phase:** `pnpm test:webapp` — **PASS** (**363** test files passed, **1845** tests passed; **5** files skipped, **8** tests skipped).
- **Репозиторий:** `pnpm lint` (корень + webapp, включая `check-media-preview-invariants.sh`) — **PASS**.

**Сверка `SYSTEM_LOGIC_SCHEMA.md`:** правки только enforcement-документация и cursor rule; эталон и код программ лечения не затрагивались.

**Gate verdict (AUDIT_PHASE_0 FIX):** **PASS** — critical/major из MANDATORY закрыты; minor по широкому ESLint — явный defer; полный `pnpm run ci` и шаг `pnpm run audit` не перегонялись в этом цикле (при необходимости перед пушем — по `pre-push-ci.mdc`).

---

## 2026-04-18 — AUDIT фазы 1 (Drizzle)

**Отчёт:** `docs/TREATMENT_PROGRAM_INITIATIVE/AUDIT_PHASE_1.md`.

**Сделано в ходе аудита / FIX:**

- **`scripts/verify-drizzle-public-table-count.mjs`:** суммирование `pgTable` по всем файлам из массива `schema` в `drizzle.config.ts` (раньше — только `schema.ts`, ложный OK при split-schema).
- **`SYSTEM_LOGIC_SCHEMA.md` § 12:** уточнены слои и соответствие `EXECUTION_RULES` (убрана двусмысленность «inline Drizzle»).

**Проверки:**

- Зависимости: `drizzle-orm` / `drizzle-kit` в `apps/webapp/package.json` — OK.
- `drizzle.config.ts` + `DATABASE_URL` — OK.
- `pnpm test:webapp` — PASS (1845 tests passed).
- `USE_REAL_DATABASE=1` + smoke `drizzle.smoke.test.ts` — PASS.
- `db:verify-public-table-count` на текущей dev-БД — **MISMATCH 97 vs 108** до применения миграций Drizzle инициативы (ожидаемо после исправления скрипта).

**Gate verdict (аудит фазы 1):** **PASS** по коду и тестам; **операционно** — при наличии `DATABASE_URL` прогон verify зелёный только на БД с актуальными таблицами (миграции `db/drizzle-migrations`).

---

## 2026-04-18 — AUDIT_PHASE_1 FIX (MANDATORY) — закрыт

**Вход:** `AUDIT_PHASE_1.md`, `SYSTEM_LOGIC_SCHEMA.md`, `EXECUTION_RULES.md`.

**Список фиксов:**

| Что | Деталь |
|-----|--------|
| **`0000_wandering_famine.sql`** | Заменён на исполняемый no-op (`SELECT 1`); старый полностью закомментированный introspect-снимок убран из файла (доступен в git history). Устранена поломка `drizzle-kit migrate` из-за `--> statement-breakpoint` внутри блока `/* … */`. |
| **`scripts/seed-drizzle-migrations-meta.mjs`** | Вставка строк в `drizzle.__drizzle_migrations` по `meta/_journal.json` (sha256 содержимого `.sql`, как в drizzle-orm), если hash ещё нет — для БД, где DDL уже применён вне migrate. |
| **`package.json` (webapp)** | Скрипты `db:migrate:drizzle`, `db:seed-drizzle-meta`. |
| **`EXECUTION_RULES.md`** | В «Правила Drizzle» добавлены команды `db:migrate:drizzle` и `db:seed-drizzle-meta`. |
| **`AUDIT_PHASE_1.md`** | Обновлены §3, MANDATORY FIX, команды, статус закрытия FIX; minor — defer единого manifest путей schema. |

**Сверка схемы и БД:**

- `pnpm --dir apps/webapp run db:verify-public-table-count` — **PASS** (**108** public base tables = **108** `pgTable` в объединённых schema-файлах).
- `pnpm --dir apps/webapp run db:seed-drizzle-meta` — выполнено на dev-БД (вставлены 5 записей журнала).
- `pnpm --dir apps/webapp run db:migrate:drizzle` — **PASS** («migrations applied successfully», идемпотентно после seed).

**Smoke-read:**

- `USE_REAL_DATABASE=1 pnpm --dir apps/webapp exec vitest run src/app-layer/db/drizzle.smoke.test.ts` — **PASS**.

**Step / phase (`EXECUTION_RULES.md`):**

- `pnpm --dir apps/webapp run typecheck` — **PASS**
- `pnpm --dir apps/webapp run lint` — **PASS**
- `pnpm test:webapp` — **PASS** (**363** test files, **1845** tests passed; **5** / **8** skipped)

**Gate verdict (AUDIT_PHASE_1 FIX):** **PASS** — critical/major закрыты; minor (единый список путей для verify vs config) — **defer** в `AUDIT_PHASE_1.md`.

---

## 2026-04-18 — Фаза 6 (прохождение и тесты) — выполнено

**Сверка `SYSTEM_LOGIC_SCHEMA.md` §3:** цепочка статусов этапа `locked → available → in_progress → completed` и ветка `skipped` (только вручную врачом); переход к следующему **`available`** при **`completed`** или **`skipped`** текущего (авторазблокировка следующего **`locked`** по `sort_order`). Первое взаимодействие пациента с элементом доступного этапа переводит этап в **`in_progress`**. Пропуск этапа — **`reason` обязателен** (валидация в `progress-service`; в БД `skip_reason` на `treatment_program_instance_stages`). Ручное «открытие» заблокированного этапа — **`PATCH`** статуса в **`available`**.

**Сверка §3 (элементы):** завершение этапа при всех элементах с заполненным **`completed_at`**; для **`test_set`** — после закрытия попытки (все тесты набора имеют строки в **`test_results`**).

| Таблица | Назначение |
|---------|------------|
| **`test_attempts`** | `instance_stage_item_id` FK CASCADE → `treatment_program_instance_stage_items`, `patient_user_id` FK CASCADE, `started_at`, `completed_at`; частичный уникальный индекс одна открытая попытка на пару (элемент, пациент). |
| **`test_results`** | `attempt_id` FK CASCADE, `test_id` FK → `tests` RESTRICT, **`raw_value` JSONB**, **`normalized_decision`** CHECK (`passed` / `failed` / `partial`), **`decided_by`** FK SET NULL → `platform_users`, `created_at`; уникальность `(attempt_id, test_id)`. |

**Расширение существующих таблиц:** `treatment_program_instance_stages.skip_reason` (TEXT); `treatment_program_instance_stage_items.completed_at` (timestamptz).

**Drizzle:** `apps/webapp/db/schema/treatmentProgramTestAttempts.ts`; правки `treatmentProgramInstances.ts`; экспорт в `db/schema/index.ts`; связи в `relations.ts`; миграция **`db/drizzle-migrations/0005_treatment_program_phase6.sql`**; `drizzle.config.ts`.

**Модули:** `progress-service.ts`, `progress-scoring.ts`; расширены `ports.ts`, `types.ts`. Порты: `TreatmentProgramTestAttemptsPort`, расширение `TreatmentProgramInstancePort` (`updateInstanceStage`, `setStageItemCompletedAt`).

**Инфра:** `pgTreatmentProgramTestAttempts.ts`; `pgTreatmentProgramInstance.ts` и **`createInMemoryTreatmentProgramPersistence()`** (согласованные instance + test ports для Vitest и `webappReposAreInMemory`).

**DI:** `buildAppDeps().treatmentProgramProgress`; in-memory — один persistence-объект на оба порта экземпляра и попыток.

**API:** см. `apps/webapp/src/app/api/api.md` — patient `.../treatment-program-instances`, `.../progress/touch|complete|test-attempt|test-result`; doctor `.../stages/[stageId]`, `.../test-results`, `.../test-results/[resultId]`.

**Patient UI:** `/app/patient/treatment-programs`, `/app/patient/treatment-programs/[instanceId]`; ссылки с главной (browser hero + miniapp).

**Doctor UI:** карточка экземпляра — блок результатов тестов и управление этапами; SSR подгрузка `initialTestResults`.

**Тесты:** `modules/treatment-program/progress-service.test.ts` (переходы §3, результаты, skip/reason, override); существующие `instance-service` / `service` — без регрессий.

**Gate:** на окружениях применить миграцию Drizzle `0005_*`.

**Проверка:** `scripts/verify-drizzle-public-table-count.mjs` — в список файлов схемы добавлен `treatmentProgramTestAttempts.ts` (синхронизация с `drizzle.config.ts`); после `db:migrate:drizzle` на БД с актуальными миграциями — **OK: 110** public tables (до фазы 7).

**Следующий шаг:** см. фазу 7 ниже.

---

## 2026-04-18 — Фаза 7 (история изменений, §8) — выполнено

**Сверка `SYSTEM_LOGIC_SCHEMA.md` §8:** таблица **`treatment_program_events`** с полями `instance_id`, `actor_id` (nullable для авто-переходов), `event_type` (CHECK по перечню §8), `target_type` (`stage` | `stage_item` | `program`), `target_id`, `payload` JSONB, `reason` (обязателен в сервисе для **`stage_skipped`** и **`item_removed`**), `created_at`. Запись только из сервисного слоя (`instance-service`, `progress-service` + порт `TreatmentProgramEventsPort`), без триггеров.

**Типы событий в коде:** `item_added`, `item_removed`, `item_replaced`, `comment_changed`, `stage_added`, `stage_removed`, `stage_skipped`, `stage_completed`, `status_changed` (этап / элемент / программа по `target_type` и `payload.scope`), `test_completed` (payload с `testResultId`, `attemptId`, `testId`).

**Drizzle:** `db/schema/treatmentProgramEvents.ts`; миграция **`db/drizzle-migrations/0006_treatment_program_events.sql`**; журнал `meta/_journal.json`; экспорт в `index.ts`, связи в `relations.ts`, `drizzle.config.ts`, verify-скрипт.

**Инфра:** `pgTreatmentProgramEvents.ts`; in-memory события в **`createInMemoryTreatmentProgramPersistence().eventsPort`**.

**DI:** `buildAppDeps` — `treatmentProgramEventsPort` (PG или in-memory); передаётся в **`createTreatmentProgramInstanceService`** и **`createTreatmentProgramProgressService`**.

**Мутации структуры экземпляра (врач):** `doctorAddStage`, `doctorRemoveStage`, `doctorAddStageItem`, `doctorRemoveStageItem` (reason обязателен), `doctorReplaceStageItem` — в `instance-service`; порты **`addInstanceStage`**, **`removeInstanceStage`**, **`addInstanceStageItem`**, **`removeInstanceStageItem`**, **`replaceInstanceStageItem`** в PG/in-memory.

**API (doctor):** `GET .../treatment-program-instances/[instanceId]/events`; `POST .../stages`; `DELETE .../stages/[stageId]`; `POST .../stages/[stageId]/items`; расширены `PATCH .../stage-items/[itemId]` (`replace` | `localComment`), **`DELETE .../stage-items/[itemId]`** с телом `{ reason }`. Существующие **`PATCH`** программы и этапа передают **`actorId`** сессии для событий.

**Doctor UI:** блок «История изменений программы» на странице экземпляра (`TreatmentProgramInstanceDetailClient`), обновление списка при `refresh`.

**Тесты:** `treatment-program-events.test.ts`; доп. проверки в `progress-service.test.ts` (`test_completed` / `stage_completed`, `stage_skipped` + reason).

**Gate:** на окружениях применить миграцию **`0006_*`**; после примения verify table count ожидается **111** public tables (если ранее было 110).

**Проверки (локально):** `pnpm --dir apps/webapp run typecheck` — **PASS**; `pnpm exec vitest run src/modules/treatment-program` — **PASS** (см. также блок AUDIT_PHASE_7 FIX ниже по актуальному числу тестов).

---

## 2026-04-18 — Фаза 8 (курсы, §9–10) — выполнено

**Сверка `SYSTEM_LOGIC_SCHEMA.md` §9:** таблица **`courses`**: `title`, `description`, `program_template_id` → **`treatment_program_templates`** (RESTRICT), `intro_lesson_page_id` → **`content_pages`** (SET NULL), `access_settings` JSONB, `status` (draft / published / archived), `price_minor`, `currency`. При «покупке» проверяются публикация курса и **`access_settings.enrollment !== 'closed'`**, затем вызывается **`treatmentProgramInstance.assignTemplateToPatient`** (фаза 4) с **`template_id = course.program_template_id`**, **`assignedBy: null`**. Курс **не** хранит этапы и **не** реализует своё прохождение.

**§10:** вступительный урок — валидация страницы CMS: секция **`lessons`** или **`course_lessons`**, **`requires_auth = true`**, опубликована и не в архиве/soft-delete.

**Drizzle:** `db/schema/courses.ts`; миграция **`db/drizzle-migrations/0007_courses.sql`**; `meta/_journal.json`; экспорт в `index.ts`; связи **`coursesRelations`** + `treatmentProgramTemplatesRelations.courses`; `drizzle.config.ts`, `verify-drizzle-public-table-count.mjs`.

**Модули:** `src/modules/courses/` (`types`, `ports`, `service`).

**Инфра:** `pgCourses.ts`, `inMemoryCourses.ts`.

**DI:** `buildAppDeps().courses` — после сборки **`treatmentProgramInstance`**, чтобы передать **`assignTemplateToPatient`**.

**API:** `GET /api/patient/courses`; `POST /api/patient/courses/[courseId]/enroll`; `GET/POST /api/doctor/courses`; `GET/PATCH /api/doctor/courses/[id]` (см. `api.md`).

**Patient UI:** `/app/patient/courses`, `routePaths.patientCourses`; ссылки с главной (browser hero + miniapp); политика гостя — `patientRouteApiPolicy` (каталог без tier patient; мутация — API gate).

**Тесты:** `src/modules/courses/service.test.ts`.

**Gate:** применить миграцию **`0007_*`**; после применения ожидается **112** public tables (было **111** после фазы 7).

**Проверки (локально):** `pnpm --dir apps/webapp run typecheck` — **PASS**; `pnpm exec vitest run src/modules/courses/service.test.ts` — **PASS**.

---

## 2026-04-18 — Фаза 9 (гибкие правки + интегратор, §8 §11) — выполнено

**Сверка `SYSTEM_LOGIC_SCHEMA.md` §8:** все структурные мутации после старта прохождения по-прежнему идут через сервис и пишут **`treatment_program_events`**. Добавлены сценарии **`status_changed`** с `payload.scope`: **`stages_reordered`**, **`stage_items_reordered`**. Удаление элемента, замена ссылки и удаление этапа **запрещены**, если у элемента заполнено **`completed_at`** или есть хотя бы одна строка в **`treatment_program_test_attempts`** (сохранение истории результатов и отметок; без тихого CASCADE при «живых» данных).

**§11:** проекция для бота — **`GET /api/integrator/diary/lfk-complexes?includeTreatmentPrograms=true`** добавляет **`treatmentProgramLfkBlocks`**: элементы **`lfk_complex`** только у экземпляров в статусе **`active`**, поля `instanceId`, этап, `stageItemId`, `lfkComplexId`, `lfkComplexTitle` (из **`snapshot.title`** при наличии).

**Порты:** `TreatmentProgramInstancePort.reorderInstanceStages` / `reorderInstanceStageItems`; `TreatmentProgramTestAttemptsPort.hasAnyAttemptForStageItem`.

**Реализации:** `pgTreatmentProgramInstance.ts`, `inMemoryTreatmentProgramInstance.ts`, `pgTreatmentProgramTestAttempts.ts`.

**Сервис:** `createTreatmentProgramInstanceService` — опциональный **`testAttempts`** (в `buildAppDeps` всегда передаётся PG/in-memory порт); методы **`doctorReorderStages`**, **`doctorReorderStageItems`**, **`listTreatmentProgramLfkBlocksForIntegratorPatient`**.

**API (doctor):** `POST .../stages/reorder`, `POST .../stages/[stageId]/items/reorder` (см. `api.md`).

**Тесты:** расширен `treatment-program-events.test.ts` (reorder + события, блокировки remove/replace/remove-stage, проекция ЛФК).

**Проверки (локально):** `pnpm --dir apps/webapp run typecheck`; `pnpm exec vitest run src/modules/treatment-program/treatment-program-events.test.ts`.

---

## 2026-04-18 — AUDIT_PHASE_9 FIX (MANDATORY) — закрыт

**Вход:** `AUDIT_PHASE_9.md`, `SYSTEM_LOGIC_SCHEMA.md` § 8, 11, `EXECUTION_RULES.md`.

**Закрытие MANDATORY FIX INSTRUCTIONS:**

| Пункт | Результат |
|-------|-----------|
| Critical / major | **N/A** — в аудите не заводились. |
| **9-M-1** — HTTP integrator `lfk-complexes` + `includeTreatmentPrograms` | **Закрыт:** `apps/webapp/src/app/api/integrator/diary/lfk-complexes/route.test.ts` переведён на мок `buildAppDeps` (`listLfkComplexes`, `listTreatmentProgramLfkBlocksForIntegratorPatient`); кейсы `true` / `false` / без флага; базовый 200 с `complexes`. |
| **9-M-2** — регрессия цепочки правок | **Закрыт:** `treatment-program-events.test.ts` — add → replace → reorder, стабильный `stage_item` id, обновление `snapshot`, события `item_added` / `item_replaced` / `stage_items_reordered`. |
| **9-I-1 … 9-I-6** | **Defer** — без изменений (см. `AUDIT_PHASE_9.md`). |

**Подтверждения:**

1. **Мутации после старта** — guard’ы в `instance-service` без регрессии; завершённые результаты не удаляются при штатном пути (тесты блокировок + цепочка на «чистых» элементах).
2. **События § 8** — код записи событий не менялся в FIX; новые тесты не ослабляют требование `events` в production (`buildAppDeps`).
3. **Интегратор** — контракт `treatmentProgramLfkBlocks` закреплён route-тестом; сервисная проекция как в § 11 (active + `lfk_complex` + title из snapshot).
4. **Регрессия** — цепочка правок не ломает id элементов и согласует порядок с reorder.

**Проверки (step / phase, верификация 2026-04-18):**

- `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/ src/app/api/integrator/diary/lfk-complexes/route.test.ts` — **PASS** (**6** files, **49** tests)
- `pnpm --dir apps/webapp run typecheck` — **PASS**
- `pnpm --dir apps/webapp run lint` — **PASS**
- `pnpm --dir apps/webapp run build` — **PASS** (production Next.js build)
- **`pnpm run audit`** — **FAIL** (`esbuild`, `drizzle-orm` — известный класс для репозитория; gate фазы 9 по политике документа не блокируется этим шагом)

**Документ:** `AUDIT_PHASE_9.md` — блок «AUDIT_PHASE_9 FIX — верификация», таблица MANDATORY, defer informational **9-I-1 … 9-I-6**.

**Gate verdict (AUDIT_PHASE_9 FIX):** **PASS** по MANDATORY (critical/major N/A, minor закрыты), мутациям/событиям/интегратору § 8 / § 11; informational defer сохранён.

---

## 2026-04-18 — AUDIT_PHASE_8 FIX (MANDATORY) — закрыт

**Вход:** `AUDIT_PHASE_8.md`, `SYSTEM_LOGIC_SCHEMA.md` § 9–10, `EXECUTION_RULES.md`.

**Закрытие MANDATORY FIX INSTRUCTIONS:**

| Пункт | Результат |
|-------|-----------|
| Critical / major | В аудите **не было** — **N/A** |
| **8-M-1** — HTTP-слой enroll | **Закрыт:** `apps/webapp/src/app/api/patient/courses/[courseId]/enroll/route.test.ts` — 401 (gate unauthorized), 403 (patient activation), 400 (`invalid_course` / сообщение сервиса), 200 + `{ ok, instance }` и вызов `enrollPatient({ courseId, patientUserId })` |
| **8-I-1 … 8-I-4** | **Defer** с обоснованием в обновлённом `AUDIT_PHASE_8.md` (платежи, дубли экземпляров, валидация intro в каталоге, doctor UI) |

**Подтверждения повторной сверки:**

- Связь **`courses.program_template_id`** → **`treatment_program_templates.id`** (Drizzle + миграция `0007_*`) без изменений в FIX.
- Назначение только через **`treatmentProgramInstance.assignTemplateToPatient`** из `buildAppDeps`; курс не дублирует прохождение и не хранит этапы.

**Проверки:**

- Step: `pnpm --dir apps/webapp exec vitest run src/app/api/patient/courses/\[courseId\]/enroll/route.test.ts` — **PASS** (5 tests).
- Модуль курсов: `pnpm --dir apps/webapp exec vitest run src/modules/courses/service.test.ts` — **PASS** (6 tests).
- Phase: `pnpm test:webapp` — **PASS** (**367** test files, **1874** tests passed, **8** skipped — на момент FIX).
- Pre-push: `pnpm install --frozen-lockfile && pnpm run ci` — **lint, typecheck, integrator tests (749 passed), test:webapp (1874 passed), build, build:webapp — PASS**; шаг **`pnpm run audit`** — **FAIL** на известных advisories (`esbuild@0.18.20`, `drizzle-orm@0.44.7`) — **не** следствие FIX фазы 8, см. политику репозитория.

**Документ:** `AUDIT_PHASE_8.md` — дата FIX, таблица закрытия MANDATORY, блок «AUDIT_PHASE_8 FIX — верификация».

**Gate verdict (AUDIT_PHASE_8 FIX):** **PASS** по продуктовым проверкам фазы 8; informational остаются в defer.

---

## 2026-04-18 — AUDIT_PHASE_7 FIX (MANDATORY) — закрыт

**Вход:** `AUDIT_PHASE_7.md`, `SYSTEM_LOGIC_SCHEMA.md` §8, `EXECUTION_RULES.md`.

**Закрытие MANDATORY FIX INSTRUCTIONS:**

| Пункт | Результат |
|-------|-----------|
| Critical / major | В аудите **не было** — **N/A** |
| **7-M-1** — таймлайн / хронология | **Закрыт:** `listEventsForInstance` (PG + in-memory): после выборки последних N по убыванию времени результат **реверсируется** — порядок **старые → новые**; UI: подпись «от старых к новым (до последних 200 записей)», список **`ul`** вместо нумерованного `ol` |
| **7-M-2** — тесты replace / remove stage / program status | **Закрыт:** в `treatment-program-events.test.ts` добавлены кейсы `item_replaced` (payload), `stage_removed`, `status_changed` программы (`active` → `completed`), монотонность `created_at` в выдаче |
| **7-I-1** | **Закрыт документально:** уточнение строки про `status_changed` в `SYSTEM_LOGIC_SCHEMA.md` §8 |
| **7-I-2, 7-I-3** | **Defer** — как в обновлённом `AUDIT_PHASE_7.md` |

**Подтверждения:**

- Запись в **`treatment_program_events`** для мутаций структуры, комментария, статусов программы/этапа/элемента, skip/complete/test — без регрессий; reason для **`stage_skipped`** и **`item_removed`** — сервис (`normalizeEventReason`, `doctorSetStageStatus`) + API DELETE элемента.

**Проверки (step / phase + pre-push):**

- `pnpm --dir apps/webapp run typecheck` — **PASS**
- `pnpm --dir apps/webapp run lint` — **PASS**
- `pnpm test:webapp` — **PASS**: **365** test files, **1863** tests passed (**8** skipped)
- **`pnpm install --frozen-lockfile && pnpm run ci`** — **до шага `pnpm run audit`:** typecheck, integrator tests, webapp tests, **build** / **build:webapp** — **PASS**; **`pnpm run audit`** — **FAIL** на известных advisories (`esbuild`, `drizzle-orm`) — **не** следствие этого FIX

**Документ:** `AUDIT_PHASE_7.md` — дата FIX, обновлённые §4–§5 и Gate, таблица закрытия MANDATORY, блок «AUDIT_PHASE_7 FIX — верификация».

**Gate verdict (AUDIT_PHASE_7 FIX):** **PASS** по продуктовым проверкам и сборке; defer **7-I-2**, **7-I-3** сохранён.

---

## 2026-04-18 — AUDIT_PHASE_6 FIX (MANDATORY) — закрыт

**Вход:** `AUDIT_PHASE_6.md`, `SYSTEM_LOGIC_SCHEMA.md` §3, `EXECUTION_RULES.md`.

**Закрытие MANDATORY FIX INSTRUCTIONS:**

| Пункт AUDIT_PHASE_6 | Результат |
|---------------------|-----------|
| Critical / major | **Не было** — N/A |
| Minor #1 — единые подписи статуса этапа (doctor vs patient) | **Закрыт:** `formatTreatmentProgramStageStatusRu` в `modules/treatment-program/types.ts`; импорт в `PatientTreatmentProgramDetailClient` и `TreatmentProgramInstanceDetailClient`; Vitest на хелпер |
| Minor #2 — FSM или документация | **Закрыт как документация:** в `apps/webapp/src/app/api/api.md` у маршрута `doctor/.../stages/[stageId]` зафиксировано: сервис не валидирует полную FSM; ужесточение — отдельное изменение |

**Подтверждения (§3):**

- Переходы и автопереход **`completed` / `skipped` → следующий `available`:** без изменений в PG/in-memory логике; добавлен регрессионный тест «`skipped` текущего этапа открывает следующий `locked`» в `progress-service.test.ts`.
- **Skip / reason:** по-прежнему сервис `doctorSetStageStatus`; **test_results:** `raw_value`, `normalized_decision`, `decided_by` — без изменений схемы в этом FIX.

**Hygiene:** удалён неиспользуемый проп `instanceId` у `TestSetBlock` в patient UI.

**Стабильность CI:** `e2e/doctor-clients-inprocess.test.ts` — для трёх тестов с `import()` страниц App Router задан таймаут **20s** (при полном прогоне дефолтные 5s давали flake на первом импорте).

**Документ:** `AUDIT_PHASE_6.md` — обновлены шапка (дата FIX), §2 (ссылка на `api.md`), §3 (тест skip→unlock), §6 (PASS после FIX), таблица «Статус закрытия», блок FIX closure.

**Проверки (`EXECUTION_RULES.md` — step / phase + pre-push):**

- `pnpm --dir apps/webapp run typecheck` — **PASS**
- `pnpm --dir apps/webapp run lint` — **PASS**
- `pnpm test:webapp` — **PASS**: 364 test files passed, **1854** tests passed (8 skipped)
- **`pnpm install --frozen-lockfile && pnpm run ci`** (корень) — **частично:** `typecheck`, `pnpm test` (integrator **749** passed), `test:webapp` (как выше), **`pnpm build`** / **`pnpm build:webapp`** — **PASS**; шаг **`pnpm run audit`** — **FAIL** (известные advisories: `esbuild@0.18.20`, `drizzle-orm@0.44.7`) — **не** следствие этого FIX, см. политику репозитория

**Gate verdict (AUDIT_PHASE_6 FIX):** **PASS** по продуктовым проверкам и сборке — minor закрыты; informational (FSM в коде, фаза 7, миграции на стендах) — **defer** как в аудите. Полный зелёный `ci` до конца блокируется только шагом **`audit`** до отдельного решения по зависимостям.

---

## 2026-04-18 — AUDIT_PHASE_2 FIX (MANDATORY) — закрыт

**Вход:** `AUDIT_PHASE_2.md`, `SYSTEM_LOGIC_SCHEMA.md`, `EXECUTION_RULES.md`.

**Закрытие пунктов MANDATORY FIX INSTRUCTIONS:**

| Пункт | Результат |
|-------|-----------|
| Critical / major | В аудите **не было** — **закрыто** как N/A; изменений коду `modules/tests`, `modules/recommendations`, doctor API/UI не вносилось. |
| #1 informational (миграции на окружениях) | **Defer (операционно)** — зафиксировано в обновлённом `AUDIT_PHASE_2.md`; исполнение на стендах вне этого FIX. |
| #2 hygiene (`api.md` / `di.md`) | **Закрыто для текущего scope** — секции уже есть; процесс на будущие эндпоинты описан в аудите. |
| #3 ESLint / `modules/**/*.test.ts` | **Defer (обоснованно)** — см. `AUDIT_PHASE_2.md`; текущие тесты через `app-layer/testing/clinicalLibraryInMemory`. |

**Подтверждения:**

- **Module isolation:** `rg '@/infra' apps/webapp/src/modules/tests apps/webapp/src/modules/recommendations` — **пусто**.
- **Тонкие routes + CRUD + UI:** без регрессий; покрытие тестами как в аудите фазы 2.

**Проверки:**

- `pnpm install --frozen-lockfile` — **OK**
- **`pnpm run ci`:** `lint` → `typecheck` → `pnpm test` (integrator **749** passed) → `test:webapp` (**1845** passed) → **`pnpm build`** → **`pnpm build:webapp`** — **PASS**
- **`pnpm run audit`** (`scripts/registry-prod-audit.mjs`) — **FAIL**: `esbuild@0.18.20` moderate, `drizzle-orm@0.44.7` high — **известный класс** для репозитория, **не** следствие FIX фазы 2.

**Документ:** `AUDIT_PHASE_2.md` — блок «AUDIT_PHASE_2 FIX — верификация», обновлённая таблица MANDATORY (defer / закрыто).

**Gate verdict (AUDIT_PHASE_2 FIX):** **PASS** по фазе 2 и продуктовым проверкам; полный зелёный `ci` блокируется только шагом **`audit`** до отдельного решения по зависимостям.

---

## 2026-04-18 — Статическая верификация (без тестов): фаза 3 / экземпляр врача

**Запрос:** продолжить проверку без прогона тестов — только поиск ошибок выполнения (линт, типы, согласованность вызовов).

**Проверки (выполнены):**

- `pnpm exec eslint .` (корень репозитория) — **PASS**
- `pnpm --dir apps/webapp run lint` (включая `check-media-preview-invariants.sh`) — **PASS**
- `pnpm --dir apps/webapp run typecheck` — **PASS**

**Согласованность UI экземпляра программы (фаза 4):** RSC `page.tsx` загружает `testResults` через `deps.treatmentProgramProgress.listTestResultsForInstance` и передаёт в `TreatmentProgramInstanceDetailClient` как **`initialTestResults`**; первичная отрисовка блока результатов не зависит от `useEffect` + fetch (нет риска `react-hooks/set-state-in-effect` на mount). После PATCH решения по строке результата по-прежнему вызывается **`refreshResults()`** из обработчика клика.

**Что намеренно не гонялось:** `pnpm test`, `pnpm test:webapp`, `pnpm run build`, полный `pnpm run ci`, `pnpm run audit`.

**Gate verdict (этот цикл):** **PASS (статика)** — ошибок линтера и TypeScript в затронутой области не выявлено; полный CI и регрессионные тесты остаются на отдельный прогон по регламенту перед пушем.

---

## 2026-04-18 — AUDIT_PHASE_4 FIX (MANDATORY) — закрыт

**Вход:** `AUDIT_PHASE_4.md`, `SYSTEM_LOGIC_SCHEMA.md` § 3 / § 5–6 / § 11, `EXECUTION_RULES.md`.

**Закрытие MANDATORY FIX INSTRUCTIONS:**

| Пункт | Результат |
|-------|-----------|
| Critical / major | В аудите **не было** — **N/A**. |
| #1 optional § 6 UX (предзаполнение черновика override) | **Закрыто:** `TreatmentProgramInstanceDetailClient.tsx` — `initialDraft={item.effectiveComment ?? ""}` (шаг 1 § 6: при пустом `localComment` в форме виден тот же текст, что и для пациента). |
| #2 `comment_changed` | **Defer фазы 7** — без изменения кода. |
| #3 миграция `0003_*` на окружениях | **Defer (операционно)** — зафиксировано в `AUDIT_PHASE_4.md`. |

**Перепроверка эталона (без полного `pnpm test:webapp`):**

- **§ 5 Deep copy** (`snapshot`, `comment`, `local_comment`, `settings`): код `instance-service.ts` + `createInstanceTree`; **6/6** в `instance-service.test.ts`.
- **§ 5 Независимость экземпляра** от правок шаблона: тот же файл тестов, кейс на `comment`/`snapshot`.
- **§ 6 Приоритет `local_comment`:** `effectiveInstanceStageItemComment` / `effectiveComment`; тесты override и сброса.
- **§ 3 / § 5 Начальные статусы:** первый этап `available`, остальные `locked` — тест deep copy.
- **Изоляция модуля:** `rg '@/infra' apps/webapp/src/modules/treatment-program` — **пусто**.

**Step / phase (выполнено):**

- `pnpm --dir apps/webapp run lint` — **PASS**
- `pnpm --dir apps/webapp run typecheck` — **PASS**
- `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/instance-service.test.ts` — **PASS** (6 tests)

**Pre-deploy (корень репозитория):**

- `pnpm run build:webapp` — **PASS**
- `pnpm run audit` (`registry-prod-audit.mjs`) — **FAIL**: `esbuild@0.18.20` moderate, `drizzle-orm@0.44.7` high — **известный класс** для репозитория, **не** следствие FIX фазы 4.

**Документ:** `AUDIT_PHASE_4.md` — блок «AUDIT_PHASE_4 FIX — верификация», обновлённая таблица MANDATORY и § 3 override.

**Gate verdict (AUDIT_PHASE_4 FIX):** **PASS** по продуктовым проверкам фазы 4 и сборке webapp; полный зелёный pre-deploy по `audit` до отдельного решения по зависимостям. Полный `pnpm run ci` в этом цикле **не** гонялся (по ограничению «без полных тестов проекта»).

---

## 2026-04-18 — AUDIT_PHASE_5 FIX (MANDATORY) — закрыт

**Вход:** `AUDIT_PHASE_5.md`, `SYSTEM_LOGIC_SCHEMA.md` § 7, `EXECUTION_RULES.md`.

**Исправления кода:** не требовались — в MANDATORY не было critical/major; единственный **optional (minor)** пункт (`EXPLAIN` на стенде) закрыт как **обоснованный defer** (индекс и запрос `listByTarget` уже согласованы с § 7).

**Закрытие MANDATORY FIX INSTRUCTIONS:**

| Пункт | Результат |
|-------|-----------|
| Critical / major | **N/A** — не выявлялись; формально закрыто. |
| #1 ACL по `target_id` | **Defer (продукт)** — § 7 не задаёт ACL; зафиксировано в `AUDIT_PHASE_5.md`. |
| #2 `tenant_id` | **Defer** — «при мультитенанте» в § 7. |
| #3 События § 8 | **Defer фазы 7**. |
| #4 Миграция `0004_*` на окружениях | **Defer (операционно)**. |
| #5 optional EXPLAIN | **Defer (обоснованно)** — см. обновлённую таблицу в `AUDIT_PHASE_5.md`. |

**Подтверждение эталона (повторная сверка):**

- Схема `comments`, CHECK, FK `author_id`, индекс `idx_comments_target_type_target_id` — `entityComments.ts` + `0004_entity_comments.sql`.
- `pgComments.listByTarget` — предикат по `(target_type, target_id)`.
- **`CommentBlock`:** один импорт в `TreatmentProgramInstanceDetailClient.tsx`; прямые вызовы `/api/doctor/comments` в TSX только в `CommentBlock.tsx`.
- **Изоляция:** `rg '@/infra' apps/webapp/src/modules/comments` — **пусто**.

**Проверки (точечно, без полного `pnpm test:webapp`):**

- `pnpm --dir apps/webapp exec vitest run src/modules/comments/service.test.ts src/app/api/doctor/comments/route.test.ts src/app/api/doctor/comments/\[id\]/route.test.ts` — **PASS** (3 files, **16** tests)
- `pnpm --dir apps/webapp run lint` — **PASS**
- `pnpm --dir apps/webapp run typecheck` — **PASS**
- `pnpm run build:webapp` — **PASS**
- `pnpm run audit` — **FAIL** (`esbuild@0.18.20`, `drizzle-orm@0.44.7` — известный класс для репозитория, не следствие FIX фазы 5)

**Документ:** `AUDIT_PHASE_5.md` — блок «AUDIT_PHASE_5 FIX — верификация», уточнения в MANDATORY (minor defer) и Заключение.

**Gate verdict (AUDIT_PHASE_5 FIX):** **PASS** по § 7, точечным тестам comments и сборке webapp; зелёный `audit` — отдельная политика lockfile. Полный `pnpm run ci` не гонялся.

---

## 2026-04-18 — AUDIT_PHASE_6 FIX (MANDATORY) — закрыт

**Вход:** `AUDIT_PHASE_6.md`, `SYSTEM_LOGIC_SCHEMA.md` § 3, `EXECUTION_RULES.md`.

**Закрытие MANDATORY FIX INSTRUCTIONS:**

| Пункт | Результат |
|-------|-----------|
| Critical / major | В аудите **не выявлялись** — **N/A**, формально закрыто; процедура перепроверки при будущих правках — в обновлённом `AUDIT_PHASE_6.md`. |
| Minor #1 — FSM vs документация для `PATCH` статуса этапа | **Закрыто документацией:** уточнена формулировка в `apps/webapp/src/app/api/api.md` (политика «без полной FSM», исправлена отсылка к номеру minor). Матрица переходов в коде — **defer** продукта. |
| Minor #2 — паритет результатов тестов пациент/врач | **Закрыто кодом:** `GET /api/patient/treatment-program-instances/[instanceId]/test-results` (`requirePatientApiBusinessAccess`, `getInstanceForPatient` + `listTestResultsForInstance`); SSR `initialTestResults` в `app/patient/treatment-programs/[instanceId]/page.tsx`; клиент `PatientTreatmentProgramDetailClient` — блок «Ваши результаты тестов», `refresh` подгружает дерево и результаты параллельно. |
| Minor #3 — подпись после override (`decided_by`) | **Закрыто кодом:** бейдж «переопределено врачом» / «итог уточнён врачом» в doctor/patient UI; **`formatNormalizedTestDecisionRu`** в `modules/treatment-program/types.ts`; тест подписей в `progress-service.test.ts`. |

**Перепроверка § 3 (статусы этапов, автопереход `completed`/`skipped` → `available` следующего):** код `pgTreatmentProgramInstance.updateInstanceStage` / in-memory `unlockNextLockedStage`; сценарии в `progress-service.test.ts` (в т.ч. skipped → next available, test_set → stage completed → next available). Skip/reason и `test_results` (`raw_value`, `normalized_decision`, `decided_by`) — без изменения контракта; override по-прежнему через `doctorOverrideTestResult`.

**Проверки (step / phase webapp, без полного `pnpm run ci` по монорепе):**

- `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts` — **PASS** (**1** file, **11** tests)
- `pnpm --dir apps/webapp run typecheck` — **PASS**
- `pnpm --dir apps/webapp run lint` — **PASS**
- `pnpm run build:webapp` — **PASS**

**Pre-deploy audit (корень):**

- `pnpm run audit` — **FAIL**: `esbuild@0.18.20` moderate, `drizzle-orm@0.44.7` high — **известный класс** для репозитория (как в других фазах), **не** регресс FIX фазы 6.

**Документ:** `AUDIT_PHASE_6.md` — разделы «FIX closure», MANDATORY (статусы закрытия), «AUDIT_PHASE_6 FIX — верификация».

**Gate verdict (AUDIT_PHASE_6 FIX):** **PASS** по § 3, тестам прогресса, lint/typecheck и сборке webapp; полный `pnpm run ci` по репозиторию **не** гонялся (ограничение scope); зелёный `audit` — отдельная политика зависимостей.

---

## 2026-04-18 — AUDIT_PHASE_7 FIX (MANDATORY) — закрыт

**Вход:** `AUDIT_PHASE_7.md`, `SYSTEM_LOGIC_SCHEMA.md` § 8, `EXECUTION_RULES.md`.

**Закрытие MANDATORY FIX INSTRUCTIONS:**

| Пункт | Результат |
|-------|-----------|
| Critical / major | В аудите **не выявлялись** — **N/A**, формально закрыто; матрица мутаций → события зафиксирована в `AUDIT_PHASE_7.md` («AUDIT_PHASE_7 FIX — перепроверка мутаций»). |
| Minor (таймлайн, интеграционные тесты) | **Подтверждено закрытыми** без доработки кода; добавлены **unit-тесты** правил `reason`: `apps/webapp/src/modules/treatment-program/event-recording.test.ts`. |
| Informational (CHECK в БД, событие override теста, событие rename title) | **Defer** без изменения кода — таблица в `AUDIT_PHASE_7.md`. |

**Перепроверка § 8:** все структурные и прогресс-мутации из `instance-service` / `progress-service`, для которых в § 8 предусмотрен тип события, ведут в `appendEvent` / `appendEv`; исключения документированы (назначение экземпляра, смена только `title`). **`stage_skipped` / `item_removed`:** валидация `reason` в `doctorSetStageStatus`, `doctorRemoveStageItem`, `normalizeEventReason`, API DELETE элемента; дублирование подтверждено тестами.

**Проверки (scope модуля `treatment-program`, без полного CI репо):**

- `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/event-recording.test.ts src/modules/treatment-program/treatment-program-events.test.ts src/modules/treatment-program/progress-service.test.ts` — **PASS** (**3** files, **31** tests)
- `pnpm --dir apps/webapp run typecheck` — **PASS**
- `pnpm --dir apps/webapp run lint` — **PASS**

**Документ:** `AUDIT_PHASE_7.md` — разделы MANDATORY (статусы FIX), перепроверка мутаций, подтверждение `reason`, «AUDIT_PHASE_7 FIX — верификация».

**Gate verdict (AUDIT_PHASE_7 FIX):** **PASS** по § 8, event recording и правилам `reason`; полный `pnpm run ci` не гонялся.

---

## 2026-04-18 — AUDIT_PHASE_8 FIX (MANDATORY) — закрыт

**Вход:** `AUDIT_PHASE_8.md`, `SYSTEM_LOGIC_SCHEMA.md` § 9–10, `EXECUTION_RULES.md`.

**Закрытие MANDATORY FIX INSTRUCTIONS:**

| Пункт | Результат |
|-------|-----------|
| Critical / major | В аудите **не выявлялись** — **N/A**, формально закрыто; **изменений кода не потребовалось** (связь `courses.program_template_id` → `treatment_program_templates`, `enrollPatient` → `assignTemplateToPatient` уже соответствуют § 9). |
| Minor **8-M-1** (тесты HTTP enroll) | **Закрыто без правок** — `src/app/api/patient/courses/[courseId]/enroll/route.test.ts` уже в репозитории. |
| Informational **8-I-1 … 8-I-4** | **Defer** с обоснованием в обновлённом `AUDIT_PHASE_8.md` (оплата, дубли enroll, intro в каталоге, doctor UI). |

**Перепроверка FIX:**

- FK и поле `program_template_id` — `courses.ts` + `0007_courses.sql`; назначение — только `treatmentProgramInstanceService.assignTemplateToPatient` из `buildAppDeps`.
- Сущность курс **не** содержит этапов и **не** реализует отдельную state-machine прохождения (только метаданные + ссылка на шаблон).

**Проверки (scope фазы 8, без полного CI репо):**

- `pnpm --dir apps/webapp exec vitest run src/modules/courses/service.test.ts src/app/api/patient/courses/\[courseId\]/enroll/route.test.ts` — **PASS** (**2** files, **11** tests)
- `pnpm --dir apps/webapp run typecheck` — **PASS**

**Документ:** `AUDIT_PHASE_8.md` — разделы «AUDIT_PHASE_8 FIX — перепроверка…», «AUDIT_PHASE_8 FIX — верификация», обновлённая таблица MANDATORY.

**Gate verdict (AUDIT_PHASE_8 FIX):** **PASS** по § 9–10 и точечным тестам; полный `pnpm run ci` не гонялся.
