# Инструкции для AI-агентов — BersonCareBot

Этот файл — **единая точка входа** для агентов Cursor. Cursor автоматически подхватывает `AGENTS.md` в корне репозитория.

**Канонический источник правил:** `.cursor/rules/*.mdc` и `.cursor/rules/test-execution-policy.md`. При расхождении приоритет у файлов в `.cursor/rules/` (там есть `globs` и `alwaysApply` для scoped-правил). При изменении правил обновляйте **оба** места.

**Перед существенной работой** прочитайте также:
- `README.md`
- `docs/README.md`
- `docs/ARCHITECTURE/SERVER CONVENTIONS.md`
- `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` — **dev-серверы, dev-bypass вход в кабинеты, живое UI-тестирование**
- `deploy/HOST_DEPLOY_README.md`

---

## Оглавление

1. [Онбординг и server conventions](#1-онбординг-и-server-conventions)
1a. [Локальный dev и тестирование UI](#1a-локальный-dev-и-тестирование-ui)
1b. [Безопасность dev-среды: изоляция от прод](#1b-безопасность-dev-среды-изоляция-от-прод-и-реальных-каналов)
2. [CRITICAL: конфигурация интеграций только в БД](#2-critical-конфигурация-интеграций-только-в-бд)
3. [Runtime config: env vs database](#3-runtime-config-env-vs-database)
4. [system_settings: зеркало public + integrator](#4-system_settings-зеркало-public--integrator)
5. [Clean Architecture: изоляция модулей](#5-clean-architecture-изоляция-модулей)
6. [Host: PostgreSQL и DATABASE_URL](#6-host-postgresql-и-database_url)
7. [Git: коммит и пуш](#7-git-коммит-и-пуш)
8. [Команда «пуш»](#8-команда-пуш)
9. [Перед пушем — полный CI](#9-перед-пушем--полный-ci)
10. [Test execution and audit policy](#10-test-execution-and-audit-policy)
11. [Webapp-тесты: компактность](#11-webapp-тесты-компактность)
12. [Plan Authoring And Execution Standard](#12-plan-authoring-and-execution-standard)
13. [Формат ответа: ИТОГ](#13-формат-ответа-итог)
14. [Коммуникация без навязанных концовок](#14-коммуникация-без-навязанных-концовок)
15. [Patient UI Shared Primitives](#15-patient-ui-shared-primitives)
16. [Doctor UI Shared Primitives](#16-doctor-ui-shared-primitives)
17. [Patient / Doctor UI Isolation](#17-patient--doctor-ui-isolation)
18. [Пациент: «ЛФК» = программа реабилитации](#18-пациент-лфк--программа-реабилитации)
19. [Patient media playback (HLS / MP4)](#19-patient-media-playback-hls--mp4) — *scoped: patient routes*
20. [CMS: единый layout медиа-пикера](#20-cms-единый-layout-медиа-пикера) — *scoped: doctor CMS*
21. [UI: тексты без избыточных пояснений](#21-ui-тексты-без-избыточных-пояснений)
22. [UI: Select — displayLabel](#22-ui-select--displaylabel)
23. [Справочник вне .cursor/rules](#23-справочник-вне-cursorrules)
24. [Оркестрация субагентов](#24-оркестрация-субагентов)

---

## 1. Онбординг и server conventions

*Источник: `.cursor/rules/server-conventions-and-doc-onboarding.mdc` (alwaysApply)*

- At the start of every new chat, first familiarize yourself with core project docs before giving substantial guidance:
  - `README.md`
  - `docs/README.md`
  - `docs/ARCHITECTURE/SERVER CONVENTIONS.md`
  - `deploy/HOST_DEPLOY_README.md`
- For any server, deploy, prod, systemd, nginx, env, path, port, DB, backup, migration, backfill, reconcile, or cutover question:
  - Treat `docs/ARCHITECTURE/SERVER CONVENTIONS.md` as the primary source of truth for confirmed runtime facts.
  - Use exact names and paths from that file. Never invent or guess paths, service names, env file names, DB names, ports, URLs, or users.
- **PostgreSQL on host:** Never instruct `psql "$DATABASE_URL"` without the full `set -a && source /opt/env/bersoncarebot/<api.prod|webapp.prod> && set +a` preamble — see раздел [Host: PostgreSQL](#6-host-postgresql-и-database_url). Commands must be copy-paste complete.
- If a required runtime fact is missing or not explicitly confirmed in docs:
  - Say clearly that the value is missing/unconfirmed.
  - Give exact commands to discover it on the host.
  - Then update the documentation with the newly confirmed non-secret fact so the next chat does not repeat the discovery.
- When adding discovered server facts to docs:
  - Store only non-secret operational facts in docs (paths, unit names, port numbers, DB names, env key names, URLs, users, ownership).
  - Never write secrets, passwords, tokens, or full credential-bearing connection strings into repo docs.

**Production-хост:** пользователь `deploy` **не имеет** произвольного `sudo` в SSH — только whitelist (systemctl bersoncarebot-*, backup). Не давать агенту `sudo rm/chown/cp` от `deploy`; root-операции — явно «от root». Подробно: `docs/ARCHITECTURE/SERVER CONVENTIONS.md` §«КРИТИЧНО: deploy».

---

## 1a. Локальный dev и тестирование UI

*Канон: [`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`](docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md)*

### Запуск

| Команда | Назначение |
|---------|------------|
| `pnpm run dev` | integrator + webapp (полный стек) |
| `pnpm run webapp:dev` | только webapp (`127.0.0.1:5200`) |
| `pnpm run dev:turbo` | webapp, Turbopack (быстрый HMR) |
| `pnpm --dir apps/webapp run dev:visual` | webapp + file polling (VM/Docker) |
| `pnpm run dev:integrator` | только API `:4200` |
| `pnpm run worker:dev` / `scheduler:dev` | фоновые процессы integrator |
| `pnpm run dev:stop` | освободить dev-порты 5200/4200 |

Перед UI-тестом: `pnpm run migrate`, env из `.env` + `apps/webapp/.env.dev`.

### Dev-bypass (вход без Telegram)

Требуется `ALLOW_DEV_AUTH_BYPASS=true` в `apps/webapp/.env.dev`. Хост — **`http://127.0.0.1:5200`**, не `localhost`.

| `token` | Роль |
|---------|------|
| `dev:admin` | врач + admin mode (настройки, audit-log) |
| `dev:doctor` | только кабинет специалиста |
| `dev:client` | пациент |

```
http://127.0.0.1:5200/api/auth/dev-bypass?token=dev%3Aadmin
# затем /app/doctor/clients или полный URL страницы
```

Проверка: `curl -s -c /tmp/c.cookies -L "…dev-bypass…"` → `curl -s -b /tmp/c.cookies http://127.0.0.1:5200/api/me`.

**Скриншоты авторизованных страниц без браузер-MCP** (headless chromium, двухшаговая схема с флашем cookie) — канон в [`LOCAL_DEV_AND_AGENT_TESTING.md`](docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md) §4.7. Главное: `next` для doctor/admin игнорируется; на auth-шаге chromium запускать **без** `--virtual-time-budget` (иначе cookie не сохранится в профиль).

**Не путать:** `system_settings.dev_mode` в БД — тестовые аккаунты в аналитике, не вход.

Подробности, curl, browser MCP, типовые сценарии — в каноническом документе выше.

---

## 1b. Безопасность dev-среды: изоляция от прод и реальных каналов

*Источник: `.cursor/rules/dev-prod-isolation-no-real-creds.mdc` (alwaysApply)*

Прод и dev — на одной машине. Прод: из `/opt/projects/bersoncarebot` (+ `/opt/env/bersoncarebot/*`, systemd `bersoncarebot-*-prod.service`, БД `bcb_webapp_prod`). Dev: из репо (`pnpm dev` → webapp `:5200` + integrator `:4200`, env `/.env` + `apps/webapp/.env.dev`, БД `bcb_webapp_dev`). Канонические пути — только из `docs/ARCHITECTURE/SERVER CONVENTIONS.md`.

1. **Реальные креды — только на проде.** Dev-env НЕ содержит реальных prod-секретов внешних каналов (Telegram / Rubitime / MAX / SMSC / S3) — они только в `/opt/env/bersoncarebot/*`. В dev: `NODE_ENV=development`, send-креды пустые, `MAX_ENABLED=false` / `SMSC_ENABLED=false`. Нашёл реальные креды в dev-env — очистить и сообщить владельцу.
2. **Dev не шлёт реально.** В `development` доставка = no-op/мок. Не делать действий, способных отправить реальное сообщение/SMS в Telegram / Rubitime / SMSC / MAX или записать в реальный S3 из dev (тестовые записи, рассылки, ретраи). `INTEGRATOR_API_URL` в dev — только локальный `127.0.0.1:4200`.
3. **Dev-БД = реальные ПДн.** `bcb_webapp_dev` — копия прод-дампа с реальными данными пациентов: только read-only SELECT при необходимости, не писать, не слать уведомления, не печатать ПДн в чат/логи.
4. **Прод не трогать из dev.** Не подключаться к `bcb_webapp_prod`, не читать `/opt/env/*`, не дёргать прод-сервисы — только по явному запросу владельца и канону SERVER CONVENTIONS (+ раздел [Host: PostgreSQL](#6-host-postgresql-и-database_url)).
5. **Секреты не печатать.** Значения `.env`/секретов — маскировать; не вставлять креды в чат / логи / коммиты / доки.
6. **Не удалять `.next`/кэш работающих серверов вслепую** — сперва `pgrep -af next`.

---

## 2. CRITICAL: конфигурация интеграций только в БД

*Источник: `.cursor/rules/000-critical-integration-config-in-db.mdc` (alwaysApply)*

## Absolute rule for all agents

- **Do not add or use new env vars for integration configuration.**
- **Do not store integration API keys/tokens in env.**
- **Do not store integration webhook URLs/URIs in env.**
- **Use `system_settings` (scope `admin`) as the source of truth.**

## Mandatory storage target

- Store integration config in webapp DB table `system_settings` with `scope='admin'`.
- Keys must be included in `apps/webapp/src/modules/system-settings/types.ts` (`ALLOWED_KEYS`).
- Values must be editable via admin settings flow (`/api/admin/settings` + Settings UI).

## Integrator/webapp implementation rule

- Integrator and webapp must read integration keys/URIs from DB-backed config accessors.
- Env can remain only for process bootstrap/infra (`DATABASE_URL`, `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`) and temporary backward-compat fallback during migration.
- Any new integration feature that proposes env vars for keys/URIs is considered invalid and must be redesigned to DB config.
- `public.system_settings` and `integrator.system_settings` must stay aligned: webapp writes go through `updateSetting` (which syncs to integrator until refactored). Production typically uses **one** PostgreSQL (schemas `public` + `integrator`) — see `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`, раздел [system_settings mirror](#4-system_settings-зеркало-public--integrator), `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`.

---

## 3. Runtime config: env vs database

*Источник: `.cursor/rules/runtime-config-env-vs-db.mdc` (alwaysApply)*

When adding or moving configuration:

### Use environment variables only for

- Infrastructure connection strings (e.g. `DATABASE_URL`).
- Process-level deploy defaults that must not be tenant-specific: `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`.

### Use webapp `system_settings` (scope `admin`) for

- Integration API keys/tokens and integration webhook URLs/URIs.
- Operational values editable without redeploy: public URLs, feature flags, **IANA timezones for business-facing text**, whitelists, etc.
- Keys must be added to `ALLOWED_KEYS` in `apps/webapp/src/modules/system-settings/types.ts` and exposed in admin Settings UI when user-facing.

### Integrator

- Integrator has `integrator.system_settings` (mirror of `public.system_settings`); rows are **pushed** from webapp after each `updateSetting` via `syncSettingToIntegrator` until refactored to direct SQL (see `service.ts` / `syncToIntegrator.ts`). Production uses **one** PostgreSQL with schemas `integrator` and `public` — see `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`.
- Do not add new env vars for values that belong in `system_settings`.
- When adding or changing keys: follow раздел [system_settings mirror](#4-system_settings-зеркало-public--integrator) so both schemas stay aligned.

See `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`.

---

## 4. system_settings: зеркало public + integrator

*Источник: `.cursor/rules/system-settings-integrator-mirror.mdc` (alwaysApply)*

Production uses **one PostgreSQL database** with schemas **`public`** (webapp tables including `system_settings`) and **`integrator`**. Integrator holds a mirror table `system_settings` with the same logical keys `(key, scope)` and JSON `value_json`. Until refactored, push from webapp may still use signed HTTP `syncSettingToIntegrator`; do not bypass `updateSetting` for writes from webapp.

### Mandatory rules for agents

1. **Never** insert/update `system_settings` only in one DB in application code. **Always** go through webapp `createSystemSettingsService().updateSetting` (or the same path used by admin/doctor Settings API), which runs `syncSettingToIntegrator` after upsert.
2. **New setting keys:** add to `ALLOWED_KEYS` in `apps/webapp/src/modules/system-settings/types.ts` first. Use the **same string** for `key` and the same `scope` (`admin` | `doctor` | `global`) in both `public.system_settings` and `integrator.system_settings`. Do not invent divergent key names per app.
3. **Migrations / SQL scripts / seeds** that write `system_settings` in `public` must either:
   - duplicate the same row into `integrator.system_settings` in a migration, **or**
   - document a follow-up admin "save" in Settings UI to push via HTTP sync, **or**
   - call the same sync mechanism from a one-off ops script (signed POST to integrator).
4. **Do not** add a second sync call in Next.js route handlers; sync lives in `service.ts` only.

Canonical docs: `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`, `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`.

---

## 5. Clean Architecture: изоляция модулей

*Источник: `.cursor/rules/clean-architecture-module-isolation.mdc` (alwaysApply)*

Every module in `apps/webapp/src/modules/` must follow strict layered isolation:

### 1. Modules MUST NOT import infra directly (DB + repos)

**Architecture rule:** `modules/*` must not reach `@/infra/db/*` or `@/infra/repos/*` — use `modules/*/ports.ts`, infra implementations, and DI (`buildAppDeps`).

**ESLint (phase 0, webapp):** `no-restricted-imports` enforces **only** those two families for `src/modules/**` and `src/app/api/**/route.ts`. It does **not** flag other `@/infra/*` imports (for example `@/infra/s3/client`, `@/infra/logging/*`) — those are still discouraged where a port exists; a stricter or wider rule would be a **separate** change and backlog sync.

```
FORBIDDEN in modules/**/*.ts (non-test) — and what ESLint currently errors on:
  import { getPool } from "@/infra/db/client"     // error
  import { x } from "@/infra/repos/pgSomething" // error

Not auto-failed by phase-0 ESLint (still use ports / follow project rules):
  import { createS3Client } from "@/infra/s3/client"
```

Legacy violations of the **ESLint patterns** are allowlisted in `apps/webapp/eslint.config.mjs` — **do NOT add new files to the allowlist**.

### 1a. Product absolutes (TREATMENT_PROGRAM_INITIATIVE)

From `docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md` — same as "Абсолютные запреты" items 4–6:

- **LFK catalog and complex templates:** a doctor-facing **complex template** groups exercises for faster inclusion in **treatment programs**; it must not sprawl into a competing domain beside assignments/programs. **Schema changes** to `lfk_exercises`, `lfk_exercise_media`, `lfk_complex_templates`, `lfk_complex_template_exercises`, `lfk_complexes`, `lfk_complex_exercises`, `lfk_sessions`, `patient_lfk_assignments` are **allowed** when justified (Drizzle migrations, rollout/compatibility plan, regression coverage). A former hard ban "do not alter these tables" was a **phase gate** and is **lifted**. **Do not** introduce a parallel "LFK engine" that replaces the programs/assignment path without an explicit product decision.
- **Do not build a separate "course engine"** with its own stage/progress logic. A **course** is a link to a `treatment_program_template` (and instance creation reuses the same assignment path as the program feature).
- **No database FK on `item_ref_id`** — polymorphic reference; validate only in the service layer.

### 1b. Process absolutes (TREATMENT_PROGRAM_INITIATIVE)

From `docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md` — same as "Абсолютные запреты" items 7–8:

- **Do not mix initiative phases.** One phase per logical batch of work; do not start phase N+1 before phase N passes its gate. Step vs phase validation: раздел [Test execution policy](#10-test-execution-and-audit-policy).
- **Do not change the GitHub CI workflow** without an explicit team decision. Pre-push expectation: раздел [Перед пушем — полный CI](#9-перед-пушем--полный-ci) (`pnpm install --frozen-lockfile && pnpm run ci`).

Integration keys (DB not env), onboarding, and the full Drizzle checklist remain in `docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md` and other `.cursor/rules/*`. Always read that file when working on this initiative.

### 2. Correct dependency direction

```
route.ts / page.tsx / server action
  → app-layer/di/buildAppDeps.ts (composition root)
    → modules/*/service.ts (business logic)
      → modules/*/ports.ts (port interface — defined HERE, not in infra)
        → infra/repos/pg*.ts (implementation of port)
```

### 3. Port types belong in modules, not infra

```
CORRECT:
  modules/treatment-program/ports.ts — defines TreatmentProgramPort interface
  infra/repos/pgTreatmentProgram.ts — implements TreatmentProgramPort

WRONG:
  infra/repos/pgTreatmentProgram.ts — defines AND implements the port
  modules/treatment-program/service.ts — imports type from infra/repos/
```

### 4. Route handlers are thin

Route handlers (`app/api/**/route.ts`) do ONLY:
- Parse request (headers, body, params)
- Validate input (Zod schema)
- Authenticate/authorize (session, guards)
- Call service via buildAppDeps()
- Return HTTP response

Route handlers MUST NOT contain business logic, database queries, or direct infra calls.

### 5. New entities use Drizzle ORM

All new database tables and queries must use Drizzle ORM:
- Schema in `apps/webapp/db/schema/*.ts`
- Migrations via `drizzle-kit generate` + `drizzle-kit migrate`
- Types inferred from schema (`typeof table.$inferSelect`)
- No raw SQL (`pool.query(...)`) for new features

### 6. Service receives dependencies via injection

```typescript
// CORRECT — service receives port via factory
export function createTreatmentProgramService(port: TreatmentProgramPort) {
  return {
    async assignToPatient(params) { /* uses port */ },
  };
}

// WRONG — service grabs pool directly
export function assignToPatient(params) {
  const pool = getPool(); // FORBIDDEN
  await pool.query("INSERT INTO ..."); // FORBIDDEN
}
```

### 7. buildAppDeps() is called ONLY from

- `page.tsx` (React Server Components)
- `route.ts` (API route handlers)
- Server actions (`actions.ts`)
- Top-level `app-layer/` orchestration

**NEVER** from `modules/*`. If a module needs deps, they must be injected.

### Enforcement

- ESLint `no-restricted-imports` in `apps/webapp/eslint.config.mjs`
- Legacy violations tracked in `docs/archive/2026-05-initiatives/TREATMENT_PROGRAM_INITIATIVE/LEGACY_CLEANUP_BACKLOG.md`
- Adding new files to the ESLint allowlist requires explicit justification in PR description

---

## 6. Host: PostgreSQL и DATABASE_URL

*Источник: `.cursor/rules/host-psql-database-url.mdc` (alwaysApply)*

### Сбой без env

Команда `psql "$DATABASE_URL"` при **не заданном** в shell `DATABASE_URL` ведёт себя как подключение к локальному сокету от имени пользователя ОС (часто `root`) → `FATAL: role "root" does not exist`.

### Жёсткое требование для агентов

1. **Никогда** не выдавать пользователю «голый» `psql "$DATABASE_URL"` / `psql "$INTEGRATOR_DATABASE_URL"` без блока, который **сначала** подгружает нужный env-файл на хосте.
2. Любая инструкция для **production-хоста** с SQL должна быть **цельной для copy-paste**: `set -a` → `source <файл из SERVER CONVENTIONS>` → `set +a` → затем `psql` или `-f`.
3. Явно писать, **какой контекст** нужен: после **unification** (см. `SERVER CONVENTIONS.md`, `DATABASE_UNIFIED_POSTGRES.md`) `DATABASE_URL` в `api.prod` и `webapp.prod` обычно **одинаковый**; различайте схемы **`public`** vs **`integrator`** (`SET search_path`, префиксы таблиц). Для **legacy** cutover/dev с двумя кластерами — `INTEGRATOR_DATABASE_URL` из `cutover.prod` или второй env-файл.

Канонические пути к env на production — только из `docs/ARCHITECTURE/SERVER CONVENTIONS.md` (не придумывать).

### Шаблоны production (готовые блоки)

**Через `api.prod`** (integrator-процесс; та же БД, что webapp, если unified):

```bash
set -a && source /opt/env/bersoncarebot/api.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT current_database();"
```

**Через `webapp.prod`** (аналогично при unified — та же база):

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT current_database();"
```

Проверка, что переменная задана (секрет не печатается):

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
[ -n "$DATABASE_URL" ] && echo "DATABASE_URL ok" || echo "MISSING DATABASE_URL"
```

Cutover / два URL — см. `SERVER CONVENTIONS.md` (`cutover.prod`, `INTEGRATOR_DATABASE_URL`).

### Dev

Пути к локальным `.env` — только из `docs/ARCHITECTURE/SERVER CONVENTIONS.md` (например webapp dev: `apps/webapp/.env.dev`). Тот же принцип: **сначала** загрузить файл, в котором задан `DATABASE_URL`, **потом** `psql`.

**Prod и dev — в одной PostgreSQL** (`bcb_webapp_prod` + `bcb_webapp_dev` на `127.0.0.1:5432`). Прод трогать нельзя; dev-роль не видит схемы прода — это норма, а не пустая база.

### Пересоздание / обновление dev-базы из prod-дампа

Канон с командами и граблями — [`docs/ARCHITECTURE/DB_DUMPS/README.md`](docs/ARCHITECTURE/DB_DUMPS/README.md) (раздел «Пересоздание dev-базы из prod-дампа»). Чего **не** делать (ломали вживую): `pg_restore --clean` поверх живой схемы; `--single-transaction` (откат из-за `COMMENT ON EXTENSION`); `REASSIGN OWNED BY bcb_webapp_prod` (задевает боевую базу — владельца задавать через `--no-owner --role=bcb_webapp_dev_user`). Пересоздание базы — только суперюзер `postgres` (роли `bcb_*` без `CREATEDB`): дать команды пользователю, не запускать самому. Миграциями «с нуля» схему не собирать — базу+леджер даёт дамп, `pnpm migrate` накатывает дельту.

### Скрипты в репозитории

Если в комментарии к SQL написано «подставьте `DATABASE_URL`» — для хоста всегда дописывай полный префикс `set -a && source …` из таблицы выше, иначе команда неполная.

---

## 7. Git: коммит и пуш

*Источник: `.cursor/rules/git-commit-push-full-worktree.mdc` (alwaysApply)*

### COMMIT — только зафиксировать то, что уже на диске

**Если пользователь просит только «коммит» / `commit` / «закоммить» (без задачи «поправь код» в том же сообщении):**

1. **НЕ редактировать** файлы проекта в этом шаге — ни `StrReplace`/`Write`, ни «мелкие правки перед коммитом», ни правки по мотивам просмотра диффа.
2. **НЕ устраивать** обзор диффов для переписывания или «улучшения» — коммит фиксирует **текущее** состояние рабочей копии.
3. **Действия в shell:** застейджить всё изменённое как есть → закоммитить, например:
   `git add -A && git commit -m "<сообщение>"`  
   (если пользователь **явно** сузил scope — только перечисленные пути, см. ниже).

Сообщение коммита — по смыслу уже сделанной работы, без новых правок в файлах ради сообщения.

### Git: коммит и пуш — полное дерево по умолчанию

На запросы вида **«коммит»**, **«commit»**, **«закоммить»**, **«пуш»**, **«push»**, **«запушь»**, **«закоммить и запушь»** (и любые эквиваленты без уточнения файлов):

1. **ВСЕГДА** готовить коммит по **всему** текущему рабочему дереву: `git add -A` (или эквивалент «добавить все изменения, включая новые и удалённые»), затем `git commit` с осмысленным сообщением — **без изменения содержимого файлов в этом шаге** (см. блок выше).
2. **Не** делать самовольную «выборку» (`git add` только части файлов, `git add path1 path2`, interactive staging) из соображений «не захватить несвязанное» или «аккуратный коммит», если пользователь **этого явно не просил**.

### Единственное исключение

Сужать scope **только** если пользователь **явно** указал иное, например:

- перечислены конкретные пути или файлы;
- формулировки вроде «только этот файл», «частичный коммит», «без документации», «исключи X».

В таком случае следовать указанному scope.

### Связь с «пуш»

Для сценария **`пуш`** (CI + commit + push) шаг commit выполняется с тем же принципом: **полное дерево как есть**, без правок файлов «в процессе коммита», пока пользователь явно не ограничил файлы. Детали CI и барьера перед push — в разделах [Команда «пуш»](#8-команда-пуш) и [Перед пушем — полный CI](#9-перед-пушем--полный-ci).

---

## 8. Команда «пуш»

*Источник: `.cursor/rules/push-means-ci-commit-push.mdc` (alwaysApply)*

Если пользователь пишет `пуш` (или эквиваленты: "push", "запушь"), агент должен трактовать это как полный поток:

1. Запустить pre-push барьер как в проектном правиле:
   - `pnpm install --frozen-lockfile`
   - `pnpm run ci`
2. Если есть изменения — сделать commit по **всему** рабочему дереву (`git add -A`), если пользователь **явно** не указал иной scope файлов (см. раздел [Git: коммит](#7-git-коммит-и-пуш)). **На шаге commit не менять содержимое файлов** — только застейджить и закоммитить текущее состояние.
3. Выполнить `git push` в текущую ветку/remote.

Не отвечать уточнением "сначала нужно закоммитить?" в этом сценарии — commit является частью команды `пуш`.

Примечание по скорости до команды `пуш`: если ранее `ci` падал, для локальных итераций допускается цикл «упавший шаг + `ci:resume:*`» (см. раздел [Перед пушем — полный CI](#9-перед-пушем--полный-ci)), но сам `пуш` всё равно требует полный барьер `pnpm install --frozen-lockfile && pnpm run ci`.

---

## 9. Перед пушем — полный CI

*Источник: `.cursor/rules/pre-push-ci.mdc` (alwaysApply)*

Многоуровневые прогоны во время работы (step / phase, без лишнего `ci`) — в разделе [Test execution policy](#10-test-execution-and-audit-policy). **Этот раздел** фиксирует только барьер перед отправкой в remote.

**Инструкция для агентов:** когда пользователь просит **пуш**, коммит **с пушем** или явно «прогнать как в CI / перед пушем», выполнить тот же набор, что агрегирует корневой `ci`. Не полагаться только на `pnpm lint` или узкие тесты — локально они могут проходить, а порядок шагов в `ci` на GitHub иной контекст.

### После падения CI (до push) — ускоренный цикл

Если `pnpm run ci` упал в середине и вносится локальный фикс, **разрешено** не перезапускать весь `ci` на каждой итерации:

- сначала прогнать упавший шаг (или ещё уже — конкретный test file),
- затем догнать хвост пайплайна через `ci:resume:*` из корневого `package.json`:
  - `ci:resume:after-lint`
  - `ci:resume:after-typecheck`
  - `ci:resume:after-test`
  - `ci:resume:after-test-webapp`
  - `ci:resume:after-test-media-worker`
  - `ci:resume:after-build`
  - `ci:resume:after-build-webapp`

Это ускорение действует **только между правками**. Перед фактическим push барьер ниже остаётся обязательным в полном виде.

Выполнять:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

(`pnpm check` — алиас того же `ci`.)

Состав `ci` задаётся корневым `package.json` (например: `lint`, `typecheck`, `test`, `test:webapp`, `build`, `build:webapp`, `audit`). Если `pnpm run ci` прошёл локально на актуальном дереве, ожидается зелёный GitHub Actions для того же коммита.

**Не пушить без успешного `pnpm run ci`** в сценариях выше. Повторно гонять `ci` без новых изменений кода — не требуется (reuse — в test-execution-policy).

---

## 10. Test execution and audit policy

*Источник: `.cursor/rules/test-execution-policy.md` (alwaysApply)*

Связь с пушем: полный CI перед отправкой в remote — раздел [Перед пушем — полный CI](#9-перед-пушем--полный-ci). Этот раздел задаёт поведение **между** коммитами и при аудите.

### Приоритет правил (policy vs pre-push)

**По умолчанию все проверки между коммитами и при аудите** определяются **этим** разделом (уровни step / phase / full CI только когда здесь разрешено).

**Исключение:** раздел [Перед пушем — полный CI](#9-перед-пушем--полный-ci) включается **только** в сценарии финального **commit/push** (или явная просьба пользователя прогнать как перед пушем). Нельзя подменять повседневную работу «более безопасным» полным `ci`, если нет repo-уровня или запроса на push.

### Принцип

Полный прогон всего репозитория (`pnpm run ci`) **не** является нормой после каждого маленького изменения. Нужны три уровня: **step** → **phase** → **full CI**, плюс **аудит без лишних прогонов**.

Приоритет сигнала: скорость и полезный результат, а не избыточные повторы.

### Уровни

#### Step-level (по умолчанию после точечных правок)

**Разрешено:** таргетированные тесты (Vitest по файлу/паттерну), линт/тайпчек затронутого приложения, узкий ESLint по путям при необходимости.

**Запрещено:** `pnpm run ci` / `pnpm check`, осознанный прогон **всех** тестов монорепы без repo-уровня риска.

**Fallback, если нет однозначного файла/паттерна для Vitest:** не расширять до full CI. Подняться максимум до **phase-level** затронутого приложения (полный `test` этого `apps/*`). Автоматический переход к `pnpm run ci` из-за «не нашёл таргет» **запрещён**, пока нет признаков repo-уровня или сценария pre-push.

**Примеры команд (этот репозиторий):**

- Integrator, один файл/паттерн: `pnpm --dir apps/integrator test -- <path-or-pattern>`
- Webapp, один файл/паттерн: `pnpm --dir apps/webapp test -- <path-or-pattern>`
- Тайпчек одного приложения: `pnpm --dir apps/integrator typecheck` или `pnpm --dir apps/webapp typecheck`
- Линт webapp: `pnpm --dir apps/webapp lint` (корневой `pnpm lint` охватывает весь репо — тяжелее, на step-level использовать осознанно)

#### Phase-level (логический этап в рамках одного приложения закончен)

**Разрешено:** полный набор тестов **только** того приложения, которое меняли; его полный `typecheck`/`lint`; при необходимости локальные e2e этого приложения (`test:e2e` в `package.json` приложения).

**Запрещено:** полный CI без признаков repo-уровня (см. ниже).

**Примеры:**

- Все тесты integrator: `pnpm test` (корень) или `pnpm --dir apps/integrator test` без аргументов после Vitest
- Все тесты webapp: `pnpm test:webapp` или `pnpm --dir apps/webapp test` без аргументов
- Узкий webapp: `pnpm test:webapp:fast` (проект Vitest `fast`) или `pnpm test:webapp:inprocess` (проект `inprocess`; в GitHub Actions только на `push` в `main`)

#### Webapp Vitest / e2e: не раздувать

При добавлении или правке тестов в `apps/webapp` соблюдать **компактность** (импорты `page.tsx`, число файлов, таймауты): см. раздел [Webapp-тесты](#11-webapp-тесты-компактность) и `apps/webapp/e2e/README.md`.

#### Full CI (ограниченно)

**Разрешено** в том числе:

- перед финальным push (обязательное правило — pre-push-ci);
- после изменений в shared-пакетах, корневых конфигах (`tsconfig`, ESLint, Vitest), workflows CI, lockfile/зависимостях, контрактах/DI на уровне нескольких приложений.

**Запрещено:** повторять полный CI без новых изменений кода; гонять полный CI после каждого микрошага; «на всякий случай» без repo-риска.

**Команда (как в GitHub-эквиваленте локально):** `pnpm install --frozen-lockfile && pnpm run ci` (алиас: `pnpm check`). Состав `ci`: см. корневой `package.json` (`lint`, `typecheck`, `test`, `test:webapp`, `build`, `build:webapp`, `audit`).

### Strong reuse rule

**Повторный запуск тех же тестов или полного CI без изменений кода после последнего успешного прогона — ошибка стратегии** (включая «на всякий случай»).

Если проверки уже выполнялись и **код не менялся** → **не** запускать снова (ни `ci`, ни полный пакет тестов приложения, ни тот же таргет), кроме случая, когда пользователь **явно** просит повтор.

### CI resume (после падения шага)

Если полный `pnpm run ci` упал на конкретном шаге и после фикса вы хотите проверить продолжение цепочки:

- **не** перезапускайте `pnpm run ci` целиком на каждой итерации;
- запускайте сначала упавший шаг (или ещё уже: таргетный тест/файл);
- затем запускайте «хвост» после него через `ci:resume:*` из корневого `package.json`.

**Доступные хвосты:**

- после `lint`: `pnpm run ci:resume:after-lint`
- после `typecheck`: `pnpm run ci:resume:after-typecheck`
- после `test` (integrator): `pnpm run ci:resume:after-test`
- после `test:webapp`: `pnpm run ci:resume:after-test-webapp`
- после `test:media-worker`: `pnpm run ci:resume:after-test-media-worker`
- после `build`: `pnpm run ci:resume:after-build`
- после `build:webapp`: `pnpm run ci:resume:after-build-webapp`

**Важно:** перед фактическим push остаётся обязательным барьер из раздела [Перед пушем — полный CI](#9-перед-пушем--полный-ci) (`pnpm install --frozen-lockfile && pnpm run ci`).

### Логи

По умолчанию: что запущено + итог (pass/fail). Полный вывод прогона — при ошибке или по явной просьбе пользователя.

### Выбор уровня (decision rule)

- точечная правка в одном модуле → **step**;
- законченный кусок работы внутри одного приложения → **phase** для этого приложения;
- затронут общий пакет, CI, lockfile, корневые типы/контракты, несколько приложений → **full CI** (и обязательно перед push).

**Если scope не удаётся определить однозначно:** выбирать **phase-level** для наиболее вероятного приложения, **не** full CI до появления признаков repo-уровня или до сценария push.

### Антипаттерны

- полный CI после каждого изменения;
- дублировать тот же прогон без новых коммитов/файлов;
- аудит как «сначала запустить всё максимально».

### Audit validation

Аудит **не** заменяется автоматическим полным CI. Он проверяет **достаточность** уже сделанного, а не «прогнать максимум».

#### Audit hard rule

**Аудит не имеет права начинаться с запуска тестов или `pnpm run ci`.** Первым шагом CI/тесты как «сразу проверим» — **запрещены**.

Первый шаг аудита **всегда** строго в таком порядке:

1. Анализ изменённых файлов / диффа.
2. Определение scope и пакета (`local` | `app` | `repo`).
3. Сверка с тем, что исполнитель уже гонял; менялся ли код после последнего прогона (reuse).

Только **после** пунктов 1–3 допускается запуск **недостающих** проверок по уровням из этого раздела.

#### Уровни и full CI в аудите

1. Сопоставить scope с уровнем:
   - `local` → таргет/модуль; **не** полный набор тестов приложения и **не** full CI;
   - `app` → полный тест **этого** приложения допустим; full CI — только если есть repo-факторы;
   - `repo` → полный CI уместен.

2. **Full CI в аудите** — только при признаках repo-уровня (shared, контракты/DI между приложениями, корневые конфиги тулчейна, lockfile, CI, build-скрипты на корне).

**Порядок мышления в аудите:** анализ диффа → достаточность уже выполненного → добор точечных проверок. Не: «запустить всё и посмотреть».

#### Cost rule

**Аудит не должен быть дороже выполнения задачи.** Если аудит инициирует **больше** прогонов (или тяжелее уровень), чем было разумно при самой реализации — стратегия **неверна**; нужно остановиться и сузить scope.

---

## 11. Webapp-тесты: компактность

*Источник: `.cursor/rules/webapp-tests-lean-no-bloat.mdc` (alwaysApply)*

Цель — не раздувать время прогона, граф модулей и число файлов без явной продуктовой необходимости.

### Импорты App Router `page.tsx`

- **`e2e/*inprocess*.test.ts`:** не добавлять новые холодные `import("@/app/.../page")` «рядом с кейсом». Расширять только общий smoke — `apps/webapp/e2e/smoke-app-router-rsc-pages-inprocess.test.ts`, либо обходиться контрактными тестами (route, deps, тонкие модули).
- **`e2e/*.test.ts` в проекте `fast`:** если нужен реальный `page`, один раз в **`beforeAll`** с `import()`, не в каждом `it` (см. `doctor-clients-scope-redirects.test.ts`).

### RTL и `React.lazy`

- Чанки под ленивые вкладки/импорты — прогрев в **`beforeAll`** (`Promise.all` + `import(...)`), иначе растут флаки и соблазн поднимать таймауты.

### Файлы и дубли

- Предпочитать **расширение существующего** тест-файла той же зоны ответственности вместо нового файла с одним-двумя `it`, если нет причины изолировать (разный setup, другой глобальный мок).
- **Не** копировать одни и те же тяжёлые импорты/моки в несколько файлов без необходимости.

### Таймауты

- В `apps/webapp/vitest.config.ts` проекты **`fast`** и **`inprocess`** используют одинаковые по умолчанию **`testTimeout` (20s)** и **`hookTimeout` (25s)** — медленные `it` без прогрева должны падать. Холодный импорт большого графа — только в **`beforeAll(..., timeout)`** с явным лимитом (см. smoke и `doctor-clients-scope-redirects`), **не** поднимать глобально отдельный «мягкий» потолок вроде 30s для `it`.
- **Не** поднимать глобальные `testTimeout` / `hookTimeout` в `vitest.config.ts` «чтобы стало зелёно». Сначала уменьшить холодный граф (прогрев, меньше импортов страниц), затем при необходимости — **точечный** `timeout` на конкретный `it`/`beforeAll`.

### Куда смотреть

- Канон по e2e и скриптам: `apps/webapp/e2e/README.md`, шаблон замеров: `apps/webapp/e2e/CI_BASELINE.md`.
- Уровни прогона (step / phase / CI): раздел [Test execution policy](#10-test-execution-and-audit-policy).

---

## 12. Plan Authoring And Execution Standard

*Источник: `.cursor/rules/plan-authoring-execution-standard.mdc` (alwaysApply)*

**Цель:** чтобы агентские планы были подробными, проверяемыми и безопасными по области изменений.

### Обязательные правила

1. **Декомпозиция по умолчанию**
   - Если пользователь не просил иначе, делать подробный план уровня Cursor-агента: этапы -> шаги -> проверки -> критерии закрытия.

2. **Чек-листы на каждый шаг**
   - Для каждого шага добавлять короткий checklist с **локальными** проверяемыми пунктами: `rg`, релевантные unit/интеграционные тесты, `lint` / `typecheck` по затронутому пакету при необходимости, короткий smoke.
   - **Не требовать** в плане полный корневой `pnpm run ci` после **каждого** шага или после **каждого** небольшого плана — это дорого и снижает готовность планов к исполнению.
   - Не помечать шаг как закрытый без фактической проверки, подходящей по масштабу шага.

3. **Scope boundaries (безопасные рамки)**
   - Явно указывать, какие директории/файлы **разрешено** трогать.
   - Явно фиксировать, что **вне scope** (не менять соседние системы, UI/архитектуру/миграции, если это не запрошено).
   - Любое расширение scope сначала согласовать с пользователем.

4. **Запрет размытого «опционально»**
   - В `.cursor/plans/*.plan.md` **не** использовать для шагов внутри scope формулировки вроде «опционально», «optional», «по желанию», «если успеем», «можно позже» — это неисполняемые обязательства и их по умолчанию **никто не делает**.
   - Каждый пункт либо **входит в Definition of Done** с `todo`, проверками и явным закрытием, либо помечен **`status: cancelled`** с краткой причиной, либо вынесен во **вне scope** / отдельный backlog-док со ссылкой (без полумер в теле плана).
   - При исполнении плана агент **не** добавляет «опциональные» хвосты задач без явного запроса пользователя.

5. **Execution log обязателен**
   - Для инициативных задач требовать и вести `LOG.md` в профильной папке docs.
   - В логе фиксировать: что сделано, какие проверки выполнены, какие решения приняты, что сознательно не делали.

6. **Правила перед исполнением**
   - Перед реализацией обязательно прочитать релевантные `.cursor/rules/*.mdc` и следовать им.
   - Если есть конфликт правил, приоритет у always-apply и более узкоспециализированных правил по теме.

7. **Корректность статусов в файле плана**
   - Проверять консистентность `todos`/`status` в самом plan-файле.
   - После завершения работ обновлять статусы (`pending` -> `in_progress` -> `completed`/`cancelled`) без пропусков.
   - **Обязательная процедура при полном закрытии плана** (все пункты выполнены или явно отменены, Definition of Done закрыт): для файлов **`.cursor/plans/*.plan.md`** — **не завершать сессию**, пока не выполнено ниже. Иначе Cursor часто оставляет план «висящим» (активный **Build** / незакрытый run).
     1. В начале файла должен быть валидный блок **`---` YAML frontmatter `---`** (как в `.cursor/plans/archive/hls_private_bucket_proxy.plan.md`): не оставлять план только с markdown без frontmatter.
     2. Поля **`name`** и **`overview`** — осмысленные непустые строки (не `""`).
     3. Массив **`todos`**: у **каждого** элемента с **`id`** и **`content`** выставить **`status: completed`** для сделанного; отменённые пункты — **`status: cancelled`** (и по возможности уточнить в `content` причину). Не оставлять `todos: []` при непустом теле плана с DoD, если по смыслу были шаги — лучше перечислить те же шаги с `completed`.
     4. **`isProject`**: `false` по умолчанию; `true` только если план изначально заведён как долгоживущий project-tracker по согласованию.
     5. В markdown-теле плана выровнять **Definition of Done** / чеклисты (`[x]` / `[ ]`) с фактическими **`todos.status`**.
     6. Если пользователь **запретил** править конкретный plan-файл — один раз явно написать в ответе, что процедуру закрытия frontmatter нужно сделать вручную или снять запрет.

8. **Синхронная документация**
   - При изменениях по теме плана обновлять соответствующую проектную документацию в той же области (README модуля, initiative docs, runbook/API docs).
   - Не трогать immutable-документы, если явно помечены как baseline.

9. **Перенос плана из `~/.cursor/plans/` в монорепо (`.cursor/plans/archive/`)**
   - Канон: **`git mv <исходный-файл> .cursor/plans/archive/<имя>.plan.md`**; если файл ещё не отслеживается git — **`mv`** в каталог архива, затем **`git add`**.
   - **Не** оставлять во `~/.cursor/plans/` **stub** («см. репозиторий») как второй источник правды.
   - **Не** воссоздавать план через Read → Write полного текста из чата вместо **переноса того же файла** (потеря байт-в-байт, лишний diff, расхождение с тем, что было в IDE).
   - Обновление frontmatter (`status`, `todos`) и правки тела — **после переноса**, только в файле внутри репозитория (если пользователь не запретил правки).

### Полный CI (`pnpm run ci`)

- **В тексте плана** явно различать:
  - **Обычный финал задачи / маленький план:** достаточно целевых проверок из чек-листа (часто — затронутые тесты + lint/typecheck по области).
  - **Большой многоэтапный план:** один финальный прогон **`pnpm run ci`** (или эквивалент из корневого `package.json`) после завершения всего объёма или перед передачей в merge — указать это один раз в Definition of Done / критериях приёмки.
  - **Пуш в remote:** полный CI обязателен по правилам репозитория (см. раздел [Перед пушем — полный CI](#9-перед-пушем--полный-ci), команда «пуш») — **не** дублировать это как требование после каждого подпункта плана.

### Дополнительно (без лишнего усложнения)

- В каждом плане добавлять краткий блок **Definition of Done** (3-7 измеримых пунктов).
- Для удалений сначала делать `rg`-проверку на runtime-использование, затем удалять.
- В финале всегда давать короткий отчёт: изменённые области, результаты проверок, что намеренно не делали.

---

## 13. Формат ответа: ИТОГ

*Источник: `.cursor/rules/answer-itog-without-code-unless-asked.mdc` (alwaysApply)*

- Если пользователь **не просил** разбор кода, файлов, цитат, диффов и пошаговую трассировку реализации — отвечать **кратко**, с блоком **ИТОГ** (или эквивалентной одной сжатой формулировкой вывода).
- **Не** включать в такой ответ: большие фрагменты кода, длинные списки путей/идентификаторов, подробные цепочки вызовов — **до тех пор**, пока пользователь явно не попросил «где в коде», «покажи код», «детали», «trace» и т.п.
- Если для точности нужны 1–2 коротких упоминания (имя сервиса, таблица, эндпойнт) — допустимо одной строкой без развёрнутых блоков.
- Когда пользователь **явно просит** код или локализацию в репозитории — применять обычные правила проекта (ссылки на код, точность, инструменты).

---

## 14. Коммуникация без навязанных концовок

*Источник: `.cursor/rules/no-unsolicited-followups.mdc` (alwaysApply)*

**Инструкция для агентов:** отвечать строго по запросу пользователя, без обязательных «хвостов» в конце.

Запрещено:

- добавлять в конце сообщений фразы вида «Если хочешь, могу…», «Могу ещё…», «Дальше могу…», когда пользователь этого не просил;
- навязывать follow-up шаги и дополнительные задачи;
- завершать ответ engagement-фразами «скажи — и сделаю».

Разрешено:

- предлагать следующий шаг **только** если пользователь явно попросил варианты/рекомендации;
- задавать только необходимые уточняющие вопросы по текущей задаче.

Приоритет: краткий, прямой, уважительный ответ без лишних предложений.

---

## 15. Patient UI Shared Primitives

*Источник: `.cursor/rules/patient-ui-shared-primitives.mdc` (alwaysApply)*

При работе с patient pages (`apps/webapp/src/app/app/patient/**`) сначала использовать готовые shared стили и UI-примитивы.

### Источники по умолчанию

1. `docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`
2. `apps/webapp/src/shared/ui/patientVisual.ts`
3. `apps/webapp/src/shared/ui/patient/PatientCatalogMediaStaticThumb.tsx` (превью каталожного медиа в списках/модалках)
4. `apps/webapp/src/shared/ui/patient/primitives/*` — shadcn-копии для patient zone (**не** `@/components/ui/**` в patient routes: ESLint + [§17](#17-patient--doctor-ui-isolation))
5. `apps/webapp/src/app/globals.css` (`#app-shell-patient` токены)

### Обязательные правила

- Не писать новый локальный custom UI для карточек/кнопок/бейджей/accordion-like/form controls, если уже есть shared/shadcn решение.
- Не переносить home-specific geometry из `app/app/patient/home/patientHomeCardStyles.ts` на внутренние страницы.
- Для новых page-redesign/style-pass задач переиспользовать patient primitives и shadcn base, а не создавать "одноразовый chrome" внутри route-компонента.

### Медиа: превью только картинка (кабинет пациента)

Для **всех** страниц и блоков `apps/webapp/src/app/app/patient/**`:

- **Миниатюры и строки списков** (карточки, модалки, таймлайны): только **статичное изображение** — `PatientCatalogMediaStaticThumb` (`apps/webapp/src/shared/ui/patient/PatientCatalogMediaStaticThumb.tsx`) + `MediaThumb` (`apps/webapp/src/shared/ui/media/MediaThumb.tsx`) и модели из `mediaPreviewUiModel` (превью воркера `previewSmUrl` для видео, исходный URL для image/gif). Обложки ЛФК — по-прежнему `lfkCoverToPreviewUi` + `MediaThumb`.
- **Запрещено** на превью: тег `<video>`, иконка «кино» (Film) или декоративный оверлей плеера **вместо** картинки. Воспроизведение видео — **только** на целевой странице контента / в компоненте с полноценным плеером (например `PatientContentAdaptiveVideo`).
- **Иконка плеера на кнопке/ссылке** («Начать разминку», «Начать занятие») допустима как **призыв к действию**, не как замена превью медиа.

### Когда кастом допустим

Кастом возможен только при явной продуктовой причине и отсутствии подходящего shared/shadcn варианта. Причину нужно зафиксировать в docs/LOG активной инициативы.

---

## 16. Doctor UI Shared Primitives

*Источник: `.cursor/rules/doctor-ui-shared-primitives.mdc` (alwaysApply)*

При работе с кабинетом врача/админа (`apps/webapp/src/app/app/doctor/**`) и связанными shared-компонентами сначала использовать канон дизайн-системы проекта, а не локальные одноразовые обёртки.

### Источники по умолчанию (порядок чтения)

1. [`docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`](docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md) — паттерны секций, списков, каталогов, карточки клиента, диалоги, KPI, mobile.
2. [`apps/webapp/src/shared/ui/doctorVisual.ts`](apps/webapp/src/shared/ui/doctorVisual.ts) — page-level class constants (`doctorSectionCardClass`, `doctorSectionTitleClass`, `doctorEmptyStateClass`, catalog rows, …).
3. [`apps/webapp/src/app/app/doctor/clients/doctorClientCardChrome.ts`](apps/webapp/src/app/app/doctor/clients/doctorClientCardChrome.ts) — shell и панели карточки клиента (entity-card), без дубля в `doctorVisual`.
4. [`apps/webapp/src/shared/ui/doctorWorkspaceLayout.ts`](apps/webapp/src/shared/ui/doctorWorkspaceLayout.ts) — контейнер страницы, sticky toolbar каталога.
5. [`apps/webapp/src/shared/ui/doctor/`](apps/webapp/src/shared/ui/doctor/) — каталог, toolbar, `DoctorSection` / `DoctorSectionHeader` / `DoctorEmptyState` / `DoctorMetricList`.
6. [`apps/webapp/src/shared/ui/doctor/primitives/*`](apps/webapp/src/shared/ui/doctor/primitives/) — shadcn-копии doctor zone (**не** `@/components/ui/**` в doctor routes; ESLint + [§17](#17-patient--doctor-ui-isolation)). Источник для копирования: `components/ui/`.
7. Журнал унификации (исключения, cancelled routes): [`docs/archive/2026-06-initiatives/DOCTOR_UI_UNIFICATION_INITIATIVE/README.md`](docs/archive/2026-06-initiatives/DOCTOR_UI_UNIFICATION_INITIATIVE/README.md).

Плотность UI **не откатывать** — см. [`docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_UI_DENSITY_PLAN.md`](docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_UI_DENSITY_PLAN.md).

### Обязательные правила

- **Reuse-first:** перед новой секцией/списком/тулбаром проверить гайд §3–§8 и `doctorVisual` / `shared/ui/doctor/`.
- **Не** добавлять локальные «самописные» карточки, заголовки и empty states, если покрывает `DoctorSection`, `DoctorEmptyState` или константы из `doctorVisual.ts`.
- **Page-level секции:** `doctorSectionCardClass` (или `<DoctorSection>`) — `rounded-xl`, `p-3`, `gap-3`, **без** `shadow-sm` и **без** `rounded-2xl`.
- **Заголовки:** `doctorSectionTitleClass` / `doctorPageTitleClass` / `doctorClientSectionTitleClass` — **запрещены** голые `<h2>` / `<h3>` без `className`.
- **Карточка клиента:** только chrome из `doctorClientCardChrome.ts`; вкладки и overview — primary/secondary/stacked по гайду §9.
- **Каталоги (split-layout):** эталон — `exercises/ExercisesPageClient.tsx`; стек `DoctorCatalogPageLayout` + `DoctorCatalogFiltersToolbar` + `CatalogSplitLayout`; primary action — `doctorCatalogToolbarPrimaryActionClassName`.
- **Диалоги:** shadcn `Dialog` с шириной из гайда §14; не inline-раскрытие деструктивных действий вне Dialog.
- **Кнопки:** primary — `default` / `size="sm"`; **не** `ghost` как основное действие (гайд §16).
- **Select:** при нечитаемом `value` — `displayLabel` на `SelectTrigger` (см. раздел [UI: Select](#22-ui-select--displaylabel)).

### Области вне этого канона (не унифицировать здесь)

- `admin/booking/**`, `booking-merge` — владеет [`BOOKING_REWORK_INITIATIVE`](docs/BOOKING_REWORK_INITIATIVE/ROADMAP.md).
- `admin/app-settings`, `admin/auth`, `admin/integrations`, `admin/technical` — отдельные admin forms.
- Пациентский UI (`/app/patient/**`) — [`PATIENT_APP_UI_STYLE_GUIDE.md`](docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md) и раздел [Patient UI](#15-patient-ui-shared-primitives).

### CMS медиа-пикер

Модалки выбора файла из библиотеки — раздел [CMS media picker](#20-cms-единый-layout-медиа-пикера) (`MediaPickerShell` / `MediaPickerPanel`).

### Когда кастом допустим

Только при явной продуктовой причине и отсутствии паттерна в гайде; кратко зафиксировать в LOG соответствующей инициативы или в PR. Новые npm-зависимости ради UI — не добавлять.

### Единый визуальный язык и шкала (гайд §A–§C)

- Фон кабинета белый; глубина — тонкие границы/лёгкие поверхности, не тени (§A). `shadow-*` — только floating (медиакарточки §11, поповеры, drag), **не** на page-level секциях/KPI.
- Chrome-типографика — закрытый набор §B.1: page-title `text-base`, section `text-sm`, body `text-sm`, meta `text-xs`, KPI `doctorMetricValueClass` (`text-2xl`). Micro-роль `text-[10px]`/`text-[11px]` — только бейджи/календарь/оси графиков/mono. Запрещено: `text-[13px]`, `text-lg`, `text-xl`, `text-3xl`.
- Контролы: input/select-триггер/база кнопки — `h-8`/`h-[32px]` + `rounded-md`; поле и кнопка/select в одной строке совпадают.
- Радиусы 4 уровня (§A.3): page `rounded-xl`, панель `rounded-lg`, строка/контрол `rounded-md`; `rounded-2xl` запрещён.
- active/hover/focus — словарь §A.4 (active = `bg-primary/15 text-primary`/`ring`, не жирная заливка и не хардкод-hex).
- KPI-метрика — `doctorMetricValueClass` из `doctorVisual.ts`, не локальный `text-3xl`.

### Быстрая самопроверка перед сдачей

```bash
rg "rounded-2xl|<h2>[^<]" apps/webapp/src/app/app/doctor --glob "*.tsx"
rg "text-\[13px\]|text-lg|text-xl|text-3xl" apps/webapp/src/app/app/doctor apps/webapp/src/shared/ui/doctor --glob "*.tsx"
rg "doctorSectionCardClass|DoctorSection|doctorClientCardChrome" apps/webapp/src/app/app/doctor/<зона>
```

---

## 17. Patient / Doctor UI Isolation

*Источник: `.cursor/rules/patient-doctor-ui-isolation.mdc`*

При правках patient или doctor product zones соблюдать физическое разделение UI и CSS.

### CSS

| Файл | Подключение |
|------|-------------|
| `app/styles/tailwind-engine.css` | `app/layout.tsx` (Tailwind + shadcn `:root`) |
| `app/styles/patient.css` | `app/app/layout.tsx`, `app/book/layout.tsx` |
| `app/styles/doctor.css` | `app/app/doctor/layout.tsx`, `app/app/settings/layout.tsx` |
| `app/styles/landing.css` | `app/page.tsx` |

**Запрещено:** импорт `globals.css`, дублирование `patient.css` в `app/patient/layout.tsx`.

### UI trees

- Patient: `shared/ui/patient/**` + `@/shared/ui/patient/primitives/*`
- Doctor/settings: `shared/ui/doctor/**` + `@/shared/ui/doctor/primitives/*`
- Shells: `PatientAppShell`, `DoctorAppShell` (не общий `AppShell`)

### ESLint

Patient zone и doctor zone — `no-restricted-imports` в `eslint.config.mjs`:

- Patient routes/modules **и** `shared/ui/patient/**`: не импортируют `@/shared/ui/doctor/**` или `@/components/ui/**`
- Doctor routes/settings **и** `shared/ui/doctor/**`: не импортируют `@/shared/ui/patient/**` или `@/components/ui/**`

Исключение: `app/layout.tsx` — `TooltipProvider` из `@/shared/ui/patient/primitives/tooltip`.

### Канон

- Patient UI: `docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`, раздел [Patient UI](#15-patient-ui-shared-primitives)
- Doctor UI: `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`, раздел [Doctor UI](#16-doctor-ui-shared-primitives)
- Инициатива split: `docs/archive/2026-06-initiatives/PATIENT_DOCTOR_UI_SPLIT_INITIATIVE/`

### Новые компоненты

Копировать shadcn из `components/ui/` в нужную `*/primitives/`; cross-import между patient и doctor **запрещён**.

---

## 18. Пациент: «ЛФК» = программа реабилитации

*Источник: `.cursor/rules/patient-lfk-means-rehab-program.mdc` (alwaysApply)*

**Решение зафиксировано: с 2026-05-09.**

### Продуктовый смысл (русский UI и коммуникация с пользователем)

В **кабинете пациента** (`apps/webapp/src/app/app/patient/**`) фразы **«ЛФК»**, **«ЛФК занятие»**, **«программа ЛФК»** и близкие формулировки в пользовательских текстах означают **программу реабилитации** (назначенный план лечения / реабилитационная программа в смысле `treatment_program` / напоминания `rehab_program`), а **не** отдельный сценарий «каталог комплексов ЛФК» как главную сущность.

### Запрет в области пациентского UX

- **Не** проектировать и **не** возвращать опору пациентского пути на **«комплекс ЛФК»** как на самостоятельную сущность навигации (списки комплексов, первичный сценарий «выбери комплекс», отдельный раздел приложения под legacy-модель дневника по комплексам).
- Новые экраны, подсказки и CTA для пациента по «что делать по ЛФК» вести через **программу реабилитации** и связанные с ней действия/напоминания (`rehab_program`, чек-лист программы и т.д.), а не через отдельный patient-flow вокруг `lfk_complex`.

### Отделение от технической модели

- В **коде, API и БД** по-прежнему могут встречаться идентификаторы вроде `lfk_complex`, `linked_object_type`, таблицы каталога ЛФК — это **не** требование немедленно переименовывать схему; правило про **тексты и UX для пациента** и про **смысл слова «ЛФК» в продукте** ортогонально эволюции DDL каталога ЛФК (см. `docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md`).

### Агентам при правках

- При добавлении/правке **русских строк** в patient routes — сверяться с формулировкой **«программа реабилитации»** там, где речь о назначенном плане, а не восстанавливать «комплекс» как пользовательский термин.
- При аудите напоминаний и дневника: не предлагать «вернуть комплексы» как основной ответ пациенту; предлагать поверхность **программы реабилитации** и согласованные с ней правила.

---

## 19. Patient media playback (HLS / MP4)

*Источник: `.cursor/rules/patient-media-playback-video.mdc` (scoped: `apps/webapp/src/app/app/patient/**`, media components)*

- Для **файлового** видео в `apps/webapp/src/app/app/patient/**` и в **Markdown-теле** страниц контента (`MarkdownEmbeddedLink`, `@/shared/ui/markdown/MarkdownEmbeddedLink.tsx`) используй **`PatientMediaPlaybackVideo`** (`@/shared/ui/media/PatientMediaPlaybackVideo`). Не добавляй «голый» `<video>` с прямым URL или отдельный progressive-only плеер вне этого компонента.
- **Миниатюры** в списках пациента — по-прежнему только картинка (`PatientCatalogMediaStaticThumb`); воспроизведение — только в полноценном плеере.
- **Быстрый превью видео** в `MediaPickerQuickPreviewDialog` использует тот же `PatientMediaPlaybackVideo` (единый стек с кабинетом пациента).
- Режим доставки задаёт только **`GET /api/media/[id]/playback`** и внутренняя логика fallback при сбое HLS; **нет** UI для выбора **формата** (HLS vs MP4). При **двух и более** строках в **`hls.qualities`** и воспроизведении через **`hls.js`** допускается выбор **разрешения** и индикация текущего варианта; при нативном HLS — только «авто»; при отсутствии поддержки **`hls.js`** при выдаче HLS включается progressive MP4 и селектор качества скрывается — см. `docs/ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md`.
- Если на сервере JSON не резолвили — передай `initialPlayback={null}`; компонент сам запросит `/playback` на клиенте (сессия обязательна для успешного ответа).
- Для извлечения `mediaId` из пути каталога и тела Markdown: **`parseApiMediaIdFromPlayableUrl`**, при необходимости **`parseApiMediaIdFromMarkdownHref`** (`@/shared/lib/parseApiMediaIdFromPlayableUrl`).

Документация: `docs/ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md`.

---

## 20. CMS: единый layout медиа-пикера

*Источник: `.cursor/rules/cms-unified-media-picker-layout.mdc` (scoped: doctor CMS media pickers)*

При добавлении или изменении **модалок выбора файла из медиабиблиотеки** в doctor CMS:

- Используйте **`MediaPickerShell`** + **`MediaPickerPanel`** из [`apps/webapp/src/shared/ui/media/MediaPickerShell.tsx`](apps/webapp/src/shared/ui/media/MediaPickerShell.tsx) и [`apps/webapp/src/shared/ui/media/MediaPickerPanel.tsx`](apps/webapp/src/shared/ui/media/MediaPickerPanel.tsx).
- Не дублируйте отдельные обёртки `Dialog`/`Sheet` с другой шириной и своим блоком «поиск + список», если сценарий — тот же паттерн (библиотека + опционально загрузка с устройства).
- Поведенческие отличия (фильтр по `kind`, папки и «только новые» для упражнений, показ сортировки) задаются **пропсами** `MediaPickerPanel`, а не копипастой разметки.
- Вкладка загрузки с устройства: после `POST /api/media/upload` результат сверяется с `kind` (`isPickedRowAllowedForKind`); при несовпадении показывайте пользователю понятный текст (как в текущей реализации), не вызывайте `onPick`. Ошибки API мапятся на русский текст (`mapUploadErrorByCode`).
- Для Markdown не дублируйте логику «картинка vs ссылка»: используйте [`markdownSnippetForMediaUrl`](apps/webapp/src/shared/ui/markdown/markdownMediaSnippet.ts) и передавайте в колбэк `kind`/`mimeType` из выбранной строки библиотеки.

Исключения (свой layout без этих компонентов) допустимы только при **явной продуктовой причине**; в PR кратко опишите, почему общий контейнер не подошёл.

Связанные входные точки: `MediaLibraryPickerDialog`, `MediaLibraryInsertDialog`.

---

## 21. UI: тексты без избыточных пояснений

*Источник: `.cursor/rules/ui-copy-no-excess-labels.mdc` (alwaysApply)*

При реализации или правке UI (пациентский кабинет, админка, публичные экраны):

- **Не** добавлять «от себя» дополнительные заголовки секций, вводные абзацы, поясняющие подписи под элементами, декоративные подзаголовки и развёрнутые hint-тексты, если задача или спецификация этого **явно** не требуют.
- Сохранять лаконичность; ориентироваться на существующие экраны и паттерны проекта.
- Если кажется, что не хватает пояснения — по умолчанию **не** дописывать его в интерфейсе; уточнение — через постановку/продукт, а не через самовольные строки в коде.

**Исключения (разрешено без отдельного запроса):** доступность (`aria-*`, скрытые для вида но читаемые подписи), обязательные сообщения об ошибках/валидации, тексты жёстко зафиксированные в документации по конкретному экрану для этой задачи.

---

## 22. UI: Select — displayLabel

*Источник: `.cursor/rules/ui-select-trigger-display-label.mdc` (alwaysApply)*

Проект использует `@base-ui/react/select` через `apps/webapp/src/components/ui/select.tsx`.

### Проблема

Пока список опций **ещё не смонтирован** (типично до первого открытия/focus), `SelectValue` **без дочерних узлов** может отрисовать **сырое `value`** (uuid, англ. ключ enum, `__none__` и т.д.), даже если у `SelectItem` задан человекочитаемый текст.

### Что делать при новых селекторах

Если `value` **не совпадает** с тем, что должен видеть пользователь (русская подпись):

1. **Предпочтительно (рекомендуемый паттерн):** проп **`displayLabel`** на `<SelectTrigger>` —
   автоматически оборачивает подпись в `<SelectValue>`, `children` при этом не нужны:
   ```tsx
   <SelectTrigger displayLabel={options.find(o => o.value === val)?.label}>
   ```
2. Либо: передать **`items`** на `<Select>` — карта `value → подпись` или массив `{ value, label }` (см. JSDoc в `select.tsx` и тип `SelectRootProps["items"]` в Base UI).
3. Либо: явные дети **`<SelectValue>…</SelectValue>`**, вычисленные из текущего `value`.
4. Дополнительно при сложных опциях: **`label`** на `<SelectItem>` (пробрасывается в Base UI).

### Ограничения

- Не менять ради этого **роль**, **тип контрола**, **поведение** (контролируемое значение, `onValueChange`) и **внешний вид** триггера — только источник текста для отображения выбранного значения.

### Переиспользование

Общие карты для повторяющихся полей — в `apps/webapp/src/shared/ui/selectOpaqueValueLabels.ts` (или рядом с доменом), чтобы не дублировать строки.

---

## 23. Справочник вне `.cursor/rules`

Постоянные инструкции — в `.cursor/rules/` и разделах 1–22 выше. Ниже — **документы и паттерны**, которые Cursor не подставляет автоматически, но агенту нужно знать по задаче.

### Покрытие `.cursor/rules` → `AGENTS.md`

Все **22** файла из `.cursor/rules/` (21× `.mdc` + `test-execution-policy.md`) продублированы в разделах 1–22. Исключение по смыслу: §1a ([`LOCAL_DEV_AND_AGENT_TESTING.md`](docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md)) — канон репозитория, не rule-файл.

| Файл | В AGENTS | Примечание |
|------|----------|------------|
| `patient-doctor-ui-isolation.mdc` | §17 | **Нет YAML frontmatter** (`alwaysApply`/`globs`) — правило не scoped в IDE; опирайтесь на §17 при правках patient/doctor UI |
| `cms-unified-media-picker-layout.mdc` | §20 | `alwaysApply: false` — только doctor CMS media pickers |
| `patient-media-playback-video.mdc` | §19 | scoped: patient routes |

### Архитектура и контракты

| Документ | Когда читать |
|----------|----------------|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Integrator: слои, запреты, runtime-процессы |
| [`apps/webapp/INTEGRATOR_CONTRACT.md`](apps/webapp/INTEGRATOR_CONTRACT.md) | M2M webapp↔integrator, idempotency, webhooks |
| [`docs/ARCHITECTURE/DB_STRUCTURE.md`](docs/ARCHITECTURE/DB_STRUCTURE.md) | Карта таблиц PostgreSQL (`public` + `integrator`) |
| [`docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md`](docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md) | Маршруты врача/admin, меню |
| [`docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`](docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md) | Что в env, что в `system_settings` |
| [`docs/RULES/README.md`](docs/RULES/README.md) | Нормативы исполнения (программы лечения, reminders DDL) |
| [`docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md`](docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md) | Программы лечения, Drizzle, фазовые gate |

### Модули в коде (`*.md` рядом с кодом)

В `apps/*/src/**` лежат `имя_папки.md` с контрактом модуля (auth, api, reminders, …). При правке модуля **сначала** откройте соседний `*.md`; индекс webapp-модулей: [`apps/webapp/src/modules/modules.md`](apps/webapp/src/modules/modules.md).

### Планы инициатив

`.cursor/plans/` и `docs/*_INITIATIVE/` — **задачи и журналы**, не standing rules. Не смешивать с `AGENTS.md`. Закрытые планы: `.cursor/plans/archive/`.

### Известные пересечения правил

- **Patient UI primitives vs isolation (§15 vs §17):** в patient/doctor **routes** импорт `@/components/ui/**` запрещён ESLint — используйте `shared/ui/patient/primitives` или `shared/ui/doctor/primitives`. Канонический shadcn живёт в `components/ui/` как **источник для копирования**, не для прямого импорта в product zones.
- **`dev_mode` (БД) vs `ALLOW_DEV_AUTH_BYPASS` (env):** разные вещи — см. [§1a](#1a-локальный-dev-и-тестирование-ui).

### Деплой и ops (кратко)

| Тема | Документ |
|------|----------|
| Host deploy, cron, nginx | [`deploy/HOST_DEPLOY_README.md`](deploy/HOST_DEPLOY_README.md) |
| Env-шаблоны | [`deploy/env/README.md`](deploy/env/README.md) |
| Backfill / cutover | [`deploy/DATA_MIGRATION_CHECKLIST.md`](deploy/DATA_MIGRATION_CHECKLIST.md) |
| `psql` на production | §6 + полный префикс `set -a && source /opt/env/...` |

---

## Справка: файлы правил

| Файл | alwaysApply | globs (если scoped) |
|------|-------------|---------------------|
| `000-critical-integration-config-in-db.mdc` | да | — |
| `answer-itog-without-code-unless-asked.mdc` | да | — |
| `clean-architecture-module-isolation.mdc` | да | — |
| `cms-unified-media-picker-layout.mdc` | нет | doctor CMS |
| `doctor-ui-shared-primitives.mdc` | да | — |
| `git-commit-push-full-worktree.mdc` | да | — |
| `host-psql-database-url.mdc` | да | — |
| `no-unsolicited-followups.mdc` | да | — |
| `patient-doctor-ui-isolation.mdc` | нет (нет frontmatter) | patient + doctor zones; см. §17 |
| `patient-lfk-means-rehab-program.mdc` | да | — |
| `patient-media-playback-video.mdc` | нет | patient routes, media |
| `patient-ui-shared-primitives.mdc` | да | — |
| `plan-authoring-execution-standard.mdc` | да | — |
| `pre-push-ci.mdc` | да | — |
| `push-means-ci-commit-push.mdc` | да | — |
| `runtime-config-env-vs-db.mdc` | да | — |
| `server-conventions-and-doc-onboarding.mdc` | да | — |
| `system-settings-integrator-mirror.mdc` | да | — |
| `test-execution-policy.md` | да | — |
| `ui-copy-no-excess-labels.mdc` | да | — |
| `ui-select-trigger-display-label.mdc` | да | — |
| `webapp-tests-lean-no-bloat.mdc` | да | — |

**Документация репозитория (не rule-файл):** [`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`](docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md) — §1a; [`docs/ARCHITECTURE/DB_STRUCTURE.md`](docs/ARCHITECTURE/DB_STRUCTURE.md) — §23.

**Не включено в этот файл:** `.cursor/plans/` — это архив задач и планов инициатив, а не постоянные инструкции для агентов.

---

## 24. Оркестрация субагентов

*Правила выведены из практики (2026-06): тихие смерти/зависания агентов, git-факапы в общем чек-ауте, дублирование с параллельным чатом.*

### Роли и стоимость
- Дорогая модель (оркестратор) делает ТОЛЬКО: планирование, брифы, ревью, интеграцию. **Всю реализацию (включая «мелкий» код) отдавать Sonnet-субагентам.** Не писать рутинный код самому — это жжёт контекст чата и токены.
- Для планирования / перепроверки плана дорогая модель допустима. Уровень модели/мышления подбирать под задачу (мелкая правка → дешевле; рискованная архитектура → дороже).

### Параллелизм
- **Не больше 1–2 фоновых агентов одновременно** (перегруз среды). Лишнее — в очередь, не «веером».

### Бриф агента (self-contained)
- В брифе: пути, эталон, ограничения, шаги проверки, **запрет commit в main / push**. Холодный старт — агент ничего не доводит «по памяти».
- **Запрещать бесконечные циклы ожидания** (напр. «жди, пока поднимется порт N») — только с таймаутом/числом попыток. Иначе агент НЕ падает, а ВИСНЕТ навсегда (в панели — «Running» часами).
- По возможности **не давать агенту поднимать dev-сервер**: реализация = код + typecheck + тесты + commit (в своём worktree, без push). Живую проверку (скриншоты) делать отдельно — оркестратором или коротким verify-агентом. Меньше зависаний.

### Git в среде агентов (КРИТИЧНО)
- cwd ненадёжен → все git-команды с явным `git -C <main-checkout>`.
- Только явный `git add <пути>`. **Никогда `git add -A`** — однажды это втянуло в коммит файлы параллельного чата.
- Агенты иногда ветвятся от УСТАРЕВШЕЙ базы. Новый/перезапущенный агент: STEP 0 — `git merge <ветка-feat> --no-edit` + проверить маркер актуальности (`grep` известной строки), иначе остановиться и доложить.
- В общий feat не пушить без нужды; только **fast-forward, без `--force`**. Пуш feat может опубликовать неотправленные коммиты ПАРАЛЛЕЛЬНОГО чата — координировать.

### Живость агентов
- При запуске **оценивать длительность и ставить себе напоминалку** (ScheduleWakeup) на проверку живости. Не полагаться только на нотификацию о завершении — агенты тихо умирают/виснут.
- Проверка живости БЕЗ чтения транскрипта: `git worktree list` + коммиты на ветке агента; список задач (пусто = не отслеживается/мёртв); нотификация о завершении. ⚠️ Размер `.output`-файла НЕнадёжен (почти всегда ~179 байт) — не использовать как сигнал.
- Мёртв/завис → проверить его worktree `git status` на несохранённое (салвадж) → прибрать (`git worktree remove --force`; если locked — сперва `git worktree unlock`) → перезапустить с корректной базой.

### Интеграция и уборка
- Интегрировать вывод агентов **по одному**: посмотреть diff/скриншоты → typecheck/тесты → merge (ff или 3-way) в feat → удалить worktree агента.
- Убирать за собой dev-серверы и worktree: висящие серверы/worktree перегружают среду и могут заклинивать новых агентов.
- Перед запуском проверять, не делает ли ту же работу **параллельный чат** (чужие ветки/worktree вида `claude/*`) — чтобы не дублировать.
- Панель Background tasks может показывать «фантомы» (Running) после завершения процессов; их `TaskStop` не находит — чистить кнопкой Clear, а реальные процессы проверять через `ps` / порты.
