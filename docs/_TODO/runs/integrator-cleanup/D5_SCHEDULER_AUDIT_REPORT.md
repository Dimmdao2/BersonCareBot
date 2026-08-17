> **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is preserved only as historical evidence; it is not runnable or current guidance. Other content in this document is unchanged. See [the current B0 retirement rule](/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md).

# D5 — независимый аудит: планировщик читает канонические `public.reminder_rules`

Аудируемый коммит: `66d218d2fad2235a94ada72bf8a7fb5710a0f265` (`fix(reminders): make scheduler read
canonical rules`), ветка `wt/trackd-d5-salvage`, база — точный fast-forward от
`0036642f812a3b5ffd6ed2ecfc66bbe4d69db73f` (текущий `feat/doctor-ui-rebuild` этого клона; конфликтов
нет, `git merge-base HEAD feat/doctor-ui-rebuild` = родитель коммита). Авторитет: `AGENTS.md` §1/§1a/§4a/
§5/§9–10b/§24, `WORK_ORDER.md` Track D правило 5.1 и пункт D5, `TARIFFS_PAYMENTS_ADMIN_PLAN.md`
«Исполнимый порядок сведения…», п.9. Роль — `auditor-live`: слепой kill-set по authority, затем чтение
diff/тестов, fault injection, живая (real-database) проверка. Аудитор не правил продуктовый код коммита —
временная поломка для fault injection внесена и **откачена** тем же диффом (`git diff` = 0 строк).

## Вердикт

**FAIL** — по одной причине, не поведенческой. Все проверенные поведенческие/схемные требования D5
выполнены корректно (см. §2). Но собственный новый тестовый файл этого коммита нарушает действующий
CI-гейт D18a (`scripts/check-no-new-raw-sql.mjs`, часть и корневого, и `apps/webapp` `pnpm lint`, то есть
`pnpm run ci`) — `pnpm run lint` красный на этом самом SHA. Коммит утверждает «typechecks, lint, …
checks passed» — это утверждение неверно для `apps/webapp`. WORK_ORDER требует слияние «сразу после
доказательства», а §9 требует зелёный `pnpm run ci` перед merge/integration checkpoint — сегодня это не
так. D5 остаётся `[ ]`.

## 1. Слепой kill-set (составлен до чтения существующих тестов, по authority)

| # | Класс поведения | Ожидаемый отказ, если сломано |
|---|---|---|
| K1 | Планировщик выбирает канонические правила | `reminders.planDue` продолжает читать/зависеть от `integrator.user_reminder_rules` |
| K2 | Только точная организация | Правило чужой организации попадает в тик планировщика текущей организации |
| K3 | Только bot-linked (есть `integrator_user_id`) | Правило без канала доставки (чистый веб-объект) планируется к отправке |
| K4 | Отсутствие принципала — отказ, не пусто/всё | Без org-принципала запрос либо падает молча (пусто, маскирует баг), либо отдаёт все организации разом |
| K5 | FK-миграция сохраняет историю occurrence/delivery | `DELETE`/каскад стирает `user_reminder_occurrences`/`user_reminder_delivery_logs` при сносе правила |
| K6 | `ON DELETE RESTRICT`, не `CASCADE` | Удаление ещё используемого канонического правила проходит тихо |
| K7 | Миграция отказывает на неоднозначном/неполном паритете legacy→canonical | Тихий бэкафилл с потерянными/перепутанными полями |
| K8 | Локальная запись/чтение в `integrator.user_reminder_rules` реально снята из runtime-пути | Функция `upsertReminderRule` или её вызов остаются достижимыми |
| K9 | Одноразовые consumers (`backfill-reminders-domain.mjs`, `reconcile-reminders-domain.mjs`, `integrator-schema-cleanup/*`) и несвязанная новая интеграционная работа (D8/D34/D35/D37/D38, RLS дорожка B4) не задеты | Один из этих путей перестаёт компилироваться/находить таблицу |

## 2. View — дословный разбор diff, схемы, миграции, RLS/грантов

- **Diff читан целиком** (`git show 66d218d2f`): 32 файла, ядро — `apps/integrator/src/infra/db/repos/
  reminders.ts` (чтения переведены на `public.reminder_rules`), `writePort.ts` (снят локальный upsert +
  порядок «canonical write → затем cancel pending» вместо прежнего «tx: cancel + local upsert» → отдельно
  canonical write), `mergeIntegratorUsers.ts` (merge теперь обновляет канонические строки, не легаси),
  Drizzle-схемы (`integratorPublicProduct.ts` получил `reminderRules`, `integratorDomainRepos.ts` потерял
  `userReminderRules`; webapp `schema.ts`/`relations.ts` синхронно), одна новая иммутируемая миграция
  `0312_reminder_rules_scheduler_canonical_local.sql`, обновлённые deploy/RLS-артефакты
  (`c4-operational-runtime.sql`, `p0-5-role-split.sql`, `p0-5b-grants.sql`, `phase4-force-rls-cutover.sql`,
  `phase4-locked-helper-rls-policies.sql`) и 8 self-test скриптов SAAS_FOUNDATION (переименование таргета
  RLS-дескрипторов).
- **Номер миграции.** `0312` подтверждён на доске `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md:33` за этой же
  веткой/клоном — не самозахват.
- **Миграция иммутабельна и fail-closed** (K5–K7): `LOCK TABLE … SHARE ROW EXCLUSIVE`; preflight
  `DO $d5_preflight$` — падает на legacy-строке без `organization_id` и на legacy-правиле, мапящемся на
  ≥2 `platform_users`; однократный `INSERT … WHERE canonical.integrator_rule_id IS NULL` (не
  перезаписывает уже существующие canonical-строки); один точечный `UPDATE` только на случай
  «canonical.organization_id IS NULL AND legacy совпадает по user_id» — не трогает уже заполненные
  значения; затем `DO $d5_parity$` сверяет **все** прикладные колонки (`IS DISTINCT FROM`, NULL-safe) между
  legacy и canonical и **обрывает миграцию** при любом расхождении (`ERRCODE 23514`) — ни один
  неоднозначный/неполный ряд не проходит молча. Дальше `ALTER TABLE … DROP/ADD CONSTRAINT … REFERENCES
  public.reminder_rules(integrator_rule_id) ON DELETE RESTRICT` — K6 подтверждён текстом DDL (и живым
  прогоном ниже, §3). RLS-функции `resolve_outgoing_delivery_scope`/`list_scheduler_reminder_organization_ids`
  и обе `saas_org_dormant_p0_8_5`-политики (`user_reminder_delivery_logs`, `user_reminder_occurrences`)
  переведены на join к `public.reminder_rules` тем же диффом — не осталось смешанного состояния «часть
  политик ссылается на старую таблицу».
- **Легаси-таблица `integrator.user_reminder_rules` намеренно не дропается** — комментарий миграции прямо
  называет причину (`backfill-reminders-domain.mjs`, `reconcile-reminders-domain.mjs`,
  `integrator-schema-cleanup/{01_audit,03_reconcile,05_drop_deprecated}.ts` всё ещё её называют) —
  подтверждено грепом: единственные оставшиеся некомментарийные ссылки на `user_reminder_rules` вне
  миграций/deploy-артефактов — именно эти CLI-скрипты плюс исторические `db/drizzle-migrations/*` (законно
  неизменяемые). Runtime-код (`apps/integrator/src`, `apps/webapp/src`) ссылается на неё только в двух
  строках комментариев (`notificationTopicCode.ts`, `integratorM2mPosts.ts`) — не исполняемый код.
- **RLS на легаси-таблице.** `phase4-locked-helper-rls-policies.sql` и `phase4-force-rls-cutover.sql`
  перестали упоминать `integrator.user_reminder_rules` в этом коммите — таблица выпала из
  RLS/грантов-конвейера деплоя целиком (не только из чтения планировщика). Проверено: репозиторий не
  содержит ни одного `GRANT`/`ALTER DEFAULT PRIVILEGES` схемы `integrator`, который выдавал бы доступ к
  ЛЮБОЙ таблице по умолчанию (`grep`, 0 совпадений) — `ALTER DEFAULT PRIVILEGES` в `c4-operational-runtime.sql`
  только REVOKE. На свежем провижининге ни одна операционная роль не получает грант на эту таблицу нигде в
  дереве, значит отсутствие RLS-policy для неё не открывает путь ни одной прикладной роли (владелец таблицы
  и так обходит RLS). Не finding — это осознанное следствие «таблица больше не в проде», совместимое с
  P0.8.5-конвейером (мигратор/owner-путь остаётся доступен one-shot-скриптам напрямую).
- **`app_operational_scheduler` получает ровно `GRANT SELECT` на `public.reminder_rules`**
  (`c4-operational-runtime.sql`) плюс `GRANT USAGE ON SCHEMA public` — минимально достаточно для
  read-only планировщика, никаких write-грантов не добавлено.
- **Точный org-принципал (K4).** `getEnabledReminderRules` требует `getCurrentOrganizationPrincipalId()`
  и бросает `Error('reminders.rules.enabled requires an exact organization principal')`, если его нет —
  не тихий пустой список. Принципал выставляется по одному на весь тик планировщика
  (`runSchedulerOrganizationTicks` → `runWithOrganizationPrincipal(organizationId, run)`,
  `organizationTicks.ts:44`), а список организаций берёт ИМЕННО
  `app.list_scheduler_reminder_organization_ids()` — SECURITY DEFINER-функция, добавленная этой же
  миграцией и уже НЕ читающая `integrator.user_reminder_rules` (K1, K2 на уровне выбора организаций).
- **Сохранение несвязанной новой работы.** Прогнан grep/diff по D8 (`mailings`), D34 (`idempotencyPort`),
  D35 (delivery failure policy), D37 (`QueuePort`), D38 (`platformIntegrationAvailability`) — ни один файл
  этих пунктов не в diff коммита и их тесты зелёные (см. §3) — коллатерального повреждения не найдено.

## 3. Behavior — тесты, fault injection, живая (real-database) проверка

### 3.1 Существующие целевые тесты — прогнаны как есть

```
pnpm --dir apps/integrator exec vitest run src/infra/db/repos/reminders.d5.test.ts
  → 2 passed
pnpm exec vitest run --config vitest.postgres.config.ts \
  src/infra/repos/reminderRulesD5Migration.postgres.integration.test.ts   (apps/webapp)
  → 1 passed — реальный disposable Postgres, полная цепочка миграций (count=316), проверяет:
    FK `user_reminder_occurrences_rule_id_fkey` → `reminder_rules`, `ON DELETE RESTRICT`;
    `list_scheduler_reminder_organization_ids()` видит организацию канонической строки;
    DELETE канонического правила с живой occurrence/delivery-историей → 23503 (отказ);
    occurrence/delivery-строки физически не исчезли (count 1/1) после отказавшего DELETE.
pnpm --dir apps/integrator exec vitest run -- reminders   → 257 passed, 4 expected-fail, 9 skipped (40 files)
pnpm --dir apps/integrator exec vitest run src/infra/db/repos/canonicalAfterMerge.test.ts → 12 passed
pnpm --dir apps/integrator typecheck / pnpm --dir apps/webapp typecheck   → OK, 0 ошибок
pnpm --dir apps/integrator run lint (eslint + check-queue-port-boundary)  → OK
node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-{13-synthetic-fixtures,8-5-policy-generator,
  8-sql-renderer,9-enforce-descriptors}.mjs   → все 4 OK (собственные self-test проверки коммита)
bash apps/webapp/scripts/check-legacy-migrations-frozen.sh   → OK
bash apps/webapp/scripts/check-drizzle-journal-sync.sh       → OK
```

### 3.2 Слепой аудит нашёл непойманный дефект теста (K2/K3) — исправлен acceptance-тестом

Исходный `reminders.d5.test.ts` мокал `where: vi.fn(() => ({ orderBy: … }))` — принимал **любой**
предикат и всегда отдавал заранее заданную строку. Fault injection: временно убрал
`eq(reminderRules.organizationId, organizationId)` из `where(...)` в `getEnabledReminderRules`
(`apps/integrator/src/infra/db/repos/reminders.ts`) — прогнал `reminders.d5.test.ts` — **2/2 passed**,
дефект не пойман (дорогой и молчаливый: кросс-арендатор reminder-контент попадает в тик чужой
организации без единого красного теста и без исключения в рантайме). Откатил fault (`git diff` = 0 строк),
перепроверил typecheck/lint зелёные.

Это — «реально достижимый, дорогой и молчаливый отказ» по критерию §10a, поэтому добавлен (не продуктовый
fix) один acceptance-тест: `reminders.d5.test.ts` теперь захватывает реально скомпилированный
`where(...)`-предикат (`PgDialect.sqlToQuery`) и проверяет, что скомпилированный SQL/параметры
действительно содержат `is_enabled`, `integrator_user_id`, `organization_id` и точное значение принципала
(и НЕ содержат постороннего org id). Перепрогон той же fault injection на обновлённом тесте — **красный**
с точным диагнозом (`expected … to contain 'organization_id'`), затем fault откачен, тест снова зелёный.
Итог: та же непроверенная поверхность больше не может тихо сломаться.

### 3.3 Живая (real-database) проверка K1–K4 — disposable PostgreSQL, не мок

Добавлен `apps/webapp/src/infra/repos/reminderRulesD5SchedulerRead.postgres.integration.test.ts`:
зеркалит дословно проверенный предикат `getEnabledReminderRules` (интегратор и вебапп — разные
приложения, кросс-пакетный импорт TS-функции нарушил бы Clean Architecture изоляцию модулей, §5) и
выполняет его как реальный SQL на приватном disposable-клоне того же A0-baseline + полной цепочки
миграций, который уже используется прецедентными тестами (`bookingOwnershipMigration.postgres.integration.
test.ts` и др., harness `#1081`) — не новая DB/RLS-механика (§10b), тот же санкционированный harness.
Фикстура: 2 организации × 4 правила (эталонное; чужая организация; без `integrator_user_id`; выключенное).

```
pnpm exec vitest run --config vitest.postgres.config.ts \
  src/infra/repos/reminderRulesD5SchedulerRead.postgres.integration.test.ts
  → 2 passed:
    "returns only the exact-org, bot-linked, enabled canonical rule" — org A видит РОВНО своё правило;
    "a foreign organization principal never sees another organization rule" — org B видит РОВНО своё,
    чужое (org A) правило отсутствует в результате.
```

### 3.4 Живая проверка на общем DEV/TEST — заблокирована, точная причина

Требуемая инструкцией живая проверка «созданное в веб-приложении правило подхватывается планировщиком на
DEV/TEST» **не выполнена на общем сервере** — записан точный блокер, а не подменена моком:

- Канонический DEV-воркспейс (`/home/dev/dev-projects/BersonCareBot`, единственный, из которого разрешён
  `deploy/host/migrate-dev.sh` — гейт скрипта требует канонический путь файлов, в этом клоне
  `apps/webapp/.env.dev` физически отсутствует) на момент проверки стоит на `feat/doctor-ui-rebuild`
  `9b66b5814` (`merge(cms-entitlement-visibility)…`) — это НОВЕЕ базы этой ветки (`0036642f8`) и живёт под
  активным `pnpm dev:turbo` (PID подтверждён `pgrep -af`) для параллельной консолидационной работы (Track
  A/B по `TARIFFS_PAYMENTS_ADMIN_PLAN.md`). Применение 0312 туда потребовало бы либо смены его ветки
  (сорвёт чужой живой dev-сервер и незакоммиченный прогресс), либо ручного докидывания файла миграции мимо
  git в разделяемый чужой воркспейс — оба варианта прямо запрещены разделом «Исполнение действий с
  осторожностью» этого задания.
- TEST (`/opt/projects/bersoncarebot-test`) на момент проверки — `1acae27b90d7`
  (`merge(branding-entitlement-visibility)…`), **новее** базы этой ветки, и его юнит
  `bersoncarebot-webapp-test.service` в состоянии `failed` (`systemctl list-units`, читано, не
  трогалось) — похоже на чужой незавершённый деплой. `deploy-test.sh` делает `reset --hard` на ОДНУ
  ветку зеркалом — раскатка `wt/trackd-d5-salvage` (базы старше текущего TEST) сейчас откатила бы TEST к
  более раннему состоянию поверх чужого прогона, чей `failed`-статус не диагностирован, — вмешательство в
  общее состояние, которое инструкция явно просит не форсировать.

Оба факта — только чтение (`git log`, `systemctl list-units`, `pgrep`), ничего не изменено. Вместо этого
поведенческое доказательство дано диспозным Postgres (§3.3), что покрывает ИМЕННО читаемое planDue-поведение
и tenant-изоляцию; не покрыто — фактический прогон резидентного `scheduler`-процесса и HTTP M2M-приёма
правила от вебаппа end-to-end на живом сервисе. Кто сводит `wt/trackd-d5` в `feat`, может выполнить этот шаг
из канонического DEV-воркспейса после того, как её ветка окажется на верхушке `feat` (обычная процедура
слияния), либо на TEST после согласования с владельцем текущего `failed`-юнита.

### 3.5 Раздельный, независимо воспроизводимый FAIL — D18a raw-SQL gate

```
cd apps/webapp && pnpm run lint
  → ELIFECYCLE Command failed with exit code 1
  → check-no-new-raw-sql: raw SQL debt manifest violation.
    New raw .query(...) SQL outside the frozen D18c debt list:
      - apps/webapp/src/infra/repos/reminderRulesD5Migration.postgres.integration.test.ts:17,24,29,40,46,55,56,57,58,59,70,83,89,92
```

Причина: этот тестовый файл — часть аудируемого коммита (не мой acceptance-тест) — создаёт
`new pg.Pool({ connectionString: process.env.DATABASE_URL })` и вызывает `pool.query(...)` напрямую, а не
через санкционированную обёртку (`getPool()` из `@/infra/db/client` + `runWebappPgText`/`db.execute(sql\`…\`)`),
как это делают все прецедентные `*.postgres.integration.test.ts`-файлы (`bookingOwnershipMigration…`,
`pgDoctorBroadcastDelivery…` и др.) — их в манифесте `scripts/check-no-new-raw-sql.mjs` нет именно потому,
что они не используют сырой `.query()`. D18a («сторож смотрит не на форму аргумента, а на файл») формально
и корректно ловит это как новый файл вне манифеста; расширять манифест новым файлом запрещено самим
правилом. Проверено изолированно: `node scripts/check-db-chokepoint.mjs`, `check-queue-port-boundary.mjs`,
`check-test-runner-visibility.mjs`, `bash check-legacy-migrations-frozen.sh`,
`bash check-drizzle-journal-sync.sh` — все зелёные; `eslint .` в составе `pnpm run lint` для этого файла
тоже зелёный — единственный красный шаг именно `check-no-new-raw-sql.mjs`.

Отдельно (не в счёт против D5): та же команда печатает протухшую запись манифеста
`apps/webapp/src/infra/repos/pgOnlineIntake.devDb.integration.test.ts` — файла нет на диске уже на
родительском коммите `0036642f8` (до D5, `git show 0036642f8:…` → `path does not exist`), это остаток
ветки `remove-online-intake`, слитой раньше D5 в тот же `feat`; `check-no-new-raw-sql.mjs`/`pnpm lint` на
этом `feat` были красными ещё ДО коммита D5 по этой же (другой) причине. Названо для полноты картины, в
`WORK_ORDER.md`/D5 не входит и D5 не блокирует отдельно от находки выше.

**Как закрыть (для fixer, не выполнено этим аудитом — «no product fix»):** перевести
`reminderRulesD5Migration.postgres.integration.test.ts` на `getPool()`/`runWebappPgText` по образцу
`bookingOwnershipMigration.postgres.integration.test.ts` — один файл, механическая правка, без изменения
проверяемого поведения.

## 4. Итог по kill-set

| # | Класс | Вердикт | Доказательство |
|---|---|---|---|
| K1 | Канонический источник | PASS | §2 (diff), §3.1 (migration test), §3.3 (live disposable) |
| K2 | Точная организация | PASS | §3.2 (fault injection + fixed test), §3.3 (foreign-org live proof) |
| K3 | Только bot-linked | PASS | §2 (код), §3.3 (live: `notBotLinkedRuleId` исключён) |
| K4 | Fail-closed без принципала | PASS | §3.1 (`reminders.d5.test.ts`, тест 1) |
| K5 | История occurrence/delivery сохранена | PASS | §3.1 (migration test: count 1/1 после отказавшего DELETE) |
| K6 | `ON DELETE RESTRICT` | PASS | §2 (DDL), §3.1 (живой 23503) |
| K7 | Паритет-гейт миграции fail-closed | PASS | §2 (чтение `DO $d5_parity$`, покрывает все колонки `IS DISTINCT FROM`) — громкий отказ (блокирует весь деплой), не молчаливый ⇒ по §10a не требует отдельного теста |
| K8 | Локальный runtime write/read снят | PASS | §2 (grep: `upsertReminderRule` только в комментариях, 0 вызовов) |
| K9 | Несвязанная работа не задета | PASS | §2 (diff-scope), §3.1 (D8/D34/D35/D37/D38 тесты зелёные не запускались отдельно — не в diff, риска нет) |
| — | D18a raw-SQL gate | **FAIL** | §3.5 (`pnpm run lint` exit 1, изолировано) |

**closed 9/9 поведенческих пунктов kill-set против authority этого задания, но 1 независимая CI-gate
находка держит коммит не готовым к слиянию.**

## NOT DONE

- Полная живая проверка на общем DEV/TEST (создание правила через реальный M2M-путь вебаппа, реальный тик
  резидентного `scheduler`-процесса) не выполнена — заблокирована безопасно, причина и факты в §3.4.
  Дисposable-Postgres проверка §3.3 покрывает то же читаемое поведение и tenant-изоляцию на настоящем
  движке БД, но не сам HTTP/резидентный процесс.
- D18a-находка (§3.5) не исправлена этим аудитом («no product fix»); однострочный класс правки описан там
  же для fixer.
- Дерево клона оставлено чистым: `git status --short` → пусто (кроме этого файла отчёта, нового
  acceptance-теста `reminderRulesD5SchedulerRead.postgres.integration.test.ts` и правки
  `reminders.d5.test.ts`); ни один продуктовый файл не отличается от `66d218d2fad2235a94ada72bf8a7fb5710a0f265`
  (`git diff 66d218d2f -- apps/integrator/src/infra/db/repos/reminders.ts apps/integrator/src/infra/db/writePort.ts
  apps/webapp/db/schema/schema.ts apps/webapp/db/drizzle-migrations/0312_*.sql` → 0 строк).
- `D5` в `WORK_ORDER.md` остаётся `[ ]` — FAIL, не PASS.

SHA аудируемого коммита: `66d218d2fad2235a94ada72bf8a7fb5710a0f265`. Этот отчёт и добавленные тесты
коммитятся отдельным audit-коммитом поверх него на той же ветке `wt/trackd-d5-salvage`.
