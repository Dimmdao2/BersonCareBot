# В9б — независимый аудит исполнимой декомпозиции tenant-wall

Дата аудита: 2026-08-01

Роль: `auditor-live`

Target: `ff443a4a4a7c55a2c6b67d6f98392bf1c2e2e96b` (`docs(security): decompose V9b tenant wall #1081`)

Проверенный artifact: `docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md` из target commit

Классификация: одноразовое docs-only проектирование; inspection, code-search, exact search и backrefs. Постоянные source-text tests, DB/DEV/TEST/PROD/deploy не выполнялись.

## Вердикт

**FAIL.** Перечни рекомендации перенесены без потерь: `10` FORCE-таблиц, `5` retirement-first проекций, `29` capability/ACL-таблиц и `9` global/no-RLS таблиц присутствуют. Но декомпозиция пока не исполнима безопасными land-ами: для capability/global групп нет закрытого per-table caller/ACL oracle; живой Track D1 writer отсутствует в manifest; revoke назначен раньше adoption; S03 предписывает лишнюю quarantine relation и удаление непривязанных booking rows; `WAIT_OVERLAP` не имеет измеримых условий; первый brief ложно ждёт owner release; один policy helper назван несуществующим именем; operational TEST oracle оставлен на позднее угадывание роли.

Итог по gate: `0 PASS / 9 FAIL`; отдельные closure/DAG подпункты проходят, но ни один из девяти gate не закрыт целиком.

| Gate | Вердикт | Evidence |
| --- | --- | --- |
| 1. Closure matrix | **FAIL** | Все четыре исходных множества перечислены, но `29` capability и `9` global таблиц закрыты агрегатно, без таблица → live caller → exact capability/role → revoke → evidence. В самом target финальный caller census оставлен в `НЕ ПРОВЕРЕНО`. |
| 2. Human path | **FAIL** | Exact search показывает живые auth/OTP, identity, delivery, push, analytics и worker callers вне S04 manifest; массовый revoke или FORCE до их adoption даёт `42501`/zero-row и ломает путь человека. |
| 3. Dependency order | **FAIL** | S02 одновременно создаёт capability и отзывает ACL, а S04 с caller adoption идёт позже. A1 → TEST задан верно, но безопасный expand → adopt → contract порядок не выражен deployable land-ами. |
| 4. Minimality | **FAIL** | Постоянная quarantine/audit relation и удаление непривязанных projection rows не обоснованы recommendation: достаточно fail-closed migration abort. Число `7 migrations` не доказано безопасным assignment-ом S02/S04, хотя после корректного expand/contract оно может остаться `7`. |
| 5. Manifest reality | **FAIL** | Названные target-файлы и migrations существуют; FK/backrefs подтверждены. Но `app.current_organization_id()` отсутствует, канонический helper — `app.current_org_id()`. D1 runtime writer/grant overlay не попали в manifest. |
| 6. Overlap | **FAIL** | Tariff-файлы формально запрещены верно, но D1/D10 описаны как ожидание согласования вместо адаптации единственного уже живого D1 writer. Формула `owner confirms/releases` создаёт ложный owner-gate. |
| 7. `WAIT_OVERLAP` | **FAIL** | Ни у одного WAIT нет branch/SHA/path/hunk и бинарного условия снятия. По текущему source/board census S01 уже ready; D10 не является условием identity FORCE. |
| 8. First-worker brief | **FAIL** | Scope/запреты/migration-board у S01 точные, но brief не запускается сейчас из-за ложного `after the overlap owner releases`; технический census уже даёт ready S01. |
| 9. TEST gate | **PASS по форме tenant actors, FAIL в целом** | Staff/patient non-owner logins, SELECT+DML, FORCE metadata, `rolbypassrls=false` и no-owner-membership названы корректно. Но exact operational login/role/capability matrix отсутствует и заменён placeholder `app_worker`, поэтому gate целиком **FAIL**. |

## Closure matrix

Команда подсчёта и результат:

```bash
printf 'FORCE='
sed -n '17,26p' docs/_TODO/runs/testsuite-v2/V9B_WALL_RECOMMENDATION.md | rg -o '^\| `[^`]+`' | wc -l
printf 'RETIRE='
sed -n '34,43p' docs/_TODO/runs/testsuite-v2/V9B_WALL_RECOMMENDATION.md | rg -o '`(booking_branch_services|booking_branches|booking_services|booking_specialists|branches)`' | sort -u | wc -l
printf 'CAPABILITY='
sed -n '49,56p' docs/_TODO/runs/testsuite-v2/V9B_WALL_RECOMMENDATION.md | rg -o '`[a-z_]+`' | sort -u | wc -l
printf 'GLOBAL='
sed -n '66,68p' docs/_TODO/runs/testsuite-v2/V9B_WALL_RECOMMENDATION.md | rg -o '`[a-z_]+`' | sort -u | wc -l
# FORCE=10, RETIRE=5, CAPABILITY=29, GLOBAL=9
```

| Oracle set | Target slice | Coverage | Конечное evidence | Вердикт |
| --- | --- | --- | --- | --- |
| `patient_bookings`, `appointment_records`, `be_organization_members`, `platform_users`, `product_analytics_hourly`, `user_channel_bindings`, `user_channel_preferences`, `user_notification_topic_channels`, `user_notification_topics`, `user_web_push_subscriptions` (`10`) | S03/S04/S05a-c/S06/S07 | Все `10` названы. | Named SELECT/DML cases, FORCE metadata, real non-owner TEST logins. | **FAIL:** D1 writer/capability и точные per-table predicates не закрыты; S05b использует несуществующий helper. |
| `booking_branch_services`, `booking_branches`, `booking_services`, `booking_specialists`, `branches` (`5`) | S01 | Ровно `5`; canonical `be_*` не назначены к drop. Legacy FK/backrefs подтверждены. | Source/schema/grant absence inspection. | **PASS по closure**, но slice readiness/brief — FAIL из-за ложного WAIT. |
| Capability/ACL (`29`) | S02 + adoption/S04 | Все `29` перенесены одной строкой. | Общий deny/allow kill-set. | **FAIL:** нет per-table current grants, live callers, replacement seam и exact implementing slice; массовый revoke не имеет полного adoption proof. |
| Global/no-RLS (`9`) | S02 ACL audit | Все `9` перенесены. | Не определено, кто и какими verbs должен пользоваться каждой таблицей. | **FAIL:** нет бинарной actor/verb matrix, поэтому нельзя отличить необходимый catalog read от tenant grant на platform telemetry/migration data. |
| A1 + shared TEST | S06/S07 | Existing A1 расширяется, второй harness не создаётся. | `check:saas-a1-rls-conformance`, затем authorised TEST record. | **PASS по порядку**, **FAIL по operational completeness**. |

## Dependency matrix

| До | После | Состояние target | Вердикт / impact |
| --- | --- | --- | --- |
| Exact capability/operational role существует | Live caller adopts it | S02 обещает capabilities, но не назначает все callers. | **FAIL:** auth/OTP/worker path может остаться без replacement. |
| Caller adoption доказан | Direct table grant revoked | S02 contract отзывает grants; S04 adoption расположен позже, а текст лишь обещает co-land части revoke. | **FAIL:** S02 не является самостоятельно deployable land. |
| Deterministic backfill = все live rows provable | `NOT NULL` / FORCE | S03 допускает перенос в новую relation и deletion/denial вместо abort. | **FAIL:** непривязанная booking row исчезает из живого пути вместо остановки миграции. |
| S01 removes legacy FKs only | S03 adds ownership | Порядок задан; canonical `be_appointments`/snapshots сохраняются. | **PASS**, если migration не удаляет `patient_bookings`/`appointment_records` и `be_*`. |
| Existing D1 writer получает exact seam | S05a FORCE | D1 writer не назван в S04 manifest; вместо решения стоит WAIT D1/D10. | **FAIL:** first-contact Telegram/MAX identity write становится denied/zero-row. |
| S03 + S04 | S05b FORCE | Порядок задан. | **PASS по DAG**, после исправления F2/F3/F4/F7. |
| S06 A1 green | S07 TEST | Явно задано. | **PASS**. |

## Findings

### F1 — capability/global closure не доведена до исполнимого per-table контракта

**Сценарий.** Worker следует S02 и отзывает прямой table ACL у всей группы, тогда как S04 перечисляет только booking/merge/channel-link paths. В target source остаются отдельные live paths как минимум для phone/email OTP, password auth, outgoing delivery, push outbox, operator incidents, web-push, analytics и membership bootstrap. Они получают `permission denied` или zero rows; человек не регистрируется/не входит/не подтверждает запись, а delivery/health/worker jobs перестают исполняться.

**Evidence.** Exact caller census на target дал, среди прочего: `phone_challenges=6`, `email_challenges=4`, `user_password_credentials=5`, `outgoing_delivery_queue=20`, `integrator_push_outbox=13`, `operator_incidents=10`, `user_web_push_subscriptions=8`, `product_analytics_hourly=2`, `be_organization_members=9` source files (tests/schema исключены). Target S04 manifest эти семейства не закрывает, а `НЕ ПРОВЕРЕНО` прямо откладывает финальный census.

**Нарушено.** Gate 1–3; recommendation order 1–4; owner human-path requirement; `AGENTS.md` §5 «один общий проход».

**Минимальная коррекция.** Внести в план одну исчерпывающую таблицу для всех `29+9` строк: schema.table, current grants/roles, каждый live caller, вход/минимальный результат existing или new exact seam, implementing slice, adoption evidence, точный revoke land, final A1/TEST actor+verb assertion. Для global таблиц отдельно зафиксировать точный allow/deny ACL; «minimal» без actor/verb не является oracle.

### F2 — уже живой Track D1 writer отсутствует в manifest и может быть сломан FORCE

**Сценарий.** Новый Telegram/MAX пользователь приходит без tenant principal. Уже принятый D1 путь пишет `platform_users`, `user_channel_bindings`, `user_channel_preferences`, `user_notification_topics` через `apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts` под bare NOINHERIT integrator login; доступ сейчас дан `deploy/postgres/integrator-login-public-identity-grants.sql`. S05a включает FORCE, но S04 не меняет ни writer, ни overlay и не устанавливает для него exact capability. Первый webhook получает RLS denial; либо worker сохраняет/добавляет широкую operational policy и оставляет cross-tenant writer.

**Evidence.** Track D authority помечает D1 done (`79571f8f0`, merge `4997c9513`) и D10 open только для transport teardown. Exact search показывает прямые INSERT/UPDATE в D1 writer и bare-login grants; target plan не содержит путей `writeIdentityAndPreferencesDirect.ts`, `writePort.ts` или `integrator-login-public-identity-grants.sql` в S04 manifest.

**Нарушено.** Gate 2, 3 и 6; Track D rules 5.1.1/5.1.4; запрет второго writer/transport.

**Минимальная коррекция.** Не строить второй writer. Добавить существующие D1 writer, `writePort.ts`, overlay и их existing tests в S04/S05a manifest; выбрать и записать exact pre-principal capability/principal contract, перевести на него этот же writer, затем отозвать bare-login direct public grants до FORCE. D10 не является prerequisite: удаляемый HTTP transport уже drain-only, D1 producer снят.

### F3 — S02/S04 нарушают capability-before-revoke как deployable sequence

**Сценарий.** S02 land содержит capability definitions **и** direct ACL revokes, а caller code остаётся старым до S04. Любой deploy этого промежуточного SHA применяет migration до запуска нового приложения и ломает живые callers.

**Evidence.** S02 contract: «Revoke direct table ACL ... for every S02 table»; S02 manifest: одна migration с capability/role definitions and ACLs; S04 расположен следующим и обещает «co-land S02 final revokes», не отделяя, какие revokes отсутствуют в S02 land.

**Нарушено.** Gate 2–3; требование «caller получает principal/exact capability до revoke/FORCE».

**Минимальная коррекция.** Сделать явный expand/adopt/contract: S02 migration только добавляет/reuses exact seams и EXECUTE grants, не отзывая ещё используемый table ACL; S04 меняет всех caller-ов и тем же deployable land содержит второй migration с final revokes. После каждого land путь работает. Это может сохранить заявленные `7` файлов; перечень файлов пересчитать после такой раскладки точной командой, а не объявлять числом заранее.

### F4 — постоянная quarantine relation лишняя и предписывает достижимую потерю booking path

**Сценарий.** Существует pending/legacy `patient_bookings` или `appointment_records`, для которого canonical org не доказан — именно этот класс target ожидает. S03 переносит строку в новую relation и затем удаляет/denies её из live table. Pending payment/confirm/cancel/history больше не находит booking, хотя migration могла безопасно остановиться до FORCE.

**Evidence.** Recommendation разрешает `quarantine/fail-closed`, не требует новой relation. Target требует «migration-created quarantine/audit relation» и «then are deleted/denied from the live RLS table». Runtime count таких строк честно не измерен.

**Нарушено.** Gate 2–4; `AGENTS.md` «не плодить сущности»; requirement не удалять canonical booking data.

**Минимальная коррекция.** Удалить relation и deletion из плана. S03 migration должна детерминированно backfill-ить доказуемые строки, затем `RAISE EXCEPTION`/abort всей транзакции с reason counts при любой unresolved/ambiguous/mismatched строке; `NOT NULL` и дальнейший FORCE недостижимы, пока отдельный authorised reconcile не даст zero unresolved. Existing audit/event механизм использовать только если census докажет обязательную долговременную запись; он не заменяет abort.

### F5 — все `WAIT_OVERLAP` и first brief не имеют измеримого release condition

**Сценарий.** S01 ждёт «Track D transport owner confirms/releases», хотя runtime consumer отсутствует; worker не запускается, владелец получает ложный инженерный вопрос. S02/S04/S05a аналогично ждут D1/D10 без branch/SHA/hunk или test condition.

**Evidence.** Exact search `getByIntegratorBranchId|upsertFromProjection|deps.branches` оставил `pgBranches.ts` и `buildAppDeps.ts`; Work Order фиксирует D1 landed, D10 open и не назначает `branches` writer; актуальная board отдаёт V9б single-entry и показывает следующий свободный migration range `0304+`; active worktree census не показал Track D stateful branch. Tariff refs `wt/k4-round2` в этом clone отсутствуют, поэтому их состояние должно измеряться board SHA, а не owner release.

**Нарушено.** Gate 6–8; `AGENTS.md` §24.2 — ожидание ограничено измеримым состоянием; инженерные решения не перекладываются на владельца.

**Минимальная коррекция.** Пометить S01 `READY NOW`. Перед запуском: reread board → проверить named active SHA/diff только на `buildAppDeps.ts` branches import/factory/property → если тот же hunk занят, WAIT получает точную ветку/SHA и снимается при её land+rebase; если нет — reserve один номер и старт. Для S02/S04/S05a условия: named D1 source SHA присутствует; exact writer/capability adoption tests green; direct grant revoked; только затем FORCE. Удалить зависимость от D10 и слова `owner confirms/releases`.

### F6 — operational role и TEST capability oracle оставлены placeholder-ом

**Сценарий.** A1 проходит на staff/patient logins, но worker либо остаётся на широком `app_worker`, либо теряет queue/diagnostic access после revoke. Уведомления, web-push, analytics retention или scheduler падают уже после зелёного tenant matrix; альтернативно broad worker продолжает видеть все operational rows.

**Evidence.** Target называет `app_worker` «узкой ролью» и откладывает exact active role до S07. В source уже существуют специализированные роли `app_operational_diagnostic`, `app_operational_delivery_worker`, `app_operational_scheduler`, `app_operational_media_worker`, `app_operational_web_push_reminder`; S06 не задаёт их login→role→function/table matrix.

**Нарушено.** Gate 1, 2 и 9; recommendation «existing narrow operational roles»; exact operational capabilities requirement.

**Минимальная коррекция.** Заменить generic `app_worker` на таблицу существующих exact operational roles и настоящих login memberships. Для каждой роли задать direct-table deny, разрешённые functions/queue verbs и row/partition scope; расширить disposable A1 соответствующими synthetic non-owner login roles; S07 сверяет те же assertions на actual TEST login names, `rolbypassrls=false` и отсутствие owner membership.

### F7 — S05b ссылается на несуществующий principal helper

**Сценарий.** Worker копирует predicate S05b; migration с `app.current_organization_id()` падает на undefined function, booking FORCE не устанавливается.

**Evidence.** Exact target search находит canonical `CREATE OR REPLACE FUNCTION app.current_org_id()` и множество policy backrefs; `current_organization_id()` не определён.

**Нарушено.** Gate 5; manifest должен соответствовать текущей schema/runtime surface.

**Минимальная коррекция.** Во всех predicates использовать существующий `app.current_org_id()` и назвать точную owner-column для каждой из десяти таблиц, а не общий вариант `id/user_id/platform_user_id`.

## Первый исполнимый worker brief после fix-round

Первым остаётся **S01**, но без owner-gate. Его ready-condition на текущем census выполнен: пять retirement targets замкнуты, `branches` runtime consumer не найден, Track D1 landed, D10 не владеет этой projection, migration number ещё не занят.

Исправленный brief обязан сказать: работать только S01 на свежей `wt/` ветке от актуального integration SHA; перед созданием migration reread board и забронировать один номер (`0304+` является лишь текущим census, не вечной бронью); exact diff активных соседей проверять только для `buildAppDeps.ts` branches hunk. Удалять ровно пять legacy declarations/FKs/backrefs, `pgBranches` и три DI строки, generator entry; не трогать `stockQuotaCheck.ts`, `pgOrganizationInvites.ts`, canonical `be_*`, `patient_bookings`/`appointment_records` rows, D1 writer или D10 transport. Acceptance: no five schema objects/backrefs/grants, canonical booking schema/data declarations remain, generator output regenerated from source, schema/type/grant smoke green. Обнаруженный consumer возвращает точный path:symbol и ставит технический blocker; он не становится вопросом владельцу.

## Exact commands/searches

Target и рабочее состояние:

```bash
git status --short --branch
git rev-parse HEAD
git branch --show-current
git show -s --format='%H%n%P%n%s' ff443a4a4
git log --oneline --decorate ff443a4a4..HEAD
git diff --name-status ff443a4a4..HEAD
git show --stat --oneline ff443a4a4
```

Target artifact читался без подмены более поздним worktree:

```bash
git show ff443a4a4:docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md
```

Code-search выполнен до exact search:

```bash
node /home/dev/brain/tools/code-search.mjs "V9B_IMPLEMENTATION_SLICES tenant wall FORCE RLS retirement first capability" --repo bcb -k 12
node /home/dev/brain/tools/code-search.mjs "V9B_WALL_RECOMMENDATION 10 FORCE RLS five booking projections" --repo bcb -k 12
node /home/dev/brain/tools/code-search.mjs "Track D D1 D10 booking writer transport overlap" --repo bcb -k 12
node /home/dev/brain/tools/code-search.mjs "NIGHT_WAVE_AUDIT_QUEUE migration board parallel orchestrators V9B" --repo bcb -k 12
```

Manifest/schema/backrefs:

```bash
git ls-tree -r --name-only ff443a4a4 -- \
  apps/webapp/db/schema/schema.ts \
  apps/webapp/db/schema/relations.ts \
  apps/webapp/db/schema/bookingEngine.ts \
  apps/webapp/db/schema/productAnalytics.ts \
  apps/webapp/src/infra/repos/pgBranches.ts \
  apps/webapp/src/app-layer/di/buildAppDeps.ts \
  apps/webapp/src/app-layer/di/di.md \
  docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs \
  deploy/postgres/p0-5b-grants.sql \
  docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-5b-grants.mjs \
  apps/webapp/src/infra/repos/pgPatientBookings.ts \
  apps/webapp/src/infra/repos/pgAppointmentProjection.ts \
  apps/webapp/src/modules/patient-booking/canonicalCreate.ts \
  apps/webapp/src/infra/repos/pgChannelLinkClaim.ts \
  apps/webapp/src/app-layer/merge/platformUserMergePreview.ts \
  packages/platform-merge/src/pgPlatformUserMerge.ts \
  apps/webapp/src/modules/payments/prepaymentContextFromBooking.ts \
  apps/webapp/src/app-layer/integrator/assertIntegratorGetRequest.ts \
  apps/webapp/src/app/api/integrator/appointments/record/route.ts \
  apps/webapp/src/app/api/integrator/appointments/active-by-user/route.ts \
  apps/webapp/src/modules/patient-booking/ports.ts \
  apps/webapp/scripts/run-a1-rls-conformance.ts \
  docs/ARCHITECTURE/DB_DUMPS/a1-rls/seed.sql \
  docs/ARCHITECTURE/DB_DUMPS/a1-rls/missing-context-denial.sql \
  scripts/verify-a1-rls-conformance.mjs
git ls-tree -r --name-only ff443a4a4 -- apps/webapp/db/drizzle-migrations | rg '/(0182|0183|0184|0199|0215|0251|0254|0256|0258)[^/]*\.sql$'
git grep -n -E 'bookingBranchServices|bookingBranches|bookingServices|bookingSpecialists|patientBookingsRelations|appointmentRecordsRelations|branchesRelations|canonicalAppointmentId|branchServiceId' ff443a4a4 -- apps/webapp/db/schema/schema.ts apps/webapp/db/schema/relations.ts apps/webapp/db/schema/bookingEngine.ts
git grep -n -E 'getByIntegratorBranchId|upsertFromProjection|deps\.branches|branches:' ff443a4a4 -- apps/webapp/src packages
git grep -n -E '\b(bookingBranches|bookingServices|bookingSpecialists|bookingBranchServices)\b' ff443a4a4 -- apps/webapp/src packages ':!**/*.test.*' ':!**/db/schema/**'
```

Live caller и D1/role reality:

```bash
for t in phone_challenges email_challenges user_passkey_credentials user_password_credentials outgoing_delivery_queue integrator_push_outbox operator_incidents user_web_push_subscriptions product_analytics_hourly be_organization_members platform_users; do
  printf '%s ' "$t"
  git grep -l "$t" ff443a4a4 -- 'apps/**/*.ts' 'packages/**/*.ts' ':!**/*.test.ts' ':!**/*.test.tsx' ':!**/db/schema/**' | wc -l
  git grep -l "$t" ff443a4a4 -- 'apps/**/*.ts' 'packages/**/*.ts' ':!**/*.test.ts' ':!**/*.test.tsx' ':!**/db/schema/**' | sed -n '1,8p'
done
git grep -n -E 'writeIdentityAndPreferencesDirect|runDirectPublicWriteWithOrgPrincipal|user\.upsert|notifications\.update' ff443a4a4 -- apps/integrator/src
git show ff443a4a4:deploy/postgres/integrator-login-public-identity-grants.sql
git grep -n -E 'CREATE ROLE app_operational_|ALTER ROLE app_operational_|app_operational_web_push_reminder' ff443a4a4 -- deploy/postgres
git grep -n -E 'CREATE( OR REPLACE)? FUNCTION app\.(current_organization_id|current_org_id)|app\.(current_organization_id|current_org_id)\(' ff443a4a4 -- apps/webapp/db/drizzle-migrations deploy/postgres packages apps/webapp/src
```

A1/TEST harness reality:

```bash
git show ff443a4a4:package.json | rg -n -C 1 'check:saas-a1-rls-conformance'
git show ff443a4a4:apps/webapp/scripts/run-a1-rls-conformance.ts
git show ff443a4a4:scripts/verify-a1-rls-conformance.mjs | rg -n -C 2 'app_runtime|run-a1|seed|missing-context|role|owner'
git grep -n -E 'app_runtime_staff_login|app_runtime_nonstaff_login|app_worker|app_owner|check:saas-a1-rls-conformance' ff443a4a4 -- package.json apps/webapp/package.json deploy scripts apps/webapp/scripts docs/ARCHITECTURE/DB_DUMPS/a1-rls
```

Overlap/board:

```bash
sed -n '1,100p' docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md
sed -n '356,434p' docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md
sed -n '1,140p' docs/_TODO/SAAS_FOUNDATION/TRACK_D1_APPROACH_DECISION_2026-07-24.md
git worktree list --porcelain
git branch --list 'wt/k4-round2' 'wt/d18-raw-sql' 'audit-2-11' 'codex/987-d8-mailing-cleanup' 'wt/*d10*' 'wt/*d1*'
git diff --name-status ff443a4a4..feat/doctor-ui-rebuild -- apps/webapp/src/app-layer/di/buildAppDeps.ts apps/webapp/src/infra/repos/pgBranches.ts apps/webapp/src/modules/integrator/events.ts docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md
```

## Минимальный fix-round

Один docs-only rewrite target-плана, без product/DB/taskdb/checkbox/grant-output изменений:

1. Добавить exact closure table для `10+29+9` строк и human-path/caller ownership; ни одна строка не остаётся «census later».
2. Включить уже живой D1 writer/overlay в S04/S05a, выбрать exact pre-principal seam, запретить второй writer и убрать зависимость от D10.
3. Разложить S02/S04 как capability-expand → caller-adopt → revoke-contract; после раскладки заново доказать необходимость каждого из семи migration files.
4. Заменить quarantine relation/delete на transactional fail-closed abort; canonical и pending booking rows не удалять.
5. Заменить все WAIT на branch/SHA/path/test conditions; S01 и first brief пометить ready now по текущему board/source census.
6. Задать exact operational role/login/function/table oracle для A1 и TEST; generic `app_worker` не принимать.
7. Исправить helper на `app.current_org_id()` и дать per-table policy predicates/owner columns.

После этой правки нужен один повторный docs-only audit тех же семи findings; product implementation до PASS не запускать.

## НЕ ПРОВЕРЕНО

- Runtime row counts, unresolved/ambiguous backfill cardinalities и наличие данных в proposed retirement tables не читались: DB/DEV/TEST запрещены brief-ом.
- Фактические TEST grants, function ACL, `pg_roles`, `pg_auth_members`, FORCE metadata и cross-org DML не исполнялись; никакой owner/dev output не засчитан.
- Exact active TEST integrator/delivery/scheduler/diagnostic/web-push login names не подтверждены runtime introspection; repository role definitions проверены, mapping до login остаётся S07 evidence.
- Внешние/ad-hoc consumers вне repository не доказаны отсутствующими.
- Tariff branch `wt/k4-round2` названа board, но её ref отсутствует в этом clone; same-hunk overlap должен быть опубликован board SHA и проверен непосредственно перед S01 reservation.
- Product migrations S01-S05 ещё не существуют, поэтому их SQL atomicity, re-runnability и actual migration order не проверялись.
- A1/TEST не запускались: этот audit проверяет проект порядка, а не будущий enforcement.
- В рабочем дереве до аудита уже были чужие изменения в env example files; они не читались как target evidence и не менялись.
