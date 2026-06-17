# MASTER PLAN — DB access chokepoint (pre-SAAS)

> Канонический метод исполнения — `docs/AGENT_AUTORUN_SCHEME.md` (читать ПЕРЕД работой).
> Always-правила — `AGENTS.md` + `.cursor/rules/*` (особенно: **нет сырому SQL — только drizzle**,
> clean-architecture/изоляция слоёв через DI, system_settings mirror, host-psql).
> Поведение-сохраняющая инициатива → полный adversarial-loop как у SAAS НЕ нужен; достаточно
> per-этап код-аудита (§4A) + приёмки по тестам/рендеру.
> **Prior art (держим в `docs/` ради этой инициативы — обязательно читать):** `docs/INTEGRATOR_DRIZZLE_MIGRATION/`
> (ADR «постоянных pg-зон» Class A/B/C + `RAW_SQL_INVENTORY.md`; 17 фаз закрыты) + наш `RAW_SQL_RULING.md`
> (свод 2 Opus: оставить сырой SQL, достроить chokepoint, legacy → couple-with-lifecycle). НЕ перезапускать
> закрытую миграцию; эта инициатива = только chokepoint, не переписывание SQL.

## Цель (результат, который должен быть получен)
**Каждый доступ к БД в монорепо идёт через единый, защищённый guard'ами, перехватываемый ствол
на процесс** (центральный пул + `withClient()` + именованные провайдеры пулов), сырой SQL заперт
в `infra/repos`, CI не даёт регрессировать. ⇒ SAAS T0 сводится к «выставить tenant-принципала
в существующем стволе + включить RLS». Эта инициатива выкатывает **нулевое изменение поведения**.

## Этапы (какие действия должны быть выполнены)

### S0 — Базлайн + чтение правил (research)  [исполнитель + Opus-сверка]
- Прочитать `AGENTS.md` + `.cursor/rules/*` + аудит `../SAAS_FOUNDATION/RAW_SQL_AUDIT.md` (+ `.tsv`) + наш `RAW_SQL_RULING.md`.
- **Прочитать `docs/INTEGRATOR_DRIZZLE_MIGRATION/`** (`DRIZZLE_TRANSITION_PLAN.md` + `RAW_SQL_INVENTORY.md` + `LOG.md`) —
  это **ADR постоянных pg-зон** и решения phase-08; **постоянные зоны** (раннер миграций, `SKIP LOCKED`-очереди,
  ops-скрипты, кросс-схемные `public.*`-чтения) оставляем КАК ЕСТЬ; **legacy** (`rubitime_*`/`patient_bookings`/
  `appointment_records`) — couple-with-lifecycle, не мигрировать ради ORM.
- Построить «карту доступа к БД» (по процессам): все каналы (getDrizzle/runWebappSql/runWebappPgText;
  runIntegratorSql; media-worker pool; packages с инъекцией клиента) + полный список «беглецов»;
  пометить постоянные pg-зоны как **KEEP (по ADR)**, а не как кандидатов на правку.
- **DoD:** doc `db-access-map.md` со 100%-инвентаризацией каналов (KEEP-зоны помечены); кода не трогаем.
- **Поправка к аудиту (от ревьюера B):** в `RAW_SQL_AUDIT.md` §2.2 завышен счёт прямых `db.query` интегратора
  (~19 заявлено vs ~4 реально) — сверить/поправить при инвентаризации; выводы §4 верны.

### S1 — Убрать port-байпассы (сырой SQL → `infra/repos` + порты)  [параллельно по disjoint-файлам]
- Перенести сырой SQL из `modules/**` (10), `app-layer/**` (~8), routes/pages (4) в `infra/repos`
  с определением портов; вызовы — через DI `buildAppDeps`. Включая 2 app-layer dedicated-client
  (`createDoctorClient`, `messengerPhoneHttpBindExecute`) + `modules/auth/channelLink`.
- **DoD:** `rg` показывает 0 сигнала сырого SQL в `modules/**`, `app/**/route.ts`, `page.tsx`,
  `actions.ts`, `app-layer/**`; ESLint clean; scoped-тесты зелёные; поведение не изменилось.

### S2 — `system_settings`: один аксессор + CI-grep (= P0.11)  [1 исполнитель]
- Свести 3 webapp-байпассера (`pgBookingEngine:128`, `pgBookingRubitimeBridge:56`,
  `configAdapter:51,129`) за `infra/repos/pgSystemSettings.ts` (или извлечённый `readSystemSettingString()`).
- CI-grep: падать на любом `SELECT … FROM system_settings` вне аксессора (по приложению).
  Примечание в `000-critical-integration-config-in-db.mdc` + `system-settings-integrator-mirror.mdc`.
- **DoD:** `system_settings` читают только `pgSystemSettings.ts`/`publicSystemSettings.ts`
  (+ media-worker accessors); grep-guard в CI и зелёный; тесты зелёные.

### S3 — Единый `withClient()` для выделенных клиентов  [1 исполнитель, затем миграция сайтов]
- Создать в `infra/db` единый `withClient(fn)` / `withTransaction(fn)`: checkout `PoolClient` из
  центрального пула, прогон fn, release — спроектировать так, чтобы будущий `SET` принципала был
  **одной строкой**. Перевести ~30 рантайм-`.connect()` сайтов на него.
- **DoD:** `rg`/ESLint — 0 сырых `pool.connect()` вне провайдера; helper — единственный путь checkout;
  тесты зелёные; поведение не изменилось.

### S4 — Единые провайдеры отдельных пулов + dormant identity-hook  [1 исполнитель]
- Свести `new Pool` (integrator `client.ts`, media-worker `main.ts`, webapp purge-pool,
  boot-`migrate.ts`) к именованным провайдерам на процесс; добавить **dormant** seam
  `pool.on('connect')` под будущего per-process принципала. Решить роль ops-скриптов
  (запускать под migrator/admin-ролью, не под app-ролью).
- **DoD:** каждый `new Pool` — в именованном провайдере (`rg`: нет ad-hoc `new Pool` вне провайдеров);
  hook-seam присутствует (бездействует); тесты зелёные.

### S5 — CI/ESLint guard'ы от регрессий  [контролёр]
- Guard'ы: (a) нет сырого SQL (текст или `sql\`\``) вне санкционированных хелперов/`infra/repos`;
  (b) нет `.connect()`/`new Pool` вне провайдеров; (c) grep `system_settings` (из S2). Вшить в `pnpm ci`.
- **DoD:** guard'ы в CI, зелёные на очищенном дереве; намеренное нарушение **роняет билд** (доказать).

### S6 — Приёмка: нулевое изменение поведения + покрытие ствола  [Opus-аудит + visual]
- Полный CI (lint/typecheck/test/build) зелёный. Рендер-сверка ключевых страниц на `:5200` (без
  изменений поведения). Отчёт «funnel coverage»: 100% доступа к БД идёт через пул/провайдер/`withClient`
  — перечислено, беглецов нет (кроме перечисленных процессов с identity-hook).
- **DoD:** CI зелёный; отчёт покрытия без неучтённых путей; ствол «в одной строке» от установки принципала.

## ФИНАЛЬНЫЙ ЧЕК-ЛИСТ (Definition of Done всей инициативы)
- [ ] `rg` сырого SQL вне `infra/repos`/санкц.хелперов = **0** (modules/app-layer/routes/pages чисты).
- [ ] Все ~30 выделенных клиентов идут через единый `withClient()`/`withTransaction()`.
- [ ] Все `new Pool` — в именованных провайдерах на процесс; dormant identity-hook на каждом.
- [ ] `system_settings` читается ровно через один аксессор на приложение; CI-grep активен.
- [ ] CI-guard'ы (сырой SQL / `.connect()` / `new Pool` / system_settings) в `pnpm ci`; нарушение роняет билд.
- [ ] Отчёт «funnel coverage»: 100% БД-доступа перечислимо проходит через ствол; беглецов нет.
- [ ] Полный CI зелёный; ключевые страницы рендерятся идентично (поведение НЕ изменилось).
- [ ] `log.md` + синхронизация доков; границы соблюдены (НЕТ org_id / RLS / tenancy-семантики).

## Результат (одной строкой)
Готовый, единый, защищённый, перехватываемый ствол доступа к БД во всех процессах — так что
`SAAS_FOUNDATION` стартует сразу с tenancy-семантики, а её T0 = «принципал + RLS», без рефактора.

## Объём / границы / гейты
- **Оценка:** ~2.5–4 недели; ~50–70 файлов (webapp/integrator/media-worker/packages). Длинный шест — S3.
- **Scope boundaries:** трогаем доступ к данным + CI-guard'ы; НЕ трогаем UI/продукт, схему (org_id),
  RLS-политики, мультитенантность (это SAAS). Расширение scope — только с согласия владельца.
- **Гейтов наружу нет** (поведение-сохраняюще, тест-проверяемо). Механизм request-контекста
  (AsyncLocalStorage + pinned-connection, развязка `buildAppDeps=cache()`) — это уже проброс
  принципала ⇒ **первый этап SAAS T0**, не входит сюда (S3 лишь готовит посадочную точку).
