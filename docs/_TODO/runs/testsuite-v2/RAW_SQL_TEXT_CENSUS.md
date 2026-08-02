# Webapp legacy SQL-text census — Single-entry пункт 1

## Authority and boundary

This is a research-only implementation map for production `apps/webapp/src/**`.
The oracle is [SINGLE_ENTRY_CLEANUP_2026-08-01.md](../../SINGLE_ENTRY_CLEANUP_2026-08-01.md), пункт 1:
`runWebappPgText` executes legacy `$1..$n` SQL text; the target is typed Drizzle
builders/schema (`select`/`insert`/`update`/`delete`, with `sql` only for PostgreSQL
primitives). This census does not close that item and changes no source, schema,
migration, DB, DEV/TEST/PROD, deploy artefact, or plan checkbox.

Track D (including D10/D15/D18), Ч4/Ч4б/current tariff, Ч7, and В9б remain the
owner authorities for their listed paths. A zero runtime producer is not deletion
authority: a site is `DELETE_BY_OWNER_STAGE` only after both an owner-approved
deletion stage and its required proof exist.

## Baseline: AST semantic invocations

The denominator is a TypeScript AST `CallExpression` whose expression is the
identifier `runWebappPgText`, including `runWebappPgText<T>(...)`. It is not an
import, port declaration, literal spelling, SQL statement count, or operation count.
Run from the repository root at target source SHA `064d768d3`:

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import ts from '/home/dev/.local/share/pnpm/global/5/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js';
import { execFileSync } from 'node:child_process';

const candidates = execFileSync('rg', [
  '-l', '--glob', '*.{ts,tsx}', '--glob', '!**/*.test.*', '--glob', '!**/*.spec.*',
  'runWebappPgText', 'apps/webapp/src',
], { encoding: 'utf8' }).trim().split('\n').sort();
let invocationFiles = 0;
let semanticCalls = 0;
for (const file of candidates) {
  const source = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let fileCalls = 0;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === 'runWebappPgText') {
      fileCalls += 1;
      semanticCalls += 1;
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (fileCalls) console.log(`${file}\t${fileCalls}`);
  if (fileCalls) invocationFiles += 1;
}
console.log({ candidateFiles: candidates.length, invocationFiles, semanticCalls });
NODE
# { candidateFiles: 88, invocationFiles: 87, semanticCalls: 557 }
```

`apps/webapp/src/infra/db/runWebappSql.ts` is the sole candidate without an
invocation: it declares the bridge but does not call itself. The old literal-only
measurement (`runWebappPgText\(`) is deliberately not a denominator: it yields
44 files / 155 calls and misses generic calls.

### 2026-08-02 public-booking entry slice evidence

`pgClinicDirectory.ts` and `pgPublicBookingOtp.ts` now use `runWebappSql` with
tagged Drizzle `sql` fragments for the five public-booking entry calls. A one-time
`PgDialect().sqlToQuery()` inspection compiled each fragment and compared
whitespace-normalized SQL and exact parameter order/values to its prior `$1..$n`
query: all five matched. The canonical AST command above, run after this slice,
returned `{ candidateFiles: 73, invocationFiles: 72, semanticCalls: 523 }`.

### 2026-08-02 password-login entry slice evidence

`pgPasswordLoginProtection.ts` now uses `runWebappSql` with tagged Drizzle `sql`
fragments for all four password admission, completion and ALTCHA calls. A one-time
`PgDialect().sqlToQuery()` inspection compared the pre-conversion `$1..$n` text
with each converted fragment: all four matched by whitespace-normalized SQL and
exact parameters, including nullable ALTCHA inputs and the ISO timestamp. The
canonical AST command above returned
`{ candidateFiles: 71, invocationFiles: 70, semanticCalls: 509 }` after this
slice (from `{ candidateFiles: 72, invocationFiles: 71, semanticCalls: 513 }`).
The global raw-SQL-text item remains open.

Legend: **TL** = `TRANSLATE_LIVE`; **WO** = `WAIT_OVERLAP`; **DO** =
`DELETE_BY_OWNER_STAGE`; **EX** = `LOW_LEVEL_EXEMPT`. A split is shown as
`TL n + WO n`; every call is assigned once. No `EX` exists: a function, lock,
RLS principal, or caller-owned transaction is a typed `sql`/Drizzle translation
case, not an execution-port exemption.

## Census by file and operation/caller authority

All `calls` values below use the AST semantic invocation measure above. The
operation/path text is the contract to preserve or the owner stage that prevents
an independent conversion slice.

| File | calls | operation/caller reachability and disposition |
|---|---:|---|
| `app-layer/media/playbackStatsHourly.ts` | 1 | hourly playback telemetry; TL 1 |
| `infra/adminAuditLog.ts` | 9 | staff audit write/list/resolve; TL 9 |
| `infra/idempotency/pgStore.ts` | 2 | integrator-event POST idempotency cache; TL 2 |
| `infra/platformUserPurgeSql.ts` | 1 | live full-purge client helper; TL 1 |
| `infra/repos/broadcastChannelCounts.ts` | 5 | doctor broadcast recipient preview; TL 5 |
| `infra/repos/doctorAppointmentPurgeFilter.ts` | 1 | appointment purge filter; TL 1 |
| `infra/repos/identityPhoneSql.ts` | 2 | mixed identity bridge under D15; WO 2 |
| `infra/repos/loadPlatformUserChannelBindings.ts` | 1 | reminder/delivery channel lookup; TL 1 |
| `infra/repos/mergeLegacySupportConversations.ts` | 1 | support merge transaction; TL 1 |
| `infra/repos/pgAdminClientProfileConflicts.ts` | 2 | admin email/phone conflict lookup; TL 2 |
| `infra/repos/pgAdminNotificationTargets.ts` | 1 | operator notification targets; TL 1 |
| `infra/repos/pgAdminPlatformUserStats.ts` | 1 | admin user statistics; TL 1 |
| `infra/repos/pgAdminTranscodeHealthMetrics.ts` | 2 | system-health transcode counts; TL 2 |
| `infra/repos/pgBookingEngine.ts` | 1 | branch quota transaction; Ч4/current tariff; WO 1 |
| `infra/repos/pgBookingScheduling.ts` | 1 | public booking organization resolver; Ч4 owner file; WO 1 |
| `infra/repos/pgBranches.ts` | 2 | DI-only projection port, no runtime method consumer found; В9б retirement is not deletion authority; WO 2 |
| `infra/repos/pgBroadcastAudit.ts` | 2 | broadcast audit append/list; TL 2 |
| `infra/repos/pgCanonicalPlatformUser.ts` | 6 | canonical identity seam under D15; WO 6 |
| `infra/repos/pgClinicDirectory.ts` | 3 | public clinic slug resolution; TL 3 |
| `infra/repos/pgCourses.ts` | 1 | course usage guard; TL 1 |
| `infra/repos/pgDoctorAnalyticsMetricAccounts.ts` | 25 | doctor analytics metric accounts; TL 25 |
| `infra/repos/pgDoctorCalendarTimezone.ts` | 1 | doctor schedule timezone; TL 1 |
| `infra/repos/pgDoctorNotes.ts` | 1 | doctor notes list; TL 1 |
| `infra/repos/pgDoctorProactiveInsights.ts` | 5 | support/wellbeing/program insight reads; TL 5 |
| `infra/repos/pgEmailOtpPublic.ts` | 5 | public email identity/challenge lifecycle; TL 5 |
| `infra/repos/pgEmailPasswordLookup.ts` | 2 | email auth-state lookup; TL 2 |
| `infra/repos/pgLfkAssignments.ts` | 1 | assignment transaction helper; TL 1 |
| `infra/repos/pgMaterialRating.ts` | 3 | material-rating analytics; TL 3 |
| `infra/repos/pgMediaFolderLookup.ts` | 1 | media-folder validation; TL 1 |
| `infra/repos/pgMessageLog.ts` | 5 | message history append/user/admin lists; TL 5 |
| `infra/repos/pgOAuthBindings.ts` | 2 | provider bindings read; TL 2 |
| `infra/repos/pgOnlineIntake.ts` | 14 | doctor/patient intake helpers; TL 14 |
| `infra/repos/pgOrgEntitlements.ts` | 4 | entitlement/current-patient/quota resolver; current tariff workstream; WO 4 |
| `infra/repos/pgPasskeyStore.ts` | 9 | passkey credential/challenge lifecycle; TL 9 |
| `infra/repos/pgPasswordLoginProtection.ts` | 4 | password proof/ALTCHA lifecycle; TL 4 |
| `infra/repos/pgPatientMaintenanceHistory.ts` | 1 | patient maintenance history; TL 1 |
| `infra/repos/pgPatientOrganization.ts` | 2 | active enrollment/program organization reads; TL 2 |
| `infra/repos/pgPatientOrganizationEnrollment.ts` | 1 | invited-client enrollment; D15 ownership; WO 1 |
| `infra/repos/pgPatientTelegramUsernameMention.ts` | 1 | Telegram mention lookup; TL 1 |
| `infra/repos/pgPayments.ts` | 1 | provider-webhook organization resolution; TL 1 |
| `infra/repos/pgPlatformAccess.ts` | 1 | canonical access row; TL 1 |
| `infra/repos/pgPlatformLfkMediaAccess.ts` | 1 | platform LFK media ACL; TL 1 |
| `infra/repos/pgPlaybackResolutionEvents.ts` | 1 | chosen HLS/MP4/file delivery event; TL 1; first bounded slice below |
| `infra/repos/pgPublicBookingOtp.ts` | 2 | public booking OTP issue/consume; TL 2 |
| `infra/repos/pgTreatmentProgram.ts` | 3 | template previews/usage; TL 3 |
| `infra/repos/pgTreatmentProgramItemSnapshot.ts` | 1 | catalog media preview snapshot; TL 1 |
| `pgAppRuntimeSettings.ts` | 7 | runtime-setting source/fallback changes in Ч7; WO 7 |
| `pgAppointmentProjection.ts` | 15 | reachable booking/doctor/admin/integrator projection transport; D10 zero-producer gate; WO 15 |
| `pgAuthRateLimitEvents.ts` | 8 | login/OTP lock and rate-limit state; TL 8 |
| `pgChannelLinkClaim.ts` | 16 | named В9б platform-identity/binding path; WO 16 |
| `pgChannelLinkStart.ts` | 7 | D15 channel-link decision; WO 7 |
| `pgChannelPreferences.ts` | 6 | D15 public preference ownership; WO 6 |
| `pgDevBypassPlatformUserPhone.ts` | 2 | dev-only role-specific phone update; TL 2 |
| `pgDiaryPurge.ts` | 4 | account diary/LFK purge transaction; TL 4 |
| `pgDoctorBroadcastDelivery.ts` | 3 | retained queue audit/jobs atomic write; TL 3 |
| `pgDoctorClients.ts` | 36 | doctor client-card/list contracts; TL 36 |
| `pgDoctorMotivationQuotesEditor.ts` | 7 | quote CMS ordering/archive; TL 7 |
| `pgEmailAuth.ts` | 19 | email challenge/ownership/OTP lockout; TL 19 |
| `pgEmailSetupFlowPort.ts` | 4 | password-email setup transition; TL 4 |
| `pgEmailSetupTokens.ts` | 5 | setup token consume/expiry; TL 5 |
| `pgLfkDiary.ts` | 14 | patient LFK CRUD; TL 14 |
| `pgLfkExercises.ts` | 12 | exercise catalog/usage; TL 12 |
| `pgLfkTemplates.ts` | 7 | LFK template usage/editor; TL 7 |
| `pgLoginTokens.ts` | 5 | login-token lifecycle; TL 5 |
| `pgMessengerPhoneHttpBind.ts` | 7 | D15 signed phone-bind identity door; WO 7 |
| `pgOAuthUserResolve.ts` | 5 | OAuth verified identity resolve; TL 5 |
| `pgOrgBranding.ts` | 8 | branding revision lock/publish; TL 8 |
| `pgOrganizationInvites.ts` | 12 | seat/quota transaction; Ч4/Ч4б/current tariff; WO 12 |
| `pgOrganizationProvisioning.ts` | 6 | specialist signup provisioning; TL 6 |
| `pgPatientBookings.ts` | 15 | named В9б booking direct paths; WO 15 |
| `pgPatientCalendarTimezone.ts` | 5 | patient-principal timezone read/set; TL 5 |
| `pgPhoneChallengeStore.ts` | 5 | phone challenge merge/consume; TL 5 |
| `pgPhoneHistory.ts` | 3 | D15 stored phone-proof/source transition; WO 3 |
| `pgPhoneOtpLimits.ts` | 4 | anonymous OTP lockout; TL 4 |
| `pgPlatformUserCalendarTimezone.ts` | 2 | В9б capability-boundary cutover; WO 2 |
| `pgProductAnalytics.ts` | 4 | Ч4 analytics owner file; WO 4 |
| `pgReferences.ts` | 22 | clinician reference catalog CRUD; TL 22 |
| `pgStaffSecurity.ts` | 10 | staff security state machine; TL 10 |
| `pgSupportCommunication.ts` | 52 | `resolvePlatformUserId` 2 + `*FromProjection` 19 are reachable D10 transport: WO 21; patient/doctor/admin chat paths: TL 31 |
| `pgSymptomDiary.ts` | 18 | symptom tracking/entry CRUD; TL 18 |
| `pgSystemSettings.ts` | 31 | Ч7 source and failure-policy owner; WO 31 |
| `pgUserPasswordCredentials.ts` | 7 | password registration/login lifecycle; TL 7 |
| `pgUserPins.ts` | 4 | PIN state/lockout; TL 4 |
| `pgUserProjection.ts` | 9 | D15/D10 shared `txPgText`, `updateProfileByPhone`, `upsertNotificationTopics`: WO 3; live account/auth/admin operations: TL 6 |
| `pgWebPushSubscriptions.ts` | 6 | subscription cap/upsert transaction; TL 6 |
| `stockQuotaCheck.ts` | 2 | tariff quota decision inside transaction; Ч4/Ч4б; WO 2 |
| `upsertBroadcastDefaultsAfterChannelBind.ts` | 1 | D15 post-bind defaults; WO 1 |

## Partition and reconciliation

| Category | calls | reconciliation |
|---|---:|---|
| `TRANSLATE_LIVE` | **388** | every TL portion in the 87 rows |
| `WAIT_OVERLAP` | **169** | D10/D15 72 + Ч4/Ч4б/current tariff 24 + Ч7 38 + additional В9б paths 35 |
| `DELETE_BY_OWNER_STAGE` | **0** | no site has both zero-producer proof and current owner deletion authority |
| `LOW_LEVEL_EXEMPT` | **0** | `infra/db/runWebappSql.ts` has no invocation; local wrappers are not the execution port |
| denominator | **557** | `388 + 169 + 0 + 0 = 557` |

Overlap breakdown: D10/D15 72 = `pgAppointmentProjection` 15 + support projection
partition 21 + `pgUserProjection` 3 + D15 identity doors/helpers 33. Ч4/Ч4б/current
tariff 24 = `pgBookingEngine` 1 + `pgBookingScheduling` 1 + `pgProductAnalytics` 4 +
`pgOrgEntitlements` 4 + `pgOrganizationInvites` 12 + `stockQuotaCheck` 2. Ч7 38 =
`pgAppRuntimeSettings` 7 + `pgSystemSettings` 31. Additional В9б 35 =
`pgPatientBookings` 15 + `pgChannelLinkClaim` 16 + `pgPlatformUserCalendarTimezone` 2 +
`pgBranches` 2. The support split is **21**, not 20.

Table reconciliation (run after any report edit):

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
const report = fs.readFileSync('docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md', 'utf8');
const section = report.split('## Census by file and operation/caller authority')[1]
  .split('## Partition and reconciliation')[0];
let rows = 0, claimedSum = 0;
for (const line of section.split('\n')) {
  const match = line.match(/^\| `([^`]+)` \| (\d+) \|/);
  if (match) { rows += 1; claimedSum += Number(match[2]); }
}
console.log({ rows, claimedSum });
NODE
# { rows: 87, claimedSum: 557 }
```

## Reachability and order

The currently live D10/D15 callers, and the reason `pgBranches` remains WAIT rather
than DELETE, are reproducible without inventing a gate:

```sh
rg -n "from '@/infra/repos/pgAppointmentProjection'|createPgAppointmentProjectionPort|appointmentProjection" apps/webapp/src --glob '*.{ts,tsx}'
rg -n 'upsertConversationFromProjection|appendConversationMessageFromProjection|setConversationStatusFromProjection|upsertQuestionFromProjection|appendQuestionMessageFromProjection|appendDeliveryEventFromProjection' apps/webapp/src apps/integrator/src --glob '*.{ts,tsx}'
rg -n 'userProjection[^\n]*upsertFromProjection|\.upsertFromProjection\(' apps/webapp/src --glob '*.{ts,tsx}'
rg -n "from '@/infra/repos/pgBranches'|createPgBranchesProjectionPort|branchesProjection|deps\.branches" apps/webapp/src --glob '*.{ts,tsx}'
```

First execute owner stages / their zero-producer proofs for held transport and
capability paths; do not translate a held file independently. Then translate live
contracts in bounded human-path slices. The selected first slice is deliberately
outside all current overlaps.

## First bounded live-slice brief

**Target:** only `apps/webapp/src/infra/repos/pgPlaybackResolutionEvents.ts`
(**1 semantic invocation**). Do not use `pgPlatformUserCalendarTimezone.ts`: its
direct `platform_users` access is inside the forthcoming В9б capability cutover.

**Boundary:** retain the existing `runWebappSql<T>(executor, sql\`...\`)` boundary
and Drizzle `sql` fragment for the PostgreSQL function
`app.record_media_playback_resolution_event`; use the existing
`mediaPlaybackResolutionEvents` schema export. No new schema, migration, port, or
principal shortcut.

**Human behavior oracle:** `resolveMediaPlaybackPayload.ts` →
`playbackResolutionEvents.ts` → this repo. After media resolution, exactly one
resolution event is insertable/readable by doctor/admin analytics for the resolved
user/media/delivery/fallback tuple. A DB failure remains best-effort and does not
break playback.

**Concrete opt-in DEV-DB oracle for a later authorized implementation:** reuse the
repository harness pattern in
`pgEmailOtpPublicAtomicConsume.devDb.integration.test.ts` and
`pgAuthRateLimitEvents.devDb.integration.test.ts`: it runs only with
`USE_REAL_DATABASE=1` and its named `RUN_*_DEV_DB` switch and refuses a
non-disposable database name. Seed the resolved tuple, assert the one inserted
event/result visible to analytics, and assert a forced DB failure leaves playback
successful. This is behavior evidence, not a source-text test; this census creates
no test or script and does not run DEV/DB/TEST.

## Not verified

No DB/DEV/TEST runtime was run. One-to-one Drizzle columns/functions for all 557
calls were not asserted; each authorized slice must inspect its exact contract.
`scripts/check-no-new-raw-sql.mjs` is not a proof for this census because its AST
gate covers `.query(...)`, not `runWebappPgText(...)` text.
