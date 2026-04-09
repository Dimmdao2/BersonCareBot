# Audit — Stage 1 (integrator canonical DDL)

**Дата аудита:** 2026-04-10  
**Follow-up (закрытие замечаний аудита):** 2026-04-10 — см. [§7](#7-follow-up-2026-04-10--закрытие-замечаний-аудита).  
**Повторный аудит (pass 2):** 2026-04-10 — см. [§8](#8-повторный-аудит-stage-1-pass-2).  
**Источник требований:** [`STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md`](STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md), [`MASTER_PLAN.md`](MASTER_PLAN.md) (строка Deploy 1 / Stage 1)

---

## 1) Размещение миграции

| Критерий | Статус |
|----------|--------|
| Файл в `apps/integrator/src/infra/db/migrations/core/` | **PASS** |

**Факт:** `apps/integrator/src/infra/db/migrations/core/20260410_0001_users_merged_into_user_id.sql`.

---

## 2) Колонка `users.merged_into_user_id`: nullable и FK на `users(id)`

| Критерий | Статус |
|----------|--------|
| Тип `BIGINT`, явно `NULL` (nullable) | **PASS** |
| Внешний ключ на `users(id)` | **PASS** |

Фрагмент миграции:

```4:6:apps/integrator/src/infra/db/migrations/core/20260410_0001_users_merged_into_user_id.sql
ALTER TABLE users
  ADD COLUMN merged_into_user_id BIGINT NULL REFERENCES users (id);
```

**Замечание (не блокер):** для ссылающейся строки при удалении канонического `users.id` сработает поведение FK по умолчанию (`NO ACTION` / `RESTRICT`). Политика каскадов для v2 merge — предмет Stage 3+; Stage 1 только добавляет колонку.

---

## 3) CHECK (запрет self-reference) и индекс для alias lookup

| Критерий | Статус |
|----------|--------|
| CHECK: нельзя `merged_into_user_id = id` при non-null указателе | **PASS** |
| Индекс по `merged_into_user_id` для поиска alias → canonical | **PASS** (частичный индекс, только `IS NOT NULL`) |

```7:14:apps/integrator/src/infra/db/migrations/core/20260410_0001_users_merged_into_user_id.sql
ALTER TABLE users
  ADD CONSTRAINT users_merged_into_user_id_not_self_check
  CHECK (merged_into_user_id IS NULL OR merged_into_user_id <> id);

CREATE INDEX idx_users_merged_into_user_id
  ON users (merged_into_user_id)
  WHERE merged_into_user_id IS NOT NULL;
```

Сверка со спецификацией Stage 1: формулировка CHECK совпадает с черновиком DDL в [`STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md`](STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md) (`IS NULL OR <> id`). Имя индекса в репозитории — `idx_users_merged_into_user_id` (в спеке был пример `idx_users_merged_into_*`); семантика та же.

**~~Замечание~~ / устранено (follow-up 2026-04-10):** в [`CHECKLISTS.md`](CHECKLISTS.md) Deploy 1 чекбокс выровнен под канонический DDL миграции (CHECK + имена constraint / индекса).

**Не в scope Stage 1:** optional constraint «цепочка глубины > 1» из спеки — намеренно не вводился; диагностика цепочек остаётся в [`sql/diagnostics_integrator_users_merge.sql`](sql/diagnostics_integrator_users_merge.sql).

---

## 4) Документация: обновлена и согласована

| Документ | Статус | Комментарий |
|----------|--------|-------------|
| [`apps/integrator/src/infra/db/schema.md`](../../apps/integrator/src/infra/db/schema.md) § `users` | **PASS** | Описаны колонка, смысл NULL vs alias, CHECK, partial index. |
| [`docs/ARCHITECTURE/DB_STRUCTURE.md`](../ARCHITECTURE/DB_STRUCTURE.md) § 1.1 | **PASS** | `users` и связь `users.merged_into_user_id -> users.id` отражены. |

**Согласованность с [`STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md`](STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md):** разделы «Предлагаемый DDL» и инварианты (canonical = NULL, alias → canonical) соответствуют реализации.

**~~Ограничение дампов~~ / устранено (follow-up 2026-04-10):** `docs/ARCHITECTURE/DB_DUMPS/integrator_bersoncarebot_dev_schema.sql` синхронизирован с миграцией Stage 1 (`merged_into_user_id`, CHECK, index, FK).

**~~Мелкая устаревшая формулировка~~ / устранено (follow-up 2026-04-10):** в [`STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md`](STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md) контекст схемы явно разделяет состояние до и после Deploy 1 и ссылается на `20260410_0001_…`.

---

## 5) CI evidence

| Проверка | Результат |
|----------|-----------|
| Полный pipeline репозитория | **`pnpm run ci`** — **OK** (exit code 0) |

**Прогон для этого аудита:** 2026-04-10, из корня репозитория:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

**Фактический состав `ci` (корневой `package.json`):** `pnpm lint` → `pnpm typecheck` (integrator + webapp) → `pnpm test` (integrator vitest) → `pnpm test:webapp` → `pnpm build` → `pnpm build:webapp` → `pnpm audit --prod`.

**Итог прогона:** integrator **619 passed** (6 skipped); webapp **1391 passed** (5 skipped); сборки и audit — без ошибок.

**Репозиторный журнал:** [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) — запись «2026-04-10 — Stage 1: integrator canonical schema (`merged_into_user_id`)» с перечнем артефактов и **Gate verdict: PASS**.

**Вне scope автоматического CI:** применение SQL к реальной integrator БД (`pnpm --dir apps/integrator run db:migrate` на dev / host migrate на prod) — операционный шаг Deploy 1; в CI миграции к живому Postgres обычно не гоняются.

---

## Gate verdict (Stage 1)

**PASS** — миграция на месте, DDL соответствует спецификации Stage 1, документация в `schema.md` и `DB_STRUCTURE.md` согласована с кодом миграции, полный **`pnpm run ci`** зелёный на дату аудита.

---

## MANDATORY FIX INSTRUCTIONS

Использовать, если повторный аудит или CI выявил расхождение со спецификацией Stage 1.

### §1 Миграция отсутствует или лежит не в `core/`

1. Убедиться, что существует файл  
   `apps/integrator/src/infra/db/migrations/core/20260410_0001_users_merged_into_user_id.sql`  
   с содержимым, эквивалентным п. §1–§3 этого отчёта (nullable `BIGINT`, `REFERENCES users(id)`, CHECK self-reference, partial index).
2. Не размещать этот DDL в integration-specific `src/integrations/*/db/migrations/` — каноническая таблица `users` относится к core-слою.

### §2 Нарушены nullable / FK / CHECK / index

1. Сверить живую БД: `\d users` (или `information_schema` / `pg_constraint`) на integrator DB.
2. Если миграция не применялась — выполнить штатный migrate для integrator (см. `deploy/HOST_DEPLOY_README.md` и `docs/ARCHITECTURE/SERVER CONVENTIONS.md` для env и процедуры на хосте).
3. Если объектов не хватает из-за ручного вмешательства — **не** править прод «вслепую»; восстановить согласованность через повторный прогон миграций из репозитория или откат + повтор apply по runbook.

### §3 Документация противоречит миграции

1. Привести в соответствие:
   - `apps/integrator/src/infra/db/schema.md` (раздел `users`);
   - `docs/ARCHITECTURE/DB_STRUCTURE.md` § 1.1 (integrator `users` / связи).
2. Имена constraint и индекса в тексте доков должны совпадать с миграцией (`users_merged_into_user_id_not_self_check`, `idx_users_merged_into_user_id`).

### §4 CI не зелёный

1. Из корня: `pnpm install --frozen-lockfile && pnpm run ci`.
2. Устранить падения lint / typecheck / test / build по выводу CI (не относится к Stage 1, но блокирует merge).
3. Для webapp build при странных ошибках кэша — см. практику из [`AUDIT_STAGE_A.md`](AUDIT_STAGE_A.md) (чистый `apps/webapp/.next`, избегать параллельного `next build`).

### §5 Операционный deploy (после merge в main)

1. Применить integrator-миграции на целевой БД согласно принятому в проекте процессу (dev/staging/prod).
2. Валидация post-deploy: [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) — `\d users`, наличие колонки `merged_into_user_id`.

### §6 Необязательные улучшения (не MANDATORY для PASS)

**Выполнено follow-up 2026-04-10** (п. 1–3 первичного аудита): обновлены [`STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md`](STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md), [`CHECKLISTS.md`](CHECKLISTS.md) Deploy 1, [`integrator_bersoncarebot_dev_schema.sql`](../ARCHITECTURE/DB_DUMPS/integrator_bersoncarebot_dev_schema.sql).

---

## 7) Follow-up 2026-04-10 — закрытие замечаний аудита

Закрыты пункты, отмеченные в первичном отчёте как неблокирующие / §6 optional:

| Замечание | Действие |
|-----------|----------|
| Устаревший контекст «`users` сегодня» в Stage 1 spec | В [`STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md`](STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md) раздел «Контекст схемы» разделён на **до Deploy 1** / **после Deploy 1** с именем миграции. |
| Расхождение формулировки CHECK в `CHECKLISTS.md` | Deploy 1 чекбокс приведён к `CHECK (merged_into_user_id IS NULL OR merged_into_user_id <> id)` и именам `users_merged_into_user_id_not_self_check`, `idx_users_merged_into_user_id`. |
| Дамп integrator без новой колонки | В [`integrator_bersoncarebot_dev_schema.sql`](../ARCHITECTURE/DB_DUMPS/integrator_bersoncarebot_dev_schema.sql) добавлены колонка, CHECK, partial index, FK (в стиле существующего pg_dump-артефакта). |

**Проверки после правок:** целевой integrator vitest (`writePort.userUpsert.test.ts`, `userLookup.test.ts`) + полный **`pnpm run ci`** — см. [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md).

---

## 8) Повторный аудит Stage 1 (pass 2)

**Дата:** 2026-04-10  
**Цель:** повторно проверить §1–§5 первичного аудита, факт закрытия замечаний §7, согласованность связанной документации v2; зафиксировать свежий полный CI.

### Сводка проверок

| Область | Что сделано | Результат |
|--------|-------------|-----------|
| **§1 Миграция** | Путь `apps/integrator/src/infra/db/migrations/core/20260410_0001_users_merged_into_user_id.sql`, наличие файла | **PASS** |
| **§2 Колонка + FK** | `BIGINT NULL`, `REFERENCES users (id)` в миграции | **PASS** |
| **§3 CHECK + index** | Constraint `users_merged_into_user_id_not_self_check`, partial index `idx_users_merged_into_user_id` | **PASS** |
| **Follow-up CHECKLISTS** | [`CHECKLISTS.md`](CHECKLISTS.md) Deploy 1 — CHECK и имена объектов как в миграции | **PASS** |
| **Follow-up STAGE_1** | [`STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md`](STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md) — контекст до/после Deploy 1; в § «Предлагаемый DDL» имя индекса приведено к **`idx_users_merged_into_user_id`** (устранён остаточный пример `idx_users_merged_into_*`) | **PASS** |
| **Follow-up дамп** | [`integrator_bersoncarebot_dev_schema.sql`](../ARCHITECTURE/DB_DUMPS/integrator_bersoncarebot_dev_schema.sql) — `merged_into_user_id`, CHECK, index, FK `users_merged_into_user_id_fkey` | **PASS** |
| **`schema.md` / `DB_STRUCTURE.md`** | Разделы `users` / §1.1 integrator | **PASS** |
| **MASTER_PLAN** | Таблица этапов: Deploy 1 = DDL `merged_into_user_id` без смены поведения | **PASS** |
| **Журнал** | [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) — записи Stage 1 и Stage 1 follow-up | **PASS** |
| **§5 CI** | `pnpm install --frozen-lockfile` && **`pnpm run ci`** из корня (pass 2) | **OK** — integrator **619 passed** (6 skipped); webapp **1391 passed** (5 skipped); lint, typecheck, build, `pnpm audit --prod` без ошибок |

### Ограничения evidence (без изменений)

- Применение миграции к **живой** integrator БД и smoke API на окружении в этом прогоне **не выполнялись** (как в §5 первичного аудита).
- Полный operational sign-off Deploy 1 — по [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) и host-процедурам.

### Gate verdict (pass 2)

**PASS** — пункты первичного аудита и follow-up подтверждены; документация согласована с миграцией; **`pnpm run ci`** зелёный на дату pass 2.

---

## Ссылки

- Спека этапа: [`STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md`](STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md)
- Журнал агента: [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md)
- Мастер-план v2: [`MASTER_PLAN.md`](MASTER_PLAN.md)
