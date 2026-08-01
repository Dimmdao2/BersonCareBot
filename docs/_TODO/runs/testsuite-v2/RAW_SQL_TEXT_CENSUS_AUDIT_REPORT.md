# Независимый аудит `RAW_SQL_TEXT_CENSUS.md`

**Роль:** `auditor-live`, разовая inspection/механическая сверка, без постоянных source-text tests.  
**Target:** `064d768d3dfa421b77bcd9a9b8833aa052180f5f` (`docs: census webapp SQL text (#1082)`).  
**Target artifact:** `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md`.  
**Вердикт:** **FAIL**.

Target нельзя использовать как denominator, карту реализации или основание для первого translation-slice. Он
смешал два разных измерителя, пропустил 43 production-файла со 131 вызовом и дополнительно недосчитал 13
семантических вызовов в трёх строках уже включённой таблицы.

## 1. Scope и состояние target

Обязательные authority прочитаны до проверки: `AGENTS.md` §5, §7, §10a, §24;
`docs/ORCHESTRATION_BINDINGS.md`; пункт 1 `SINGLE_ENTRY_CLEANUP_2026-08-01.md`; Track D §2.2, §2.3 и
D10/D15/D18 в `WORK_ORDER.md`; для overlap также Ч4/Ч4б/Ч7, тарифный канон и В9б.

Текущий checkout находится позже target (`HEAD=1c173f2e0b13e948b5d9a123128545a5e5418c3c`), но проверяемые source и
target census совпадают с `064d768d3`:

```sh
git rev-parse HEAD
git show -s --format='%H%n%P%n%ad%n%s' --date=iso-strict 064d768d3
git diff --stat 064d768d3 -- \
  apps/webapp/src \
  docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md
# empty
```

Посторонние уже существовавшие изменения `*.env.example` не трогались. Product code, plan-checkbox, БД,
DEV/TEST/PROD, deploy, tests, commit и push не выполнялись.

## 2. Exact commands

### 2.1 Literal-измеритель target

Эти команды воспроизводят ровно заявленный target измеритель — соседние символы `runWebappPgText(`:

```sh
rg -l --glob '*.{ts,tsx}' --glob '!**/*.test.*' --glob '!**/*.spec.*' \
  'runWebappPgText\(' apps/webapp/src | sort | wc -l
# 44

rg -o --no-filename --glob '*.{ts,tsx}' --glob '!**/*.test.*' --glob '!**/*.spec.*' \
  'runWebappPgText\(' apps/webapp/src | wc -l
# 155

rg -o --count-matches --glob '*.{ts,tsx}' --glob '!**/*.test.*' --glob '!**/*.spec.*' \
  'runWebappPgText\(' apps/webapp/src | sort
```

`44 / 155` верны только для literal-формы. Это не denominator всех TypeScript invocation.

### 2.2 Семантический invocation-census

Ниже полный повторяемый AST-census. Он не считает импорт/объявление и не зависит от generic type-аргумента.
Использован уже установленный TypeScript 5.9.3; файлов не создаёт.

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import ts from '/home/dev/.local/share/pnpm/global/5/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js';
import { execFileSync } from 'node:child_process';

const candidates = execFileSync(
  'rg',
  ['-l', '--glob', '*.{ts,tsx}', '--glob', '!**/*.test.*', '--glob', '!**/*.spec.*',
   'runWebappPgText', 'apps/webapp/src'],
  { encoding: 'utf8' },
).trim().split('\n').sort();

let invocationFiles = 0;
let semanticCalls = 0;
let literalCalls = 0;
let genericCalls = 0;
let whitespaceCalls = 0;

function operationName(node, sf) {
  let p = node.parent;
  while (p && p !== sf) {
    if (ts.isFunctionDeclaration(p) && p.name) return p.name.text;
    if (ts.isMethodDeclaration(p)) return p.name.getText(sf);
    if (ts.isArrowFunction(p) || ts.isFunctionExpression(p)) {
      const owner = p.parent;
      if (ts.isPropertyAssignment(owner) || ts.isVariableDeclaration(owner)) {
        return owner.name.getText(sf);
      }
    }
    p = p.parent;
  }
  return '<anonymous>';
}

for (const file of candidates) {
  const source = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let fileCalls = 0;
  const operations = new Map();
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'runWebappPgText'
    ) {
      fileCalls += 1;
      semanticCalls += 1;
      if (source[node.expression.end] === '(') literalCalls += 1;
      else if (node.typeArguments?.length) genericCalls += 1;
      else whitespaceCalls += 1;
      const op = operationName(node, sf);
      operations.set(op, (operations.get(op) ?? 0) + 1);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (fileCalls === 0) continue;
  invocationFiles += 1;
  console.log(
    `${file}\t${fileCalls}\t` +
      [...operations].map(([name, count]) => `${name}:${count}`).join(', '),
  );
}

console.log(JSON.stringify({
  candidateFiles: candidates.length,
  invocationFiles,
  semanticCalls,
  literalCalls,
  genericCalls,
  whitespaceCalls,
}, null, 2));
NODE
```

Итог:

```text
candidateFiles=88
invocationFiles=87
semanticCalls=557
literalCalls=155
genericCalls=402
whitespaceCalls=0
```

Единственный candidate без invocation — `apps/webapp/src/infra/db/runWebappSql.ts`: там функция объявлена, но
сама себя не вызывает.

### 2.3 Сверка чисел таблицы target

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import ts from '/home/dev/.local/share/pnpm/global/5/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js';

const report = fs.readFileSync(
  'docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md',
  'utf8',
);
const section = report
  .split('## Census by domain contract')[1]
  .split('## Execution order')[0];
let rows = 0;
let claimedSum = 0;
for (const line of section.split('\n')) {
  const match = line.match(/^\| `([^`]+)` \| (\d+);/);
  if (!match) continue;
  rows += 1;
  claimedSum += Number(match[2]);
}
console.log({ rows, claimedSum });
NODE
# { rows: 44, claimedSum: 413 }
```

## 3. Независимые totals и reconciliation

| Измеритель | Target | Независимый результат | Reconciliation |
|---|---:|---:|---|
| файлы с literal `runWebappPgText(` | 44 | 44 | literal-команда target верна |
| literal occurrences | 155 | 155 | literal-команда target верна |
| production-файлы с семантическим invocation | заявлено 44 | **87** | ещё **43** invocation-файла содержат только generic-форму |
| все production invocation | заявлено 155 | **557** | `155 literal + 402 generic = 557` |
| сумма 44 строк target | заявлено, что равна 155 | **413** | арифметически не равна методу |
| реальные semantic invocation в этих 44 файлах | не измерено | **426** | target-таблица недосчитала ещё 13 |
| omitted semantic invocation вне 44 строк | не измерено | **131 в 43 файлах** | `426 + 131 = 557` |
| `LOW_LEVEL_EXEMPT` | 0 | **0** | invocation внутри `infra/db` нет; локальные `txPgText`/adapter helpers портом не являются |

Первопричина не в SQL statement count и не в числе port-методов. Candidate set построен regex, который не видит
TypeScript generic-вызов `runWebappPgText<Row>(...)`. После этого строки таблицы считались другим, в основном
семантическим измерителем только внутри уже урезанных 44 файлов. Три строки дополнительно посчитаны вручную неверно.

### 3.1 Строки target: literal против semantic

`report` — число в target, `AST` — реальное число invocation в том же файле.

| File | literal | report | AST | category после authority |
|---|---:|---:|---:|---|
| `app-layer/media/playbackStatsHourly.ts` | 1 | 1 | 1 | TL 1 |
| `infra/adminAuditLog.ts` | 3 | 9 | 9 | TL 9 |
| `pgAppRuntimeSettings.ts` | 1 | 7 | 7 | WO 7 — Ч7 |
| `pgAppointmentProjection.ts` | 8 | 15 | 15 | WO 15 — D10, путь жив |
| `pgAuthRateLimitEvents.ts` | 5 | 8 | 8 | TL 8 |
| `pgChannelLinkClaim.ts` | 6 | 16 | 16 | WO 16 — В9б named path |
| `pgChannelLinkStart.ts` | 4 | 7 | 7 | WO 7 — D15 reuses/moves channel-link decision |
| `pgChannelPreferences.ts` | 1 | 6 | 6 | WO 6 — D15 public preference ownership |
| `pgDevBypassPlatformUserPhone.ts` | 2 | 2 | 2 | TL 2 |
| `pgDiaryPurge.ts` | 4 | 4 | 4 | TL 4 |
| `pgDoctorBroadcastDelivery.ts` | 1 | **2** | **3** | TL 3 |
| `pgDoctorClients.ts` | 10 | 36 | 36 | TL 36 |
| `pgDoctorMotivationQuotesEditor.ts` | 5 | 7 | 7 | TL 7 |
| `pgEmailAuth.ts` | 7 | 19 | 19 | TL 19 |
| `pgEmailSetupFlowPort.ts` | 1 | 4 | 4 | TL 4 |
| `pgEmailSetupTokens.ts` | 2 | 5 | 5 | TL 5 |
| `pgLfkDiary.ts` | 3 | 14 | 14 | TL 14 |
| `pgLfkExercises.ts` | 4 | 12 | 12 | TL 12 |
| `pgLfkTemplates.ts` | 2 | 7 | 7 | TL 7 |
| `pgLoginTokens.ts` | 2 | 5 | 5 | TL 5 |
| `pgMessengerPhoneHttpBind.ts` | 7 | 7 | 7 | WO 7 — D15 explicitly reuses this signed identity door |
| `pgOAuthUserResolve.ts` | 1 | 5 | 5 | TL 5 |
| `pgOrgBranding.ts` | 2 | 8 | 8 | TL 8 |
| `pgOrganizationInvites.ts` | 4 | 12 | 12 | WO 12 — тариф/Ч4б owns the transaction file |
| `pgOrganizationProvisioning.ts` | 1 | 6 | 6 | TL 6 |
| `pgPatientBookings.ts` | 4 | 15 | 15 | WO 15 — В9б named direct paths |
| `pgPatientCalendarTimezone.ts` | 2 | 5 | 5 | TL 5 |
| `pgPhoneChallengeStore.ts` | 2 | 5 | 5 | TL 5 |
| `pgPhoneHistory.ts` | 3 | 3 | 3 | WO 3 — D15 changes stored phone proof/source |
| `pgPhoneOtpLimits.ts` | 1 | 4 | 4 | TL 4 |
| `pgPlatformUserCalendarTimezone.ts` | 1 | 2 | 2 | WO 2 — В9б `platform_users` cutover |
| `pgPlaybackResolutionEvents.ts` | 1 | 1 | 1 | TL 1 |
| `pgProductAnalytics.ts` | 2 | 4 | 4 | WO 4 — Ч4 owns this file |
| `pgReferences.ts` | 6 | **15** | **22** | TL 22 |
| `pgStaffSecurity.ts` | 10 | 10 | 10 | TL 10 |
| `pgSupportCommunication.ts` | 9 | **47** | **52** | WO 21 projection; TL 31 live chat/admin |
| `pgSymptomDiary.ts` | 5 | 18 | 18 | TL 18 |
| `pgSystemSettings.ts` | 9 | 31 | 31 | WO 31 — Ч7 |
| `pgUserPasswordCredentials.ts` | 1 | 7 | 7 | TL 7 |
| `pgUserPins.ts` | 2 | 4 | 4 | TL 4 |
| `pgUserProjection.ts` | 4 | 9 | 9 | WO 3 D15; TL 6 live account/auth/delivery reads |
| `pgWebPushSubscriptions.ts` | 4 | 6 | 6 | TL 6 |
| `stockQuotaCheck.ts` | 1 | 2 | 2 | WO 2 — тариф/Ч4б transaction-aware resolver |
| `infra/upsertBroadcastDefaultsAfterChannelBind.ts` | 1 | 1 | 1 | WO 1 — D15 owns post-bind defaults |

Три локальные ошибки target равны 13: `pgDoctorBroadcastDelivery` `2→3`, `pgReferences` `15→22`,
`pgSupportCommunication` `47→52`.

### 3.2 Полностью отсутствующие production-файлы

Все строки ниже имеют только generic-form, поэтому literal candidate search не включил их вообще. Operation names
получены тем же AST-command; это enclosing export/helper, а не догадка по имени файла.

| Omitted file | calls | enclosing operation/export; reachability/contract | category |
|---|---:|---|---|
| `infra/idempotency/pgStore.ts` | 2 | `getCachedResponse`, `setCachedResponse`; POST integrator-event idempotency | TL 2 |
| `infra/platformUserPurgeSql.ts` | 1 | `runPurgeClientPgText`; живой full-purge caller | TL 1 |
| `infra/repos/broadcastChannelCounts.ts` | 5 | `getChannelCountsByUserIds`; doctor broadcast recipient preview | TL 5 |
| `infra/repos/doctorAppointmentPurgeFilter.ts` | 1 | `loadPurgedCanonicalAppointmentIds`; appointment purge filtering | TL 1 |
| `infra/repos/identityPhoneSql.ts` | 2 | `runIdentityPoolPgText`, `runIdentityClientPgText`; auth/merge callers | WO 2 — mixed D15 identity bridge |
| `infra/repos/loadPlatformUserChannelBindings.ts` | 1 | same export; reminders/delivery channel lookup | TL 1 |
| `infra/repos/mergeLegacySupportConversations.ts` | 1 | `mergeSqlOnClient`; support merge transaction | TL 1 |
| `infra/repos/pgAdminClientProfileConflicts.ts` | 2 | email/phone conflict lookup; admin profile edit | TL 2 |
| `infra/repos/pgAdminNotificationTargets.ts` | 1 | `loadAdminNotificationTargetsFromDb`; operator notifications | TL 1 |
| `infra/repos/pgAdminPlatformUserStats.ts` | 1 | `queryRows`; admin user statistics | TL 1 |
| `infra/repos/pgAdminTranscodeHealthMetrics.ts` | 2 | transcode media counts; system health | TL 2 |
| `infra/repos/pgBookingEngine.ts` | 1 | `createPhysicalBranchWithDefaultColor`; branch quota transaction | WO 1 — Ч4/tariff |
| `infra/repos/pgBookingScheduling.ts` | 1 | `resolvePublicBookingOrganization`; public booking resolver | WO 1 — Ч4 file ownership |
| `infra/repos/pgBranches.ts` | 2 | `upsertFromProjection`, `getByIntegratorBranchId`; DI-only, no runtime consumer found | WO 2 — В9б retirement candidate, no owner deletion authority |
| `infra/repos/pgBroadcastAudit.ts` | 2 | `append`, `list`; broadcast audit | TL 2 |
| `infra/repos/pgCanonicalPlatformUser.ts` | 6 | canonical identity exact lookups | WO 6 — D15 canonical identity seam |
| `infra/repos/pgClinicDirectory.ts` | 3 | slug resolution/availability; clinic public entry | TL 3 |
| `infra/repos/pgCourses.ts` | 1 | `loadCourseUsageSummary`; treatment course usage guard | TL 1 |
| `infra/repos/pgDoctorAnalyticsMetricAccounts.ts` | 25 | `queryByMetric`; doctor analytics | TL 25 |
| `infra/repos/pgDoctorCalendarTimezone.ts` | 1 | `getDoctorCalendarTimezoneIana`; schedule display | TL 1 |
| `infra/repos/pgDoctorNotes.ts` | 1 | `listForUser`; doctor notes | TL 1 |
| `infra/repos/pgDoctorProactiveInsights.ts` | 5 | support/wellbeing/program insight reads | TL 5 |
| `infra/repos/pgEmailOtpPublic.ts` | 5 | public email identity/challenge operations | TL 5 |
| `infra/repos/pgEmailPasswordLookup.ts` | 2 | email auth state lookup/adapter | TL 2 |
| `infra/repos/pgLfkAssignments.ts` | 1 | `pgTextTx`; assignment transaction helper | TL 1 |
| `infra/repos/pgMaterialRating.ts` | 3 | `getDoctorDetail`; material rating analytics | TL 3 |
| `infra/repos/pgMediaFolderLookup.ts` | 1 | `mediaFolderExists`; media folder validation | TL 1 |
| `infra/repos/pgMessageLog.ts` | 5 | `append`, user/admin lists; message history | TL 5 |
| `infra/repos/pgOAuthBindings.ts` | 2 | provider bindings read | TL 2 |
| `infra/repos/pgOnlineIntake.ts` | 14 | intake get/list/count helpers; doctor/patient intake | TL 14 |
| `infra/repos/pgOrgEntitlements.ts` | 4 | entitlement/current-patient/quota resolver | WO 4 — current tariff workstream |
| `infra/repos/pgPasskeyStore.ts` | 9 | passkey credential/challenge lifecycle | TL 9 |
| `infra/repos/pgPasswordLoginProtection.ts` | 4 | password proof/ALTCHA lifecycle | TL 4 |
| `infra/repos/pgPatientMaintenanceHistory.ts` | 1 | patient maintenance history | TL 1 |
| `infra/repos/pgPatientOrganization.ts` | 2 | active enrollment/program organization reads | TL 2 |
| `infra/repos/pgPatientOrganizationEnrollment.ts` | 1 | invited client relationship creation | WO 1 — D15 enrollment ownership |
| `infra/repos/pgPatientTelegramUsernameMention.ts` | 1 | patient Telegram mention lookup | TL 1 |
| `infra/repos/pgPayments.ts` | 1 | provider webhook organization resolution | TL 1 |
| `infra/repos/pgPlatformAccess.ts` | 1 | canonical access row | TL 1 |
| `infra/repos/pgPlatformLfkMediaAccess.ts` | 1 | platform LFK media ACL | TL 1 |
| `infra/repos/pgPublicBookingOtp.ts` | 2 | public booking OTP issue/consume | TL 2 |
| `infra/repos/pgTreatmentProgram.ts` | 3 | template previews/usage | TL 3 |
| `infra/repos/pgTreatmentProgramItemSnapshot.ts` | 1 | catalog media preview snapshot | TL 1 |

Сумма omitted-таблицы: **131**.

### 3.3 Four-way classification

Классификация ниже относится к 557 синтаксическим invocation sites. Локальный bridge invocation относится к
`WAIT_OVERLAP`, если хотя бы один его caller принадлежит owner-stage: его нельзя безопасно «перевести отдельно» от
передаваемого SQL contract.

| Category | calls | Reconciliation |
|---|---:|---|
| `TRANSLATE_LIVE` | **388** | все строки/части строк, помеченные TL выше |
| `WAIT_OVERLAP` | **169** | D10/D15 72 + Ч4/Ч4б/tariff 24 + Ч7 38 + дополнительные exact В9б paths 35 |
| `DELETE_BY_OWNER_STAGE` | **0** | ни у одного invocation одновременно нет producer и нет действующей owner deletion authority |
| `LOW_LEVEL_EXEMPT` | **0** | `infra/db/runWebappSql.ts` не содержит invocation; local wrappers не execution port |
| denominator | **557** | `388 + 169 + 0 + 0 = 557` |

Owner-overlap breakdown:

- **D10/D15 — 72:** `pgAppointmentProjection` 15; projection-only часть `pgSupportCommunication` 21;
  `pgUserProjection` 3 — shared `txPgText` bridge 1, `updateProfileByPhone` 1,
  `upsertNotificationTopics` 1. Остальные шесть invocation этого mixed-файла принадлежат живым
  `findByIntegratorId`/`findByPhoneNormalized`, auth/account/admin operations и остаются TL. Ещё 33 —
  существующие identity doors/helpers, прямо входящие в D15a/D15b: `pgChannelLinkStart` 7,
  `pgChannelPreferences` 6, `pgMessengerPhoneHttpBind` 7, `pgPhoneHistory` 3,
  `upsertBroadcastDefaultsAfterChannelBind` 1, `identityPhoneSql` 2,
  `pgCanonicalPlatformUser` 6, `pgPatientOrganizationEnrollment` 1.
- **Ч4/Ч4б/current tariff — 24:** `pgBookingEngine` 1, `pgBookingScheduling` 1, `pgProductAnalytics` 4,
  `pgOrgEntitlements` 4, `pgOrganizationInvites` 12, `stockQuotaCheck` 2. Ч4б прямо запрещает отдельному slice
  трогать quota-файлы до соседнего тарифного workstream; D18b требует переводить touched SQL в его owner-stage.
- **Ч7 — 38:** `pgAppRuntimeSettings` 7 + `pgSystemSettings` 31. Ч7 меняет источник и failure-policy настроек;
  отдельная механическая перепись этих файлов до owner-stage создаёт повторную работу и риск закрепить старую
  fallback-семантику.
- **В9б — 35 сверх уже пересекающегося D10:** `pgPatientBookings` 15, `pgChannelLinkClaim` 16,
  `pgPlatformUserCalendarTimezone` 2, `pgBranches` 2. Первые три — direct access paths/tables, прямо названные
  remediation/cutover; `pgBranches` имеет zero runtime consumer, но пока только recommendation на retirement,
  поэтому `WAIT`, не `DELETE`.

`pgSupportCommunication` split воспроизводится по symbols: `resolvePlatformUserId` 2 и все методы
`*FromProjection` 19 = **21 WO**; остальные patient/doctor/admin operations = **31 TL**. Тезис target «первые 20
calls» неверен.

`pgUserProjection` split также по symbols: local `txPgText` invocation помечен WO, потому что обслуживает D15
`upsertFromProjection`/`updatePhone`; два direct WO — `updateProfileByPhone` и `upsertNotificationTopics`.
`findByIntegratorId`, `findByPhoneNormalized`, `updateRole`, `getProfileEmailFields` и два вызова
`clearStaffAccountEmail` дают **6 TL**.

## 4. Caller reachability и owner stages

### D10/D15 transport ещё жив

Exact searches:

```sh
rg -n "from '@/infra/repos/pgAppointmentProjection'|createPgAppointmentProjectionPort|appointmentProjection" \
  apps/webapp/src --glob '*.{ts,tsx}'
rg -n 'upsertConversationFromProjection|appendConversationMessageFromProjection|setConversationStatusFromProjection|upsertQuestionFromProjection|appendQuestionMessageFromProjection|appendDeliveryEventFromProjection' \
  apps/webapp/src apps/integrator/src --glob '*.{ts,tsx}'
rg -n 'userProjection[^\n]*upsertFromProjection|\.upsertFromProjection\(' \
  apps/webapp/src --glob '*.{ts,tsx}'
rg -n 'webappEvents|/api/integrator/events|handleIntegratorEvent' \
  apps/webapp/src --glob '*.{ts,tsx}'
```

Результат:

- `pgAppointmentProjection` вызывается booking app-layer, doctor/admin routes и signed integrator appointment
  routes. Удалять его сейчас нельзя: D10 требует сначала доказать zero producer.
- Все шесть support projection methods вызываются `modules/integrator/events.ts`, а тот — живым
  `app/api/integrator/events/route.ts`.
- D15 identity upsert/profile/topics также достижимы через `modules/integrator/events.ts`; одновременно в
  `pgUserProjection` есть живые account/auth/admin методы. Поэтому файл нельзя классифицировать одним словом
  «три writes», не показав общий helper/caller split.
- D15a ещё не принят владельцем, D15b не выполнен. Переводить или удалять owner-stage paths раньше нельзя.

### Zero producer не равен deletion authority

```sh
rg -n "from '@/infra/repos/pgBranches'|createPgBranchesProjectionPort|branchesProjection|deps\.branches" \
  apps/webapp/src --glob '*.{ts,tsx}'
```

Для `pgBranches` найдено только DI wiring; runtime method consumer не найден. В9б рекомендует retirement и
сначала требует проверить FK/backrefs. Это не owner-approved deletion stage, поэтому оба invocation —
`WAIT_OVERLAP`, а не `DELETE_BY_OWNER_STAGE`.

### Typed Drizzle boundary существует; locks/functions не exemption

`apps/webapp/src/infra/db/runWebappSql.ts` уже предоставляет:

- `runWebappSql<T>(db, fragment: SQL)`;
- `WebappSqlExecutor` для обычного Drizzle DB и активной transaction;
- `getWebappSqlFromPgClient` для supplied `PoolClient`;
- `runWebappTransaction` для Drizzle transaction.

В production есть живые образцы `runWebappSql(sql\`...\`)` в `pgReminderRules.ts`, `s3MediaStorage.ts`,
`pgWebPushOnlyReminders.ts` и других repos. В schema — 352 `export const`; отдельно подтверждены модели
`platformUsers`, `patientBookings`, `systemSettings`, `appRuntimeSettings`, `organizationMemberInvites`,
`outgoingDeliveryQueue`, `notificationDeliveryAttempts`, `mediaPlaybackResolutionEvents`.

Следовательно stored function, advisory lock, `FOR UPDATE`, RLS principal и caller-owned transaction не дают
`LOW_LEVEL_EXEMPT`: они переводятся в typed `sql` fragment на том же executor/transaction. Единственный
низкоуровневый порт — `infra/db/runWebappSql.ts`; invocation внутри него нет.

## 5. Findings

### F1 — MUST FIX: denominator не является census всех invocation

**Достижимый сценарий:** implementation идёт по 44 строкам target и после их закрытия объявляет пункт 1
завершённым. В production остаются 43 файла и 131 вызов, которых target вообще не видел; например, idempotency,
booking, auth, analytics, intake и entitlement paths продолжают исполнять legacy SQL text.

**Impact:** ложное закрытие owner requirement «сырого SQL-текста не должно остаться»; последующие D18/Single-entry
гейты строятся на неполном списке. Нарушены обязательный denominator gate и `AGENTS.md` принцип измерять
фактическое состояние.

### F2 — MUST FIX: даже урезанные 44 строки не reconciled

**Достижимый сценарий:** воркер доверяет числу строки и переводит только заявленные sites. Он оставляет третий
invocation в `pgDoctorBroadcastDelivery`, семь в `pgReferences` и пять в `pgSupportCommunication`.

**Impact:** минимум 13 legacy bridge sites остаются в уже объявленных обработанными файлах; категория/acceptance
не покрывает их operation contracts. Нарушено требование «сумма строк точно равна denominator».

### F3 — MUST FIX: `117/38` и execution order не доказаны

Target выводит `117 TL + 38 WO = 155`, хотя его строки дают 413, фактически в тех файлах 426, а полный denominator
557. Дополнительно support projection partition равен 21, не 20. Поэтому `WAIT_OVERLAP=38`, `TL=117`, «первые 20
support calls» и все основанные на них порядки нельзя переиспользовать.

**Достижимый impact:** support/identity/appointment code переводится до D10/D15 и затем удаляется либо меняет
живой projection contract; или живой chat/admin SQL ошибочно ждёт D10. Это именно тот порядок, который Track D
запрещает: сначала zero producers/owner-stage, затем transport deletion.

### F4 — MUST FIX: заявленная first live-slice пересекает В9б

`pgPlatformUserCalendarTimezone.ts` действительно минимален по размеру (**2 semantic invocation, 1 literal**),
reachable и имеет schema. Reachability:

```sh
rg -n 'getPlatformUserCalendarTimezone|setPlatformUserCalendarTimezone|accountTimezone' \
  apps/webapp/src --glob '*.{ts,tsx}'
```

Путь идёт `app/app/account/page.tsx` и `app/api/doctor/account/timezone/route.ts` →
`app-layer/doctor/accountTimezone.ts` → repo. Но обе операции напрямую читают/пишут `platform_users`; В9б прямо
назначает этой таблице спроектированный FORCE-RLS/capability cutover, а не обычную механическую замену запроса.

**Impact:** отдельный slice может закрепить direct staff read/write ровно перед переносом на principal/capability
или потребовать повторной переделки. Утверждение target «no Track D overlap» недостаточно: проверять требовалось и
В9б. Slice не принимается первым.

## 6. Минимальный fix-round

1. Пересобрать candidate set AST-командой, а не literal `rg`: baseline **557 invocation / 87 files** на target
   SHA. В target добавить 43 отсутствующих строки.
2. Для всех 87 файлов записать один измеритель — semantic invocation. Исправить как минимум `3`, `22`, `52` у
   трёх неверных строк. Сумма строк обязана дать 557.
3. Повторить operation/caller partition. Минимум: support projection **21**, не 20; mixed local helpers связывать
   со всеми callers; category totals должны дать 557.
4. Сохранить current owner overlap: D10/D15, current tariff/Ч4/Ч4б, Ч7 и В9б не переводить отдельными slices.
   `DELETE_BY_OWNER_STAGE` ставить только после одновременно доказанных zero producer и deletion authority.
5. Первой bounded live-slice взять `infra/repos/pgPlaybackResolutionEvents.ts` — **1 semantic invocation**.
   Existing boundary: `runWebappSql<T>(SQL)` + `sql` fragment; schema:
   `db/schema/schema.ts` export `mediaPlaybackResolutionEvents`; существующая функция
   `app.record_media_playback_resolution_event` уже вызывается этим repo. Reachability:
   `resolveMediaPlaybackPayload.ts` → `playbackResolutionEvents.ts` → repo. Human outcome измерим: после разрешения
   media playback появляется ровно одно resolution-event, которое читают admin/doctor analytics; отказ остаётся
   best-effort и не ломает playback.
6. Для этой slice не обещать выдуманный «integration check». В репозитории есть реальный opt-in DEV-DB harness
   pattern (`USE_REAL_DATABASE=1` + named `RUN_*_DEV_DB` + database-name refusal) в
   `pgEmailOtpPublicAtomicConsume.devDb.integration.test.ts`, `pgAuthRateLimitEvents.devDb.integration.test.ts` и
   других. Implementation brief должен назвать конкретный reusable pattern и проверить insert/result на
   disposable/разрешённой DB; source-text test не писать.

## 7. НЕ ПРОВЕРЕНО

- DB/DEV/TEST runtime не запускался и состояние функций/schema на живой базе не утверждается: task запретил
  DB, DEV, TEST и deploy.
- `scripts/check-no-new-raw-sql.mjs` не запускался; его green status не является частью этого аудита.
- Полнота one-to-one Drizzle table models для всех 557 запросов не проверялась по колонкам. Проверено наличие
  общего typed fragment/transaction contract и конкретных моделей для bounded/overlap примеров; каждый future
  slice обязан инспектировать свои columns/functions.
- Для `pgBranches` подтверждён нулевой runtime caller по source search, но не получено owner deletion authority и
  не проверены FK/data. Поэтому это не `DELETE_BY_OWNER_STAGE`.
- D10/D15 zero-producer не доказан — наоборот, текущие route/module callers найдены. Никакого разрешения на
  преждевременное удаление audit не даёт.
