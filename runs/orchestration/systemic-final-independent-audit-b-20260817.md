# Независимый системный аудит B — final B0-forward candidate

- Candidate: `a1d4037dbc8c7409d1048548c9a32d9bd9372ed3`
- Ветка: `wt/systemic-final-audit-b-20260817`
- Дата: 2026-08-17
- Authority: self-contained owner scope из launcher brief; правила проверки — `AGENTS.md` §9–§10b и §24.
- Ограничения соблюдены: материалы/лог/ветка аудитора A не читались; DEV/TEST/PROD, env, DB, deploy, provider и push не затрагиваются; server не запускается.

## Blind kill-set

Этот список зафиксирован до чтения существующих тестов и до их запуска. Oracle — только owner scope из brief.

| ID | Инъецируемая поломка | Наблюдаемое последствие / требование |
|---|---|---|
| K01 | Preview упражнения вызывает write completion | Просмотр ошибочно завершает упражнение (scope 4). |
| K02 | Completion требует reps/difficulty либо сохраняет их тем же действием | Без optional metrics нельзя завершить; отдельное сохранение метрик исчезает (scope 4). |
| K03 | Completion перезаписывает прошлую отметку, игнорирует cooldown или красит чужие точки | Несколько допустимых выполнений и точная привязка к упражнению нарушены (scope 4). |
| K04 | Future/history фильтруют запись не по фактическому `slotStart`/`slotEnd`, либо create/reschedule/cancel теряют единый контракт | Запись исчезает до конца слота или неверно переносится между future/history (scope 2). |
| K05 | Patient message write принудительно идёт через staff/global/wrong principal | Сообщение пациента теряется/получает неверную авторизацию либо обходит patient-role boundary (scope 3). |
| K06 | Chat/comment/warmup/settings оставляют optimistic success при backend failure; чужой principal проходит write | Пациент видит сохранённое действие, которого нет, либо пишет не в свой объект (scope 3). |
| K07 | Ratings off-switch скрывает stars, но оставляет fetch; chart получает `-1×-1` | Получаем запрещённый запрос/403 или invalid chart measurement (scope 6). |
| K08 | Profile round-trip теряет часть ФИО либо Today использует не только first name | Профиль и приветствие расходятся с единым identity contract (scope 5). |
| K09 | Technical modes/DSN/theme не сохраняются, backend рабочего кабинета остаётся достижим, password change запрещён password-login admin; non-admin проходит | Global Admin теряет настройки/доступ или получает запрещённую поверхность (scope 7). |
| K10 | Произвольный domain error подделывает SQLSTATE/provider code/message и попадает в invoice mapping | Manual invoice ошибочно считается trusted transport/provider failure (scope 7). |
| K11 | Clinic owner теряет permission на branch create или payload теряет branch field; outsider создаёт branch | Нельзя создать реальный филиал либо нарушена tenant authorization (scope 8). |
| K12 | Unlink past membership не передаёт/не применяет historical flag | Нельзя корректно отвязать прошлое членство (scope 8). |
| K13 | Cancellation/reschedule policy поля теряются между UI, route, service и repo | Политики клиники не сохраняются/не применяются (scope 8). |
| K14 | Booking custom field отбрасывается payload/schema/repository либо доступен чужой клинике | Форма записи не сохраняет tenant-scoped поле или смешивает tenants (scope 8). |
| K15 | SMS fallback/comment/media path теряет payload/error либо допускает чужую клинику | Коммуникация/медиа молча не работают или нарушают authorization (scope 8). |
| K16 | Doctor screen откладывает menu либо делает запрещённый background request | Экран не даёт немедленное меню или обращается к удалённому кабинету (scope 8). |
| K17 | Clinic slug не сохраняется/не проверяется в owner scope либо доступен outsider | Публичный адрес клиники не работает или меняется чужим tenant (scope 8). |
| K18 | Tariff billing принимает неверный tenant/provenance либо не сохраняет тариф | Счёт/тариф клиники неверен (scope 8). |
| K19 | Calendar appointment теряет visible/real branch, service или specialist; outsider создаёт запись | Календарь показывает фиктивную/неполную запись либо нарушает tenant boundary (scope 8). |
| K20 | В активное дерево возвращается legacy migrator/history path, journal расходится с 0016–0018, либо появляется один direct patient-role DML callsite | B0-forward/ACL choke-point обходится (scope 1). |
| K21 | SARIF renderer получает два findings, но показывает/аннотирует один | Не каждая gitleaks-находка видна (scope 9). |
| K22 | Checked push возвращает zero при finding; Telegram assignment не распознаётся/не редактируется | Security workflow пропускает секрет или раскрывает его (scope 9). |
| K23 | Full-history custom-rule scan даёт не ровно один известный unignored metadata finding, `.gitleaksignore` меняется или rotation evidence ложно считается имеющимся | Gate ошибочно зеленеет либо repository invariant нарушен (scope 9). |

## Классификация «тест или взгляд»

1. B0/journal/ACL/catalog/callsites — итоговое состояние + executable gates; поведение principal boundary — тест/fault injection.
2. Appointment lifecycle — end-to-end dataflow + route/service behavior tests/fault injection.
3. Messages/comments/warmup/settings — end-to-end dataflows, negative authorization branches, behavior tests/fault injection.
4. Exercise completion — UI→route→service→repository dataflow + behavior tests/fault injection.
5. ФИО/greeting — dataflow + UI/service behavior tests/fault injection.
6. Ratings/charts — UI/dataflow + behavior tests/fault injection.
7. Global Admin/invoice/theme — dataflows, negative authorization branches, trusted-provenance behavior tests/fault injection.
8. Clinic owner nine named paths — dataflows, negative authorization branches, relevant behavior tests/fault injection.
9. Gitleaks workflow/history — exact workflow/config state, executable renderer/push/history gates and fault injection; history scan only with `--redact`.

## Scope 1–9 results

### Findings

#### B-01 — arbitrary error text forges trusted manual-invoice provider provenance

**MUST FIX.** Reachable scenario: the manual-invoice service/port throws an ordinary domain
`Error("yookassa_create_invoice_failed:403:provider refused")`. The route answers `502
saas_billing_provider_rejected_invoice` and records `provider_invoice_refused_403`, even though the
error carries no trusted adapter provenance. The exact failing acceptance is
`apps/webapp/src/app/api/admin/saas-billing/payments/manual/route.route.test.ts:205`.

Impact: an arbitrary domain/repository error can be misclassified as an actual PSP refusal; the
public response and operator diagnostic claim a provider cause which was never proven. This violates
owner scope 7: arbitrary/domain error text or code must not forge SQLSTATE/provider cause.

Evidence in production flow:

- `apps/webapp/src/infra/payments/yookassaPaymentProvider.ts:287-291` emits the same plain-message
  shape for a real YooKassa HTTP refusal;
- `apps/webapp/src/modules/saas-billing/manualInvoiceFailure.ts:61-74` brands only transport/timeout
  provenance;
- `apps/webapp/src/modules/saas-billing/manualInvoiceFailure.ts:97-100,158-165` nevertheless trusts
  the `yookassa_create_invoice_failed` message prefix for diagnostics and HTTP mapping.

The independent paired acceptance keeps a typed `PaymentProviderRequestRefusedError` mapped to the
bounded provider refusal while requiring an untyped error with identical text to fail safely. The
typed branch passes; the untyped branch fails in the candidate.

#### B-02 — B0 patient capability callsite breaks the repository DB chokepoint gate

**MUST FIX.** `apps/webapp/src/app-layer/media/playbackUserVideoFirstResolve.ts:1-28` imports
`sql`, `getWebappSqlDb` and `runWebappNamedRoot` directly in `app-layer`. The named patient
capability itself is correct and direct patient DML grants remain absent, but this placement violates
the enforced app-layer/infra DB boundary. Concrete impact: root `pnpm run ci` stops at lint before
tests/typecheck/build, so the final candidate cannot pass its repository integration gate. This is
inside scope 1's function/catalog/callsite surface, not a style preference.

Exact reproduction:

```text
node scripts/check-db-chokepoint.mjs
exit 1 — apps/webapp/src/app-layer/media/playbackUserVideoFirstResolve.ts (2x layer SQL signal)
```

#### B-03 — touched chart component fails its scoped production lint gate

**MUST FIX (acceptance gate).** The positive-size behavior works, but
`apps/webapp/src/shared/ui/charts/PositiveSizeResponsiveContainer.tsx:35-36` synchronously calls the
state-setting `measure()` from an effect. The repository's React lint rule rejects it, so webapp lint
and therefore the requested final lint gate remain red. Concrete impact is a deterministic CI/lint
failure on the production file changed for scope 6.

```text
pnpm --dir apps/webapp exec eslint src/shared/ui/charts/PositiveSizeResponsiveContainer.tsx
exit 1 — 1 error, react-hooks/set-state-in-effect
```

### Per-scope disposition

1. **B0/DB — FAIL because of B-02; all B0, journal, ACL and privilege invariants otherwise pass.**
   Active roots are `0000_b0_baseline.sql` plus webapp forwards through `0018`; the integrator has
   only its B0 baseline. Generated contracts contain no direct `INSERT|UPDATE|DELETE|TRUNCATE` grant
   to `app_patient`. The named-root production catalog and its mutation oracle pass. No historical,
   zero-state or disposable migrator is active.
2. **Patient booking lifecycle — PASS.** UI fields (`slotStart`, `slotEnd`, branch, service and form
   answers) reach the create route, patient booking service, canonical appointment creation and
   exact patient capability. Future/history use `slot_end > now` / `slot_end <= now`; reschedule and
   cancel mutate the same booking identity. Patient gate plus current-patient DB functions are the
   negative authorization wall.
3. **Patient chat/comments/warmup/notification settings — PASS.** Support messages, program-item
   notes, warmup view/feeling/completion and notification/reminder writes reach exact current-patient
   named roots. Disabled/foreign objects are refused before write; the inspected clients advance
   optimistic state only after `ok` responses.
4. **Exercise completion — PASS.** Preview is navigation-only. `Отметить выполнение` posts an empty
   completion immediately; returned completion id opens optional metrics and the separate
   `Записать` PATCH. Cooldown is checked against the exact persisted item event; display dots derive
   from per-item persisted daily counts and support multiple completions.
5. **Profile/FIO — PASS.** Structured last/first/patronymic fields PATCH through
   `updateCurrentPatientFio`; profile state changes only after success. Today uses the dedicated
   first-name projection, not display/full name. Patient business gate and current-patient function
   provide the negative authorization branch.
6. **Ratings/charts — behavior PASS, acceptance FAIL because of B-03.** The off-switch returns before
   mounting either rating branch, and GET/PUT/feedback routes check it before session/tenant/data
   access. The chart mounts Recharts only for a positive measured box and never passes `-1×-1`.
7. **Global Admin — FAIL because of B-01.** Platform-only gates, atomic technical modes/DSN,
   notification topic code/title round-trip, forbidden specialist workspace, saved-password login
   password change and theme/topic persistence pass their inspected/tested paths. Manual invoice
   provenance does not fail safely for message spoofing.
8. **Clinic owner — PASS across all named paths.** Branch creation; historical-membership unlink;
   cancellation/reschedule policies; custom form field; SMS fallback/comments/media; immediate
   doctor menu with no forbidden polling; slug; tariff billing; and calendar creation with concrete
   branch/service/specialist all retain organization context. The route gates bind clinic management,
   entitlement and `withDoctorWorkspacePrincipal`; cross-org/specialist probes are refused or
   replaced by the authenticated specialist.
9. **Gitleaks — repository workflow PASS, external security state remains red.** Every synthetic
   SARIF finding is emitted to both summary and annotations; checked push is non-zero on a red run;
   the custom Telegram assignment rule is detected with redaction. The redacted full-history scan
   returns the one expected unignored `telegram-bot-token-assignment` metadata finding and
   `.gitleaksignore` is unchanged across the candidate range. No provider rotation/revocation
   evidence was supplied or inferred, so the external gate correctly stays red.

## Data/control-flow inspection

The following paths were traced independently, including a negative authorization branch for each
owner area 2–8:

| Scope | End-to-end path | Negative branch inspected |
|---|---|---|
| 2 | `ConfirmStepClient` → `/api/booking/create` → `patientBooking.createBooking` → canonical create → `pgPatientBookings`; list → `listForPatient` → upcoming/history named reads; cancel/reschedule routes → same service/repository identity. | `requirePatientApiBusinessAccess` plus current-patient booking roots bind reads/mutations to the session patient; an unknown/foreign booking returns not-found/refusal. |
| 3 | `/api/patient/messages` → patient messaging service → `pgSupportCommunication.appendWebappMessage` → `app.append_current_patient_support_message`; program comment POST → patient action service → action/discussion capabilities; warmup and reminder/settings ports follow their current-patient roots. | Feature/support gates return 403 before discussion writes; the support service refuses blocked patients before append; named-root catalog pins the patient role and source file. |
| 4 | Tile preview `<Link>` has no completion handler; completion button → `postProgramItemComplete` → complete route → progress service → exact `done` action; metrics → completion-id PATCH → exact event enrichment; checklist count → dot renderer. | Instance is loaded with `getInstanceForPatient`, item id is resolved inside it, cooldown rejects a second insert inside the configured window. |
| 5 | `PatientProfileHero` → `/api/patient/profile/fio` → `userProjection.updateCurrentPatientFio` → `app.update_current_patient_fio`; session projection → `patientGreetingPersonalizedName(firstName)`. | Patient gate runs before PATCH; invalid/Latin/missing FIO is rejected before repository write; current-patient function cannot target another id. |
| 6 | Runtime feature context → `PatientContentMaterialRating` early return; enabled path → `MaterialRatingBlock` → rating API; chart host measurement → positive-size guard → Recharts. | Disabled flag returns 403 before session, tenant resolution or rating read/write; UI does not mount the fetching block. |
| 7 | Platform operation gate → admin settings/service atomic batches (modes, DSN, topic id/title); password-change verification → password hash update; manual invoice route → service DB/provider boundaries → mapper. | Global admin is rejected by specialist workspace binding; clinic/non-platform callers fail platform gates. B-01 is the surviving negative provenance branch. |
| 8 | Clinic management gate → tenant entitlement → doctor workspace principal → branch/policy/form/slug/billing ports; manual appointment schema requires branch/service and resolves the authenticated specialist before create. | Cross-org policy scopes are rejected; form/branch payloads always receive `ctx.organizationId`; a normal doctor cannot assign another specialist; platform admin has no clinic workspace bypass. |

## Checks and exact counts

All long commands ran in the foreground through the repository test mutex. The first full-CI attempt
stopped before checks because the fresh clone had no dependencies (`eslint: not found`); after exact
`pnpm install --frozen-lockfile`, the measured results were:

- `ALLOW_FULL_CI=1 /home/dev/brain/host-orch/run-tests.sh "set -o pipefail; cd /home/dev/dev-projects/bcb-wt-systemic-final-audit-b-20260817 && pnpm run ci 2>&1 | tee /tmp/bcb-systemic-audit-b-ci.log"`
  — **FAIL**, `check-db-chokepoint` reports B-02 and stops the pipeline.
- `/home/dev/brain/host-orch/run-tests.sh "set -o pipefail; cd /home/dev/dev-projects/bcb-wt-systemic-final-audit-b-20260817 && pnpm typecheck 2>&1 | tee /tmp/bcb-systemic-audit-b-typecheck.log"`
  — **PASS** for all workspace typechecks.
- `/home/dev/brain/host-orch/run-tests.sh "set -o pipefail; cd /home/dev/dev-projects/bcb-wt-systemic-final-audit-b-20260817 && pnpm --dir apps/webapp run lint 2>&1 | tee /tmp/bcb-systemic-audit-b-webapp-lint.log"`
  — **FAIL** with exactly one scoped production lint error (B-03).
- `/home/dev/brain/host-orch/run-tests.sh "set -o pipefail; cd /home/dev/dev-projects/bcb-wt-systemic-final-audit-b-20260817 && pnpm --dir apps/webapp test 2>&1 | tee /tmp/bcb-systemic-audit-b-webapp-test-final.log"`
  — **FAIL**: `318` test files passed, `2` skipped, `1` failed; `1410` tests passed, `6` skipped,
  `1` failed. The only failure is B-01.
- `/home/dev/brain/host-orch/run-tests.sh "set -o pipefail; cd /home/dev/dev-projects/bcb-wt-systemic-final-audit-b-20260817 && pnpm test 2>&1 | tee /tmp/bcb-systemic-audit-b-integrator-test.log"`
  — **PASS**: `79` files passed, `4` skipped; `399` tests passed, `2` expected-fail, `15` skipped.
- `pnpm --dir apps/webapp typecheck && pnpm exec eslint apps/webapp/src/app/api/admin/commercial/route.route.test.ts apps/webapp/src/app/api/admin/saas-billing/payments/manual/route.route.test.ts apps/webapp/src/app/api/doctor/booking-engine/_doctorAppointmentMutationScope.route.test.ts apps/webapp/src/app/app/patient/treatment/PatientTreatmentProgramStagePageProgramSection.ui.test.tsx`
  — **PASS** typecheck; ESLint has `0` errors and reports the `4` test files ignored by repository
  policy.
- `node scripts/check-b0-migration-baseline.mjs` — **PASS**: B0 roots plus `18` webapp forward
  migrations and `0` integrator forward migrations; no legacy chain.
- `find apps/webapp/db/drizzle-migrations -maxdepth 1 -type f -name '*.sql' | wc -l` → `19`
  total SQL files (one B0 + the same `18` forwards); `find apps/integrator -type f -name '*.sql' |
  wc -l` → `1` total SQL file (the B0 baseline).
- `node --test scripts/check-b0-migration-baseline.audit.test.mjs` — **PASS**, `2/2` executable
  negative fixtures.
- `./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges && node deploy/postgres/privileges/generate-cli.mjs --check && node deploy/postgres/privileges/generate-cli.mjs --census`
  — **PASS**; all generated privilege/allowlist artifacts byte-match; each target census checks
  `219` ACTIVE relations across `3267` production source files.
- `node --test deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/migrate-local-parse.test.mjs deploy/postgres/privileges/port-context-callsite-catalog.test.mjs deploy/postgres/privileges/port-context-catalog.test.mjs deploy/postgres/privileges/relation-access.test.mjs`
  — **PASS, 69/69** including named-root callsite mutation oracles, exact role shapes and patient
  self-write capability closure.
- `rg '^GRANT .*\b(INSERT|UPDATE|DELETE|TRUNCATE)\b.* TO "app_patient";' deploy/postgres/generated/privileges.bcb_webapp_dev.sql | wc -l` → **`0`**; the same command for
  `deploy/postgres/generated/privileges.bersoncarebot_test.sql` → **`0`**. These are the exact raw
  direct patient-role DML oracles for both generated target contracts; the production callsite
  catalog separately scans both webapp and integrator roots.
- `bash apps/webapp/scripts/check-legacy-migrations-frozen.sh && bash apps/webapp/scripts/check-drizzle-journal-sync.sh`
  — **PASS**; transaction-safe layout and journal sync are green.
- `node scripts/check-no-new-raw-sql.mjs` — **PASS**, production raw-query debt `0` after all
  temporary mutations were restored.
- `node --test scripts/checked-push-security.test.mjs` — **PASS, 2/2**: two-finding renderer
  visibility/redaction and red checked-push exit.
- `gitleaks git . --no-banner --redact --config .gitleaks.toml --gitleaks-ignore-path .gitleaksignore --report-format sarif --report-path "$audit_tmp/gitleaks.sarif"`
  — expected **exit 1**, exactly `1` finding; metadata-only rule id
  `telegram-bot-token-assignment`. No secret value or fragment was printed.
- `git diff --exit-code 609a19f94..a1d4037db -- .gitleaksignore` — **PASS / exit 0**; the ignore file
  is unchanged over the candidate range.

## Fault injection results

The mandatory independent fault classes were exercised as follows. `KILLED` means the oracle went
red on the injected defect; `SURVIVED` means the unmodified candidate already contains the defect.

| Fault | Result | Exact executable evidence |
|---|---|---|
| Preview calls completion (K01) | KILLED | Added a temporary preview `onClick → handleTileComplete`; `pnpm exec vitest --run src/app/app/patient/treatment/PatientTreatmentProgramStagePageProgramSection.ui.test.tsx` returned exit `1`, `1/1` failed. Restored; the same command is green `1/1`. |
| Optional metrics required/co-saved (K02) | KILLED | Added a metrics body to immediate POST; `pnpm exec vitest --run src/app/app/patient/treatment/postProgramItemComplete.unit.test.ts` returned exit `1`, `1` failed / `3` passed. Restored. |
| Wrong slot-start future filter (K04) | KILLED | Replaced the forward rewrite with `slot_start >= p_now`; the exact Node oracle over `0001_patient_booking_runtime_capability.sql` returned exit `1`. Restored; oracle and B0 gate pass. |
| Patient message uses a staff/wrong capability (K05) | KILLED | Replaced `app.append_current_patient_support_message` with a staff-named root; `node --test deploy/postgres/privileges/port-context-callsite-catalog.test.mjs` returned exit `1`, `1` failed / `4` passed. Restored; production catalog passes. |
| Disabled rating still mounts/fetches (K07) | KILLED | Disabled the component early return; focused UI+route command returned exit `1`, `1` failed / `4` passed. Restored. |
| Clinic owner payload loses tenant organization (K11/K14) | KILLED | Replaced form-field `ctx.organizationId` with a foreign id; `pnpm exec vitest --run src/app/api/admin/booking-engine/form-fields/route.route.test.ts` returned exit `1`, `1` failed / `3` passed. Restored. |
| Arbitrary invoice error imitates trusted provider (K10) | SURVIVED | `pnpm exec vitest --run src/app/api/admin/saas-billing/payments/manual/route.route.test.ts` fails the new untyped-message acceptance: candidate returns `502/provider_rejected` instead of fail-safe `503/unavailable`; typed provider refusal still passes. |
| Direct patient DML / legacy migrator (K20) | KILLED | A temporary patient branch calling `getPool().query(DELETE …)` made `node scripts/check-no-new-raw-sql.mjs` exit `1` at the injected file; restored gate passes. `node --test scripts/check-b0-migration-baseline.audit.test.mjs` also rejects the injected alternate executable SQL wrapper (`2/2` negative fixtures pass). |
| Two-finding SARIF drops one / checked push green (K21/K22) | KILLED | `node --test scripts/checked-push-security.test.mjs` passes `2/2`: both findings are in summary+annotations with commit metadata redacted, and the red Actions run makes checked push non-zero. |

`rg -c '\| KILLED \|' runs/orchestration/systemic-final-independent-audit-b-20260817.md` → `8`
killed mandatory classes; `rg -c '\| SURVIVED \|'
runs/orchestration/systemic-final-independent-audit-b-20260817.md` → `1` survivor.
K03/K06/K08/K09/K12–K19/K23 were additionally covered by the broad behavioral suites,
negative authorization inspection and exact final-state gates above; no claim is based only on a
pre-existing test name.

## Final diff and verdict

**Verdict: `FAIL`.** `PASS_WITH_EXTERNAL_ROTATION_BLOCKER` is forbidden because provider rotation is
not the sole blocker: B-01 is a reachable product provenance failure, while B-02 and B-03 leave
required repository acceptance gates red.

Committed audit-only diff:

- this report;
- a new preview-no-write UI acceptance;
- manual-invoice typed-vs-untyped provenance acceptance;
- repaired acceptance fixtures that now include the already-required branch quota and concrete
  branch/service appointment payload, so their authorization assertions reach production logic.

No product code, migration, env, DB, DEV/TEST/PROD, deploy, provider, history, push or auditor-A
material was changed. Every temporary product mutation was restored before the final diff.
