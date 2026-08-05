---
name: doctor-loading-closure
overview: Закрыть все подтверждённые дефекты doctor-loading-аудита на одном каноническом плане, сначала зафиксировать acceptance-oracle, затем исправить продукт, пройти свежий CI/security/TEST acceptance и закрыть требования только доказательствами на связанных SHA.
todos:
  - id: authority-baseline
    content: Сделать closure-план единственным execution authority, перенести его в репозиторий и снять воспроизводимый pre-remediation baseline
    status: pending
  - id: acceptance-first
    content: До продуктовых fixes провести blind auditor-live и зафиксировать acceptance-oracle для identity, schedule и patient-card
    status: pending
  - id: identity-boundary
    content: Закрыть cross-account channel-anchor запись fail-closed инвариантом и точным кодом отказа
    status: pending
  - id: schedule-runtime
    content: Устранить duplicate bootstrap, пустой scope и stale-response races расписания
    status: pending
  - id: patient-card-runtime
    content: Исправить messages continuation, patient-IANA calendar и progressive patient-card stream с изоляцией widget failures
    status: pending
  - id: test-integrity
    content: Убрать ложные тесты, подключить db-principal tests к CI и закрыть все три Gitleaks findings
    status: pending
  - id: integration-gates
    content: Интегрировать непересекающиеся ветки по одной, пройти phase gates и свежий full CI на executable SHA
    status: pending
  - id: test-runtime
    content: Задеплоить ровно CI/security-green executable SHA на TEST и пройти health, wake, role/browser/error acceptance
    status: pending
  - id: metrics-closeout
    content: Снять сопоставимые p50/p95/request/bundle, профилировать только повторно провалившиеся маршруты и закрыть evidence commit
    status: pending
isProject: false
---

# Полное закрытие doctor-loading и audit findings

## 0. Authority, границы и источник правды

- **Этот closure-план — единственный execution authority для открытой части workstream.** Старый
  [`doctor-loading-performance_e024544d.plan.md`](/home/dev/.cursor/plans/doctor-loading-performance_e024544d.plan.md)
  остаётся источником исходных требований и evidence завершённых Stage 0–3, но не вторым активным чек-листом.
- Owner authority: команда 2026-08-05 «закрыть всё» и подтверждённые findings из
  [Doctor-loading audit transcript](bf710216-f40d-4f8f-a0b9-4cc69ea69861). Identity oracle дополнительно закреплён в
  [`D20_LEVEL1_TESTS_REPORT.md`](docs/_TODO/runs/integrator-cleanup/D20_LEVEL1_TESTS_REPORT.md#две-находки-которые-тесты-сделали-по-дороге-я-закрепил-факт-и-вынес-расхождение-сюда).
- Repo rules: `AGENTS.md` §5, §9–§12, §16–§17, §21–§22, §24. Host/TEST authority:
  [`SERVER CONVENTIONS.md`](docs/ARCHITECTURE/SERVER%20CONVENTIONS.md) и
  [`HOST_DEPLOY_README.md`](deploy/HOST_DEPLOY_README.md#тест-деплой-на-151x-feat--test).
- Модульные контракты перед правкой: `ARCHITECTURE.md`,
  [`db.md`](apps/integrator/src/infra/db/db.md),
  [`doctor.md`](apps/webapp/src/app/app/doctor/doctor.md),
  [`schedule.md`](apps/webapp/src/app/app/doctor/schedule/schedule.md) и
  [`api.md`](apps/webapp/src/app/api/api.md).
- `taskdb find bcb "doctor loading"` на 2026-08-05 вернул 0. Owner попросил план, но не постановку workstream в
  taskdb: карточку не создавать без отдельного owner-go.
- Не создавать ещё один plan/LOG. Новые внешние находки только назвать; scope расширяется лишь новым owner requirement
  или обязательным repo-rule.

### Обязательная нормализация authority до кода

- [ ] **DL-AUTH-01** Перенести **этот исходный файл**, а не копию/stub, в репозиторий
  `.cursor/plans/doctor-loading-closure_9a07581d.plan.md`; дальнейшие галочки и evidence менять только там.
- [ ] **DL-AUTH-02** В старом plan поставить forward-link: открытая часть заменена этим closure-планом; его
  `patient-card-progressive: completed` пометить `УСТАРЕЛО/ЗАМЕНЕНО` из-за DL-MSG/DL-TZ/DL-STREAM.
  `route-rollout` не переоткрывать целиком: завершённые Stage 2/3 оставить evidence, дефекты расписания вести
  атомарными DL-SCH. `db-profile` и `test-rollout` оставить pending.
- [ ] **DL-AUTH-03** В том же commit добавить в этот план устойчивую ссылку на audit transcript и проверить, что
  нет второго активного doctor-loading checklist. Frontmatter todo остаётся `pending`, пока открыт хоть один его
  body-checkbox.

## Текущее подтверждённое состояние до remediation

- `origin/feat/doctor-ui-rebuild` = `58b8a390a`; TEST успешно развёрнут на `33f9b2b82`, все сервисы подняты. Это pre-remediation baseline, а не финальный acceptance SHA.
- Wake runtime подтверждён: `digest-wake` → `200`; `materialize-wake` → validation `400`; после restart нет прежних `500/403`.
- Post-rollout p95 уже записан в `DOCTOR_LOADING_BASELINE.md` §6: patient-card −65%, communications −68%, treatment templates −57%; schedule +29%, LFK templates +18%. Полный список предварительно провалившихся маршрутов приведён в DL-BASE ниже.
- Предыдущий full CI зелёный только на `101ad229b`; он не покрывает `33f9b2b82`, `58b8a390a` и будущие fixes. После remediation обязателен новый полный gate и новый TEST deploy; текущие runtime/metric evidence переиспользовать как финальные нельзя.
- GitHub Security на `58b8a390a` красный только по Gitleaks: exact workflow run
  `31023368718`, три findings. Semgrep/Trivy/dependency audit зелёные.
- Предыдущий p95 получен всего по трём samples и недостаточен для решения о DB bottleneck. До следующего TEST deploy
  нужен воспроизводимый baseline с тем же методом и достаточным числом samples.

## 1. Baseline freeze до следующего deploy

- [ ] **DL-BASE-01** На текущем TEST runtime SHA `33f9b2b82` до следующего deploy снять для каждого сравнимого
  маршрута один cold document и не менее 30 последовательных authenticated warm samples; записать команду,
  fixture user/patient, UTC-время окна, p50/p95 `upstream_response_time` и метод nearest-rank в
  [`DOCTOR_LOADING_BASELINE.md`](docs/_TODO/DOCTOR_LOADING_BASELINE.md).
- [ ] **DL-BASE-02** На том же runtime снять браузерный request inventory: `/patients` не делает detail RSC до
  intent/click; active patient tab не делает hidden-tab/ensure requests; schedule с SSR bootstrap не должен
  повторять settings/feed/KPI — последний пункт сейчас ожидаемо FAIL и остаётся красным oracle.
- [ ] **DL-BASE-03** На том же deployed `.next` снять route chunk bytes для patient-card и остальных измеряемых
  маршрутов. `/content` не получает процентный p95 gate, потому что исходный baseline был 404.

Сравнимый p95-набор: `/app/doctor`, patient-card, communications, schedule, treatment-program templates,
LFK templates, recommendations. `/patients` проверяется по unsolicited requests и отсутствию p95-регрессии.
По текущим трёхточечным данным предварительно не прошли −40% **doctor home, schedule, LFK templates и
recommendations**, а не только schedule/LFK; решение о DB profile принимается только после DL-BASE-01.

## 2. Acceptance-first, затем fixes

До чтения/правки новых тестов первый `auditor-live` составляет blind kill-set по authority. Он может оставить
только acceptance-тесты/audit-artifact; production mutations откатывает. Worker затем чинит продукт и доводит
тот же набор до зелёного. Повторный blind audit той же поверхности не нужен.

- [ ] **DL-AUD-IDENTITY** До identity-fix: чужой channel anchor с `integrator_user_id=B`, входящий канонический
  ID=A, без by-integrator/by-phone совпадений → точный fail-closed error и ноль изменений
  platform user/binding/topics.
- [ ] **DL-AUD-SCHEDULE** До schedule-fix: SSR seed не вызывает initial requests; scope change вызывает немедленный
  новый load; поздняя старая generation не меняет feed/KPI/error/loading.
- [ ] **DL-AUD-PATIENT** До patient-card-fix: non-overview deep-link → первый overview получает read-only
  messages/empty без ensure; continuation latest-only и только при активном overview; patient-IANA определяет
  default month, UTC window и local bucket; отказ одного overview port не убирает header и успешные widgets.
- [ ] **DL-AUD-INSPECTION** Progressive stream, source/SQL assertion cleanup, Gitleaks и deploy проверять
  stream/runtime/SARIF/инспекцией, не тестами текста и не fault injection формы исходника.

## 3. Workstream A — cross-account identity boundary

Scope: shared identity chokepoint + integrator mapping/test; новых портов, таблиц и миграций нет.

- [ ] **DL-ID-01** В
  [`identityProjectionWrite.ts`](packages/platform-merge/src/identityProjectionWrite.ts)
  channel lookup возвращает `user_id` и существующий `integrator_user_id`. Если by-integrator и by-phone пусты,
  а единственный by-channel candidate имеет non-null ID, отличный от входящего, бросать shared
  `MergeConflictError` с однозначным reason `channel_anchor_owned_by_other_user` и candidate ID **до**
  collapse/enrich/binding/topics.
- [ ] **DL-ID-02** В
  [`writeIdentityAndPreferencesDirect.ts`](apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts)
  маппить только этот reason в новый `DirectPublicWriteFailureCode =
  channel_anchor_owned_by_other_user`; остальные merge conflicts сохраняют прежнюю семантику.
- [ ] **DL-ID-03** Добавить новый code в fail-closed predicates
  [`isIdentityMergeAmbiguityError`](apps/integrator/src/infra/db/directPublic/mergeCandidatesDirect.ts) и
  [`isDirectPublicActorResolutionFailClosedError`](apps/integrator/src/infra/db/directPublic/resolveDirectPublicActor.ts).
- [ ] **DL-ID-04** Исправить false-green
  [`messengerPhoneLink.identity.test.ts`](apps/integrator/src/infra/db/messengerPhoneLink.identity.test.ts):
  убрать текст «fix не сделан», проверить exact code, `candidateIds=['pu-b']`, неизменные platform row,
  binding и topics. Общая DB/mocking ошибка не считается PASS.

Gate: targeted integrator test → `pnpm --dir packages/platform-merge run build` →
`pnpm --dir apps/integrator typecheck` → integrator phase test только после завершения workstream.

## 4. Workstream B — schedule bootstrap и races

- [ ] **DL-SCH-01** В
  [`ScheduleCalendarTab.tsx`](apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx)
  `settingsSeededRef` и `skipInitialClientLoadRef` однократно поглощают SSR settings/feed/KPI; bootstrap mount
  делает 0 повторных requests.
- [ ] **DL-SCH-02** Один стабильный load-key содержит
  `scope + specialistId + view + anchorDate + branchId + serviceId`. `changeScheduleScope` меняет state и очищает
  stale view; effect немедленно вызывает load нового key.
- [ ] **DL-SCH-03** Feed и KPI используют один monotonic generation counter. Только текущая generation меняет
  `data`, `kpis`, `error`, `kpisLoading`; poll, visibility и manual refresh вызывают тот же `load()`.
- [ ] **DL-SCH-04** Расширить существующий
  [`ScheduleCalendarTab.ui.test.tsx`](apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.ui.test.tsx)
  тремя oracle из DL-AUD-SCHEDULE; не проверять внутренний порядок вызовов.

Gate: targeted UI test + `pnpm --dir apps/webapp typecheck` + webapp lint; phase webapp tests после landing.

## 5. Workstream C — patient-card messages, timezone и stream

Эти пункты не параллелить между собой: они пересекаются в `PatientTabOverview`, bootstrap types и page wiring.

### Messages snapshot и continuation

- [ ] **DL-MSG-01** Добавить read-only
  `GET /api/doctor/patients/[userId]/messages-snapshot`: `requireDoctorWorkspaceApiContext` →
  `getClientIdentityForOrganization` → существующий
  [`loadDoctorPatientMessagesSnapshot`](apps/webapp/src/app/app/doctor/patients/loadDoctorPatientMessagesSnapshot.ts).
  Route не вызывает `conversations/ensure`; зарегистрировать endpoint в [`api.md`](apps/webapp/src/app/api/api.md).
- [ ] **DL-MSG-02** `PatientCardClient` передаёт в overview `active={activeTab === 'overview'}`.
  При null SSR seed overview немедленно читает snapshot endpoint; valid empty = `ok`, network/non-2xx = `error`.
- [ ] **DL-MSG-03** Continuation использует существующий
  [`useMessagePolling`](apps/webapp/src/modules/messaging/hooks/useMessagePolling.ts), расширенный опцией
  `immediate` с default `true`: SSR-seeded overview запускает первый poll только после интервала, null-seed сначала
  делает один initial read; poll включён только для active overview и visible document. Generation guard применяет
  только последний response.
- [ ] **DL-MSG-04** Один focused UI/route acceptance доказывает deep-link → overview, empty vs error,
  отсутствие ensure и stale-response protection; не дублировать тот же сценарий на лишних слоях.

### Patient-IANA calendar contract

- [ ] **DL-TZ-01** Заменить массив дней на единый snapshot `{ iana, from, to, days }` в
  [`loadDoctorPatientExerciseCalendar.ts`](apps/webapp/src/app/app/doctor/patients/loadDoctorPatientExerciseCalendar.ts).
  Сначала разрешить patient IANA; default month вычислять через Luxon в этой зоне; local `from/to` переводить в
  UTC instants для timestamp ports.
- [ ] **DL-TZ-02** `lfk_sessions` и `patient_practice_completions` бакетировать через
  `DateTime.fromISO(completedAt, { setZone: true }).setZone(iana).toISODate()`, а program local dates получать в
  той же IANA. Не использовать `slice(0,10)` для UTC timestamp.
- [ ] **DL-TZ-03** Exercise-calendar API возвращает resolved snapshot; overview инициализирует `calYear/calMonth`
  из `snapshot.from`, а не browser/Node timezone, и сравнивает seed по snapshot range.
- [ ] **DL-TZ-04** Новый узкий unit с fake timers доказывает UTC↔`Asia/Vladivostok` month boundary и completion,
  у которого patient-local date отличается от UTC date.

### Настоящий progressive patient card

- [ ] **DL-STREAM-01** Разделить
  [`loadDoctorPatientCardPageBootstrap.ts`](apps/webapp/src/app/app/doctor/patients/loadDoctorPatientCardPageBootstrap.ts)
  на `loadDoctorPatientCardShellMeta` (header + entitlement/meta) и
  `loadDoctorPatientCardTabBootstrap` (данные только initial active tab, без повторного header/meta).
- [ ] **DL-STREAM-02** В
  [`page.tsx`](apps/webapp/src/app/app/doctor/patients/[userId]/page.tsx)
  начать tab promise на сервере, await только workspace/identity/shell meta и передать promise в client boundary.
  Header/tab strip не зависят от tab promise.
- [ ] **DL-STREAM-03** В
  [`PatientCardClient.tsx`](apps/webapp/src/app/app/doctor/patients/[userId]/PatientCardClient.tsx)
  оставить active/visited state и header/tabs вне Suspense; вложенный panels-компонент вызывает `use(tabPromise)`
  под существующим `PatientTabPanelLoading`. Inactive tabs не загружаются; visited tabs не размонтируются.
- [ ] **DL-STREAM-04** Overview reads возвращают независимые `ok|error` envelopes (settled, не fail-all
  `Promise.all`): отказ messages/calendar/другого widget не отклоняет всю tab boundary и не скрывает успешные
  widgets. Не добавлять production fault-toggle.
- [ ] **DL-STREAM-05** Runtime stream inspection доказывает порядок bytes: doctor shell/header/tabs приходят до
  active-tab payload; deep-link SSR содержит данные своего tab; 0 hidden-tab requests; switch-away/back сохраняет
  draft/visited state.

Gate: targeted route/UI/unit tests + webapp typecheck/lint. Импорт `page.tsx` в тест запрещён; stream проверяется
runtime/инспекцией.

## 6. Workstream D — test integrity, CI visibility, Gitleaks

- [ ] **DL-TEST-01** Удалить только source-shape assertion
  `INTEGRATOR_HMAC_CSRF_EXEMPT_PATHS.toContain` из
  [`csrfOrigin.test.ts`](apps/webapp/src/middleware/csrfOrigin.test.ts); behavioral middleware assertions оставить.
- [ ] **DL-TEST-02** Удалить `findIndex`/SQL-order assertions из
  [`messengerPhonePublicBind0380.unit.test.ts`](apps/integrator/src/infra/db/messengerPhonePublicBind0380.unit.test.ts);
  observable platform/userContacts state уже является oracle.
- [ ] **DL-TEST-03** Root `package.json`: добавить
  `test:db-principal = pnpm --dir packages/db-principal test`; вставить его после integrator tests в `ci` и во все
  более ранние `ci:resume:*`; добавить `ci:resume:after-test-db-principal`. Существующий package script уже
  выполняет build + type-tests + `node --test test/*.test.mjs` — его не переписывать.
- [ ] **DL-TEST-04** `.github/workflows/ci.yml`: отдельный `Test (db-principal)` job вызывает root alias ровно один
  раз; не дублировать в PostgreSQL job. Core workflow на `feat/**` не запускается, поэтому текущий proof =
  локальный root CI + инспекция job; GitHub execution наступит на PR/main, не создавать PR только ради этого плана.
- [ ] **DL-SEC-01** Исправить все три current credential-shaped literals на детерминированные non-secret values,
  которые Gitleaks не классифицирует: db-principal signer, reminder callback disposable signing secret,
  payment idempotency key.
- [ ] **DL-SEC-02** Поскольку Security сканирует **полную историю**, HEAD-правки не гасят уже pushed commits.
  Добавить в `.gitleaksignore` только три exact historical fingerprints с датированным комментарием, без path/rule
  blanket allowlist:
  - `f7db88013ad8e342e192959ef50cabe679c0acff:packages/db-principal/test/webapp-locked-infra-cron.test.mjs:generic-api-key:48`
  - `35fba2479d52143eb7f15daa3f7a5dbe905b825f:apps/webapp/src/infra/repos/reminderCallbackCapabilities.postgres.integration.test.ts:generic-api-key:110`
  - `928fe9ceeb6e307f20e83e8efbd3518a71ec6502:apps/webapp/src/infra/payments/paymentProviderIdentity.unit.test.ts:generic-api-key:26`
- [ ] **DL-SEC-03** Exact local command from workflow
  `gitleaks git . --no-banner --redact --config .gitleaks.toml --gitleaks-ignore-path .gitleaksignore`
  возвращает 0; после push Security run на том же executable SHA зелёный по Gitleaks, self-test, Semgrep, Trivy,
  dependency audit.

## 7. Оркестрация и landing

- [ ] **DL-ORCH-01** Максимум три stateful workstream одновременно, только непересекающиеся:
  A identity, B schedule, C patient-card. D test/CI запускается после acceptance-tests identity либо с явным
  непересекающимся scope. Каждый — `wt/<workstream>`, через `tools/orch-launch.sh`; worker не пушит.
- [ ] **DL-ORCH-02** Для A/B/C порядок строго `auditor-live → acceptance handoff → worker green`.
  Lead принимает test+fix diff и SHA; повторный blind audit не запускает. Source cleanup/Gitleaks принимает
  инспекцией и exact scanner output.
- [ ] **DL-ORCH-03** Landing только по одному: diff/evidence → targeted gate → `tools/orch-launch.sh land`.
  После каждого landing запускать только затронутый phase gate; full CI между микрошагами запрещён.
- [ ] **DL-ORCH-04** После последнего executable landing зафиксировать **EXEC_SHA**. Через host lock выполнить
  `/home/dev/brain/host-orch/run-tests.sh "pnpm install --frozen-lockfile && pnpm run ci"`.
  Если это port-agent, long run запускается detached по `AGENTS.md` §24.2 с именованным log/exit sentinel, а
  результат читает отдельный короткий verifier. PASS = exit 0 на exact EXEC_SHA.
- [ ] **DL-ORCH-05** Push EXEC_SHA в `origin/feat/doctor-ui-rebuild` запускает Security workflow; TEST deploy
  запрещён до зелёного Security run exact EXEC_SHA. Изменение code/SQL/config/workflow после gate создаёт новый
  EXEC_SHA и инвалидирует CI/security.

## 8. TEST deploy и runtime acceptance

- [ ] **DL-TESTDEPLOY-01** На host `151.241.228.122`, не PROD, выполнить code-only
  `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild` строго для EXEC_SHA. Long deploy через port-agent —
  detached + named log + отдельный verifier по §24.2; fresh reset и `deploy-test-saas.sh` напрямую запрещены.
- [ ] **DL-TESTDEPLOY-02** PASS deploy: exit 0; `/api/version` = EXEC_SHA; `/api/health` даёт
  `{ok:true,db:"up"}`; `bersoncarebot-{api,worker,scheduler,webapp,media-worker}-test` active.
- [ ] **DL-WAKE-01** Signed loopback: digest `200`; materialize не `403` (validation `400` допустим);
  post-restart nginx window не содержит прежних wake `500/403`.
- [ ] **DL-RUNTIME-01** Chromium: cold document + warm RSC navigation; doctor, clinic owner/admin и
  blocked/read-only entitlement; 1/10/100+ client fixtures. Проверить messages continuation, schedule scope/race,
  patient-card stream и 0 unsolicited/duplicate initial requests.
- [ ] **DL-RUNTIME-02** Safe failure proof: использовать acceptance envelope/rejected test dependency и stream
  inspection; не ломать живой TEST backend и не добавлять production fault flag. Header и успешные widgets
  остаются доступны при одном failed widget.
- [ ] **DL-RUNTIME-03** Настоящий Safari остаётся отдельным hardware gate исходного плана. Эмуляция Chromium его
  не заменяет; без внешнего Safari evidence пункт и весь `test-rollout` остаются BLOCKED, а не ложно completed.

Успешный pre-remediation deploy `33f9b2b82` и wake evidence — только baseline, не evidence для EXEC_SHA.

## 9. Метрики, DB profile и closeout

- [ ] **DL-METRIC-01** После deploy EXEC_SHA повторить **точно DL-BASE-01/02/03**: тот же TEST fixture, route set,
  ≥30 warm samples, request capture и chunk-byte method. Не сравнивать новый n=30 p95 со старым n=3 как
  равнозначные выборки.
- [ ] **DL-METRIC-02** Бинарные gates: 0 unsolicited detail-prefetch; 0 duplicate initial fetch после SSR seed;
  p95 −40% для server-bootstrap route set; patient-card bundle −30%; `/patients`, остальные route bundles и
  request count без регрессии. Для stream дополнительно фиксировать TTFB/click→fallback/click→content, потому что
  nginx upstream total не доказывает раннюю выдачу shell.
- [ ] **DL-DB-01** DB profile получают только маршруты, которые повторно не прошли p95 gate. Сначала снять query
  count и сопоставить port с route; затем `EXPLAIN (ANALYZE, BUFFERS)` выполнять через канонический TEST env/app
  principal flow из `SERVER CONVENTIONS.md`/§6 `AGENTS.md`, никогда голым `psql "$DATABASE_URL"` и не под
  principal-less RLS.
- [ ] **DL-DB-02** Если профиль не показывает DB bottleneck — закрыть пункт самим evidence и не менять БД. Если
  показывает — lead сначала добавляет в **этот** план отдельный атомарный checkbox с exact Drizzle port, observed
  plan/rows/buffers и одним выбранным fix; worker не придумывает оптимизацию. Новый hot-column index идёт в том же
  PR по migration numbering/index rules.
- [ ] **DL-CLOSE-01** Обновить
  [`DOCTOR_LOADING_BASELINE.md`](docs/_TODO/DOCTOR_LOADING_BASELINE.md),
  [`DOCTOR_LOADING_FETCH_INVENTORY.md`](docs/_TODO/DOCTOR_LOADING_FETCH_INVENTORY.md) и repo-путь этого plan одним
  **docs-only EVIDENCE_SHA** поверх EXEC_SHA. Каждая закрытая строка содержит подходящее evidence: code SHA,
  red→green acceptance, runtime command/window или metric.
- [ ] **DL-CLOSE-02** Docs-only EVIDENCE_SHA не инвалидирует executable CI/runtime evidence, но Security после его
  push обязан быть green. Любая executable правка после EXEC_SHA требует новый full CI, Security и TEST deploy.
- [ ] **DL-CLOSE-03** Только после всех строк, включая Safari и DB decision, поставить `db-profile`/`test-rollout`
  и frontmatter todos `completed`. Push только `origin/feat/doctor-ui-rebuild`; PROD не трогать.