# Независимый системный аудит A — 2026-08-17

## Паспорт

- Проверяемый исходный SHA: `a1d4037dbc8c7409d1048548c9a32d9bd9372ed3`.
- Ветка: `wt/systemic-final-audit-a-20260817`.
- Authority: bounded owner brief этого запуска; `AGENTS.md` (§0, §1/§1a/§1b, §4a, §5, §7, §9–§10b, §15–§24); операционные команды — `docs/ORCHESTRATION_BINDINGS.md`.
- Ограничения: без env/DB/DEV/TEST/PROD/deploy/push/provider secrets/history mutations и без dev-server; production fault-injections только временные и обязательно откатываются.
- Стартовый гейт: `git rev-parse HEAD` → `a1d4037dbc8c7409d1048548c9a32d9bd9372ed3`; `git status --short --branch` → только `## wt/systemic-final-audit-a-20260817`.

## Blind kill-set (зафиксирован до чтения acceptance-тестов)

Классификация: повторяемое поведение проверяется через публичный route/service/UI boundary и fault-injection; одноразовые свойства миграционного дерева, grants, CI wiring и security history — взглядом, AST/catalog/security gates. Имена ниже являются oracle этого прохода.

### 1. База и миграции

- `DB-B0-HISTORY-ORACLE` — вернуть в активное дерево historical/A0/disposable executor или journal до B0; gate обязан упасть. Метод: одноразовый AST/catalog gate + обязательная fault-injection.
- `DB-B0-FORWARD-CATALOG` — новая forward migration отсутствует в Drizzle journal/catalog либо relation/function privileges расходятся с B0 grants; catalog/grant gates обязаны упасть. Метод: взгляд + существующие механические gates.
- `DB-PATIENT-RAW-DML` — webapp/integrator выполняет прямой raw DML под `app_patient` в обход Drizzle-порта. Метод: AST/chokepoint gate и callsite inspection.

### 2. Пациентская запись

- `BOOKING-SLOT-END-VISIBILITY` — текущая запись исчезает из будущих после начала slot, но до `slot.end`. Метод: route/service test + обязательная fault-injection.
- `BOOKING-CREATE-MOVE-CANCEL-WIRING` — любой из create/reschedule/cancel UI payload не доходит route → service → repository либо возвращённая запись не обновляет future list. Метод: связность взглядом + targeted route/service/UI tests.
- `BOOKING-VISIBLE-FIELD-PAYLOAD` — UI требует невидимый обязательный идентификатор или теряет выбранный branch/service/specialist. Метод: UI/route test и callsite inspection.

### 3. Действия пациента

- `PATIENT-CHAT-SEND` — отправка сообщения доступна в UI, но route/service не сохраняет его либо теряет conversation/program context. Метод: route/service test + wiring inspection.
- `PATIENT-EXERCISE-COMMENT` — комментарий к конкретному упражнению сохраняется не к тому item/assignment либо не сохраняется. Метод: route/service test.
- `PATIENT-WARMUP-COMPLETION` — разминка открывается, но завершение не создаёт/не отображает completion. Метод: UI/service test.
- `PATIENT-REMINDER-SCHEDULE-SAVE` — изменение расписания уведомлений отвечает успехом, но persisted/read-back state не меняется. Метод: route/service test.

### 4. Упражнения

- `EXERCISE-OPEN-NO-COMPLETE` — простое открытие просмотра создаёт completion или окрашивает точки. Метод: UI/service test.
- `EXERCISE-FIRST-MARK-IMMEDIATE` — первое `Отметить` не создаёт completion сразу, не меняет CTA на `Выполнено` либо не открывает optional quantity/difficulty controls. Метод: UI/service test.
- `EXERCISE-EXTRA-ONLY-SAVE` — `Записать` создаёт второй completion вместо обновления дополнительных данных существующей записи. Метод: service/route test.
- `EXERCISE-CROSS-OWNERSHIP` — completion одного упражнения окрашивает точки другого. Метод: public model/UI test + обязательная fault-injection.
- `EXERCISE-COOLDOWN-MULTI` — после настраиваемого cooldown повторная отметка ошибочно дедуплицируется и не даёт несколько точек за день. Метод: fake-time service/UI test.

### 5. Профиль пациента

- `PATIENT-FIO-ROUNDTRIP` — профиль показывает/сохраняет только given name, теряя фамилию или отчество. Метод: UI/route round-trip test.
- `PATIENT-GREETING-GIVEN-NAME` — приветствие «Сегодня» выводит полное ФИО вместо given name. Метод: UI model test.

### 6. Ratings off-switch и charts

- `RATINGS-OFF-NO-FETCH` — при `material_ratings_enabled=false` скрыты звёзды, но клиент всё равно вызывает `material-ratings` и получает фоновый 403. Метод: UI test + обязательная fault-injection.
- `CHART-NONNEGATIVE-CONTAINER` — chart монтируется до появления положительных width/height и производит warning `-1`. Метод: component test/inspection.

### 7. Global Admin

- `GA-TECHNICAL-PAYLOAD` — корректный Technical modes/DSN payload ложно получает 409 или не round-trip-ится. Метод: route/schema/service tests.
- `GA-SECURITY-NO-WORKSPACE-CONNECT` — Security всё ещё имеет UI либо backend capability «Подключить рабочий кабинет». Метод: UI/route/callsite inspection; одноразовое отсутствие поверхности — взглядом.
- `GA-PASSWORD-LOGIN-PRESERVED` — смена пароля недоступна/не сохраняется либо password login выключен побочным эффектом. Метод: auth route/service tests.
- `GA-INVOICE-PROVENANCE` — manual SaaS invoice даёт безликий 500 либо forged/raw provider code попадает в display/log без trusted transport provenance. Метод: route/service test + обязательная fault-injection forged provenance.
- `GA-THEME-CODE-LABEL` — корректная пара app theme code/label ложно получает 409 или сохраняется перепутанной. Метод: route/schema/service tests.

### 8. Владелец клиники — девять путей

- `CLINIC-LOCATION-CREATE` — owner не может создать локацию из-за auth/payload mismatch. Метод: route/service test.
- `CLINIC-UNLINK-PAST-SETTING` — `allow_unlink_past_appointment_membership` отвечает успехом, но не меняется. Метод: route/service test.
- `CLINIC-BOOKING-POLICY-LEVELS` — cancel/reschedule policy level/settings не представлены либо валидный payload отвергается. Метод: UI/schema/route test.
- `CLINIC-CUSTOM-BOOKING-FIELD` — custom booking form field не создаётся либо теряет organization ownership. Метод: route/service test.
- `CLINIC-COMMS-MEDIA-SETTINGS` — SMS fallback, comments или media settings не round-trip-ятся. Метод: typed parameterized route/service test.
- `CLINIC-DOCTOR-SCREENS-TOGGLE` — toggle оставляет меню в старом состоянии или вызывает 403 console noise. Метод: UI/route test + обязательная representative clinic fault-injection.
- `CLINIC-SLUG-DOMAIN-ERROR` — занятый/некорректный slug превращается в безликий 500/409 без понятного domain code. Метод: route/service test.
- `CLINIC-BILLING-DOMAIN-ERROR` — смена тарифа или invoice failure превращается в безликий 500. Метод: route/service test.
- `CLINIC-CALENDAR-CREATE-PAYLOAD` — календарь не показывает или не передаёт branch/service/specialist и backend требует невидимое поле. Метод: UI→route schema test.

### 9. Security/push visibility

- `SEC-SARIF-RENDER-ALL` — renderer скрывает одну из нескольких SARIF findings в summary или annotations. Метод: tool test + обязательная fault-injection.
- `SEC-PUSH-FAIL-CLOSED` — checked push продолжает успехом при findings, missing SARIF либо renderer failure. Метод: script/tool tests + call graph inspection.
- `SEC-TELEGRAM-NARROW-RULE` — canonical Telegram bot token assignment не находится узким rule либо rule захватывает посторонние значения/раскрывает secret. Метод: redacted fixture test.
- `SEC-HISTORY-ONE-KNOWN` — full-history `--redact` не завершается non-zero ровно с одной non-ignored finding `telegram-bot-token-assignment` в старом config path/commit. Метод: read-only redacted scanner execution; в отчёте только count/rule/path/line/abbrev commit.
- `SEC-IGNORE-NOT-WIDENED` — `.gitleaksignore` маскирует известную находку или расширен под неё. Метод: точный diff/итоговый взгляд.
- `SEC-EXTERNAL-ROTATION-BLOCKER` — repository не содержит provider-side rotation/revocation evidence, но push/deploy объявляется зелёным. Метод: documented evidence inspection; отсутствие evidence остаётся внешним blocker, не repository PASS.

## Инспекция и результаты

Существующие acceptance-тесты были открыты только после фиксации kill-set выше. Второй audit-report не читался и
выводы с другим аудитором не координировались.

### Вердикт

`FAIL`.

`PASS_WITH_EXTERNAL_ROTATION_BLOCKER` неприменим: кроме внешнего blocker по provider-side rotation/revocation
есть два достижимых продуктовых разрыва и два реально красных repository gates.

### MUST FIX findings

1. **Сегодня приветствует фамилией при legacy/missing structured FIO.** Сценарий: у пациента
   `firstName=undefined`, `displayName='Петров Иван Сергеевич'`; `patientGreetingPersonalizedName.ts:10-11`
   передаёт legacy display name в `formatPatientGreetingName`, результат — `Петров`. Impact: страница «Сегодня»
   использует фамилию вместо имени. Нарушено owner requirement 5: «приветствие использует только имя».
   Acceptance evidence:
   `pnpm -C apps/webapp exec vitest run src/modules/patient-home/patientGreetingPersonalizedName.unit.test.ts
   src/app/api/doctor/settings/route.route.test.ts src/app/app/settings/SettingsForm.ui.test.tsx` → exit `1`,
   ровно `3 failed | 2 passed`; greeting oracle получил `"Петров"` вместо `null`.

2. **Clinic-owner не имеет пути сохранения SMS fallback.** UI `SettingsForm.tsx:65-75` отправляет только comments
   и media; `route.ts:13-50` не включает `sms_fallback_enabled` ни в single-key, ни в batch schema и прямо заявляет,
   что clinic route отсутствует. Достижимый PATCH `{key:'sms_fallback_enabled',value:{value:true}}` получает `400`,
   а UI вообще не показывает SMS control. Impact: один из девяти обязательных clinic-owner путей отсутствует.
   Нарушено owner requirement 8: «сохранить SMS fallback/comments/media settings». Та же acceptance-команда выше:
   route `400` вместо `200`, UI не находит `/SMS/i`.

3. **Root lint gate красный на новом безопасном patient capability callsite.** Команда
   `node scripts/check-db-chokepoint.mjs` → exit `1`:
   `apps/webapp/src/app-layer/media/playbackUserVideoFirstResolve.ts (2x layer SQL signal)`. Callsite
   `playbackUserVideoFirstResolve.ts:20-28` вызывает именованный root
   `app.record_current_patient_playback_first_resolve(uuid)`, а не raw DML; значит продуктовая граница B0 здесь
   соблюдена, но включённый в root `pnpm lint` gate не согласован с ней. Impact: candidate не проходит свой
   checked lint/CI путь. Это реальный integration failure, не рекомендация по стилю.

4. **Webapp lint gate красный на новом chart container.** После успешного typecheck команда
   `pnpm -C apps/webapp lint` → exit `1`, одна ошибка:
   `PositiveSizeResponsiveContainer.tsx:36:5 react-hooks/set-state-in-effect` на синхронном `measure()` внутри
   effect. Runtime oracle контейнера зелёный, но candidate всё равно не проходит declared lint gate. Impact:
   checked integration/release не может быть зелёным; owner requirement 6 закрыт функционально, но не интеграционно.

### 1. База и миграции — FAIL из-за repository gate, продуктовая B0-граница зелёная

- `git diff --shortstat 609a19f94..a1d4037db` → `312 files changed, 13904 insertions(+), 68387 deletions(-)`;
  просмотрен весь B0-forward delta, включая удалённые historical/disposable executors и новые `0014…0018`.
- `find apps/webapp/db/drizzle-migrations -maxdepth 1 -type f -name '*.sql' | wc -l` → `19` (`1` B0 +
  `18` forward); аналогичная команда для `apps/integrator/src/infra/db/migrations/core` → `1` B0 + `0` forward.
  Journal: `19` entries, first `0000_b0_baseline`, last `0018_clinic_owner_tariff_branch_quotas`.
- `node scripts/check-b0-migration-baseline.mjs` → OK: B0 roots, `18` webapp/`0` integrator forward, no legacy chain.
- `node --test scripts/check-b0-migration-baseline.audit.test.mjs` → `2/2`: alternate executable wrapper rejected,
  inert prose accepted. Это также fault `DB-B0-HISTORY-ORACLE`.
- `node scripts/check-no-new-raw-sql.mjs` → OK, `production debt: 0`; patient raw DML не найден.
- `node scripts/check-c4-migration-owned-function-bodies.mjs` → OK.
- `node deploy/postgres/privileges/generate-cli.mjs --all --check` → четыре generated privilege/allowlist
  artifacts совпадают побайтно; `--gaps` → `0` gaps в обеих БД; `--census` прошёл production source census.
- `node --test deploy/postgres/privileges/function-census.test.mjs
  deploy/postgres/privileges/migrate-local-parse.test.mjs
  deploy/postgres/privileges/port-context-callsite-catalog.test.mjs
  deploy/postgres/privileges/port-context-catalog.test.mjs
  deploy/postgres/privileges/relation-access.test.mjs` → `69/69`.
- Но `node scripts/check-db-chokepoint.mjs` → exit `1` (finding 3), поэтому пункт целиком не зелёный.

### 2. Пациентская запись — PASS в доступной bounded-среде

- Связность проверена: patient UI/route → `patientBooking` service → `pgPatientBookingsPort`; create,
  reschedule и cancel проходят через canonical service/repository paths. Calendar create отдельно проверен в п. 8.
- `createPatientBookingService.listMyBookings` передаёт один `nowIso` в upcoming/history; production capability
  migration заменяет `row.slot_start >= p_now` на `row.slot_end > p_now` и history predicate на
  `row.slot_end <= p_now` (`0001_patient_booking_runtime_capability.sql:268-276`).
- Добавлен acceptance `pgPatientBookings.patientCapability.unit.test.ts`: public upcoming/history methods вызывают
  точный complementary capability и передают тот же `nowIso`; baseline `2/2`.
- В общем targeted наборе `patient-booking/service.d14`, canonical create и calendar UI/route зелёные.
- Live PostgreSQL не запускался по ограничению brief; одноразовое свойство SQL проверено взглядом и B0/catalog gates.

### 3. Действия пациента — PASS в доступной bounded-среде

- Chat UI POST → `/api/patient/messages` → `deps.messaging.patient.sendText`; targeted
  `patientMessagingService.unit.test.ts` зелёный. Patient-origin staff delivery проверена отдельным acceptance для
  message и program note.
- Exercise comment POST разрешает только exact doctor-assigned instance/item и вызывает
  `patientAppendObservationNote({instanceId,stageItemId:itemId})`; PG port использует named patient capability.
- Warmup content CTA сначала POST-ит `/api/patient/practice/completion` с `source=daily_warmup`, получает id и
  сохраняет optional feeling отдельным PATCH; route записывает completion и двигает presentation только после
  успешной записи.
- Reminder UI action валидирует schedule, проходит warmup entitlement guard и вызывает
  `deps.reminders.updateRule`; mechanic-write service tests зелёные.

### 4. Упражнения — PASS

- Inspection: открытие вызывает только touch/view; completion не создаётся. Первое `Отметить` POST-ит сразу,
  сохраняет exact item completion, меняет CTA и открывает optional metrics. `Записать` PATCH-ит exact
  `completionId`, второго done insert нет.
- Cooldown ограничен `5…180` и применяется к exact `instance_stage_item_id`; после окна новая строка допустима;
  display dots строятся по `doneTodayCountByItemId` конкретного упражнения и допускают несколько точек.
- Targeted `progress-service.completion`, `postProgramItemComplete`, `programItemExecutionDisplay` зелёные.

### 5. Профиль пациента — FAIL

- Full FIO path зелёный по связности: profile hero показывает surname/name/patronymic, PATCH
  `/api/patient/profile/fio` и PG named capability сохраняют structured FIO.
- Greeting path нарушен — finding 1 и красный owner acceptance.

### 6. Ratings off-switch и charts — FAIL из-за lint gate

- `PatientLayout` передаёт `material_ratings_enabled` в runtime provider; patient wrapper возвращает `null` до
  mount enabled-компонента. Поэтому при `false` нет ни stars, ни effect/fetch. Два rating UI tests зелёные.
- `PositiveSizeResponsiveContainer` монтирует Recharts только при width/height `>0`; component test зелёный и
  проверяет zero/positive resize.
- Runtime behavior зелёное, но webapp lint реально падает — finding 4.

### 7. Global Admin — PASS

- Technical modes atomic batch и DSN route принимают корректные payload/readback без ложного 409; targeted admin
  settings/platform error-tracking tests зелёные.
- Platform Security не рендерит specialist first-run UI; backend bind-specialist route возвращает platform admin
  `403`; смена пароля и password login покрыты route/service tests.
- Manual invoice все ошибки маппит в domain response, raw detail не отдаёт; только DB boundary или typed provider
  transport/timeout получает trusted provenance. Forged-code fault убит.
- Owner wording «theme code/label» сопоставлено с активным `notifications_topics` (`id`/`title`): Unicode round-trip
  зелёный, duplicate id получает `400`, не ложный `409`. Literal `app_theme` entity не найден: проверены
  `code-search "app theme code label settings save 409"`, exact `rg` по webapp/db/owner docs и back-references
  system-settings registry/admin route; отдельного достижимого сценария/finding из этого не выведено.

### 8. Владелец клиники — FAIL

1. Локация: exact organization + entitlement + quota domain response; route tests зелёные.
2. `booking_allow_doctor_unlink_past_package_sessions`: boolean write/readback exact org; tests зелёные.
3. Cancellation/reschedule policies: уровни organization/specialist/service представлены, default organization
   draft доступен; policy route/model tests зелёные.
4. Custom booking field: exact organization create route и schema; tests зелёные.
5. Comments/media сохраняются atomic batch; **SMS отсутствует** — finding 2.
6. Doctor screens toggle использует organization-management guard, exact membership и сразу синхронизирует shell;
   UI/service polling tests зелёные, 403-noise path не найден.
7. Slug: conflict → понятный `slug_unavailable`/409, infra failure redacted; tests зелёные.
8. Billing/tariff/invoice: domain 409/502/503 вместо безликого 500; route suite зелёный.
9. Calendar create UI требует видимые branch/service/specialist, передаёт все три в manual route; UI/route tests
   зелёные.

### 9. Security/push visibility — repository PASS, внешний blocker остаётся

- `.github/workflows/security.yml` запускает full history с `--redact`, always-render и always-upload; checked push
  завершает non-zero на red Actions. `node --test scripts/checked-push-security.test.mjs` → `2/2` после отката,
  fixture с двумя findings доказывает обе summary rows и annotations.
- Собственный synthetic dir scan (значение не печаталось): `GITLEAKS_SELFTEST_EXIT=1`,
  `GITLEAKS_SELFTEST_FINDINGS=1`, rule `telegram-bot-token-assignment`.
- Собственный full-history scan:
  `gitleaks git . --no-banner --redact --config .gitleaks.toml --gitleaks-ignore-path .gitleaksignore
  --report-format sarif --report-path <temp>` → exit `1`, findings `1`; metadata only:
  `telegram-bot-token-assignment`, `src/integrations/telegram/config.ts:12`, commit `03eca9c8bb02`.
- `git diff --quiet 609a19f94..a1d4037db -- .gitleaksignore` → exit `0`; `wc -l .gitleaksignore` → `49`;
  ignore не расширен candidate-дельтой.
- `docs/_TODO/INFRASTRUCTURE_SECURITY_PLAN.md` оставляет `IS-I5-01A` unchecked: provider-side
  rotation/revocation date/link evidence отсутствует и fingerprint baseline доказательством не считается. Это
  реальный внешний blocker push/deploy, независимо от общего `FAIL`.

## Fault-injection ledger

| Класс | Временная поломка | Oracle / результат |
| --- | --- | --- |
| B0/history executor | alternate executable SQL wrapper | `check-b0-migration-baseline.audit.test.mjs`: mutation rejected, `2/2` |
| appointment premature disappearance | upcoming adapter направлен в history capability | `pgPatientBookings.patientCapability.unit.test.ts`: exit `1`; после отката `2/2` |
| cross-exercise completion | done event получил `instanceId` вместо exact item id | `progress-service.completion.unit.test.ts`: exit `1`, `1 failed / 2 passed` |
| rating fetch under off-switch | early off-switch return отключён | `MaterialRatingBlock.ui.test.tsx`: exit `1`, `1/1` failed |
| clinic authorization/payload | branch write получил чужой constant organization id | branch route test: exit `1` |
| forged invoice provenance | provider boundary начал доверять произвольному `error.code` | manual invoice route: exit `1`, `2 failed / 17 passed` |
| renderer hides finding | renderer ограничен `findings.slice(0,1)` | checked-push security: exit `1`, `1 failed / 1 passed` |

Итого точной командной серией: **`7 killed / 0 unhandled`**. После отката всех production mutations единая
контрольная команда дала Node **`4/4`** и Vitest **`28/28`**.

## Сводная validation

- Broad targeted behavior command: **`33 files / 160 tests passed`** до добавления owner acceptance-oracles.
- Privilege/catalog tests: **`69/69 passed`**.
- Fault-revert control: Node **`4/4`**, Vitest **`28/28`**.
- Owner acceptance: **`3 failed / 2 passed`** — два продуктовых finding выше.
- `pnpm -C apps/webapp typecheck`: PASS после подключения временного dependency tree.
- `pnpm -C apps/webapp lint`: FAIL, одна chart-container ошибка (finding 4).
- `node scripts/check-db-chokepoint.mjs`: FAIL, один новый named-root callsite (finding 3).
- Repo-wide full CI не повторялся: два входящих в него lint gate уже детерминированно красные; live DB/browser/
  provider verification запрещены brief и остаются непокрытым runtime risk, но не источник дополнительных findings.

## Допустимый итоговый diff

Только полезные acceptance tests и этот audit artifact:

- `apps/webapp/src/infra/repos/pgPatientBookings.patientCapability.unit.test.ts` — зелёный exact capability selector.
- `apps/webapp/src/modules/patient-home/patientGreetingPersonalizedName.unit.test.ts` — красный owner oracle.
- `apps/webapp/src/app/api/doctor/settings/route.route.test.ts` — красный clinic SMS route oracle.
- `apps/webapp/src/app/app/settings/SettingsForm.ui.test.tsx` — красный clinic SMS UI oracle.
- `runs/orchestration/systemic-final-independent-audit-a-20260817.md` — этот отчёт.

Временных production edits после fault-injection нет. Dependency symlinks использовались только как ignored test
plumbing и удалены до commit. Проверяемый product SHA остаётся
`a1d4037dbc8c7409d1048548c9a32d9bd9372ed3`; commit subject audit-результата:
`test(audit): fail B0-forward candidate on owner acceptance`.
