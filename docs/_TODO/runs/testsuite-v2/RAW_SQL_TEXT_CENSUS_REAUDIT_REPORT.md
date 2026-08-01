# Повторный аудит исправленного raw-SQL census (#1082)

Дата: 2026-08-01. Аудируемый HEAD: `9d35191bd7b3d73c7dd6381be382b31df6f258b0`;
fix candidate: `763b899cc`.

## Вердикт

**PASS.** Все пять gate воспроизведены независимо от чисел fix-report. Production
`apps/webapp/src` между fix candidate и аудируемым HEAD не менялся:

```sh
git diff --exit-code 763b899cc..HEAD -- apps/webapp/src
# exit 0, output empty
```

Ни product code, ни conversion/migration, ни DB/DEV/TEST/PROD/deploy, ни plan-checkbox,
ни permanent source-text test не создавались и не запускались. Единственное изменение
этого прохода — настоящий re-audit report.

| Gate | Результат |
|---|---|
| 1. Независимый production AST walk, включая generic calls | PASS — 87 файлов, 557 invocation; 402 generic invocation |
| 2. Все per-file rows, без пропусков/дублей, сумма 557 | PASS — 87/87; omitted `[]`, duplicate `[]`, mismatch `[]` |
| 3. Partition, mixed и три исправленных counts | PASS — TL 388 + WO 169 + DO 0 + EX 0 = 557; mixed 21/31 и 3/6; counts 3/22/52 |
| 4. Callers/categories для 43 ранее пропущенных файлов и mixed rows | PASS — все 43 восстановлены по AST operation + production back-reference; 114 TL + 17 WO = 131 |
| 5. Первый bounded slice | PASS — один reachable call, owner-overlap не найден, boundary и behavior oracle существуют |

## 1. Независимый AST denominator

Команда не читает census/fix-report и не строит candidate set по literal regex. Она
обходит все production `.ts/.tsx`, исключает test/spec/stories и считает
`CallExpression` с identifier `runWebappPgText`; generic calls являются тем же AST
узлом и входят автоматически.

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from '/home/dev/.local/share/pnpm/global/5/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js';
const root = path.resolve('apps/webapp/src');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec|stories)\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
}
walk(root);
const rows = [];
for (const file of files.sort()) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let calls = 0;
  let genericCalls = 0;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'runWebappPgText') {
      calls += 1;
      if (node.typeArguments?.length) genericCalls += 1;
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (calls) rows.push({ path: path.relative(root, file), calls, genericCalls });
}
const serial = rows.map((row) => `${row.path}\t${row.calls}\t${row.genericCalls}`).join('\n');
console.log({
  scannedProductionFiles: files.length,
  invocationFiles: rows.length,
  semanticCalls: rows.reduce((sum, row) => sum + row.calls, 0),
  genericCalls: rows.reduce((sum, row) => sum + row.genericCalls, 0),
  rowDigest: crypto.createHash('sha256').update(serial).digest('hex'),
});
NODE
# {
#   scannedProductionFiles: 2955,
#   invocationFiles: 87,
#   semanticCalls: 557,
#   genericCalls: 402,
#   rowDigest: '91cfc36caf9194bece8d46bb0b725191cacd3324e98743d480bdb2bf4e859591'
# }
```

## 2. Reconciliation source rows ↔ census rows

В исправленном документе добавленные 43 строки имеют полный relative path, а
исходные 44 строки местами сохраняют короткий basename. Поэтому короткий label
разрешён только когда он однозначно соответствует одному AST path; это также
ловит коллизию basename вместо молчаливого выбора `infra/repos`.

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import ts from '/home/dev/.local/share/pnpm/global/5/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js';
const root = path.resolve('apps/webapp/src');
const source = new Map();
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec|stories)\.(ts|tsx)$/.test(entry.name)) {
      const sf = ts.createSourceFile(full, fs.readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true,
        entry.name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      let calls = 0;
      function visit(node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'runWebappPgText') calls += 1;
        ts.forEachChild(node, visit);
      }
      visit(sf);
      if (calls) source.set(path.relative(root, full), calls);
    }
  }
}
walk(root);
const byBase = new Map();
for (const sourcePath of source.keys()) {
  const base = path.basename(sourcePath);
  byBase.set(base, [...(byBase.get(base) ?? []), sourcePath]);
}
const report = fs.readFileSync('docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md', 'utf8');
const section = report.split('## Census by file and operation/caller authority')[1]
  .split('## Partition and reconciliation')[0];
const rows = [];
for (const line of section.split('\n')) {
  const match = line.match(/^\| `([^`]+)` \| (\d+) \| (.+) \|$/);
  if (!match) continue;
  const label = match[1];
  const candidates = label.includes('/') ? (source.has(label) ? [label] : []) : (byBase.get(label) ?? []);
  const parts = { TL: 0, WO: 0, DO: 0, EX: 0 };
  for (const hit of match[3].matchAll(/\b(TL|WO|DO|EX) (\d+)\b/g)) parts[hit[1]] += Number(hit[2]);
  rows.push({ label, path: candidates.length === 1 ? candidates[0] : null, candidates, calls: Number(match[2]), parts });
}
const resolved = rows.map((row) => row.path).filter(Boolean);
const duplicates = resolved.filter((value, index, all) => all.indexOf(value) !== index);
const omitted = [...source.keys()].filter((sourcePath) => !resolved.includes(sourcePath));
const countMismatch = rows.filter((row) => row.path && source.get(row.path) !== row.calls);
const unresolved = rows.filter((row) => !row.path).map((row) => ({ label: row.label, candidates: row.candidates }));
const rowPartitionMismatch = rows.filter((row) => Object.values(row.parts).reduce((a, b) => a + b, 0) !== row.calls);
const total = rows.reduce((acc, row) => {
  acc.calls += row.calls;
  for (const key of ['TL', 'WO', 'DO', 'EX']) acc[key] += row.parts[key];
  return acc;
}, { calls: 0, TL: 0, WO: 0, DO: 0, EX: 0 });
console.log({ sourceRows: source.size, sourceCalls: [...source.values()].reduce((a, b) => a + b, 0),
  tableRows: rows.length, total, unresolved, duplicates, omitted, countMismatch, rowPartitionMismatch });
NODE
# {
#   sourceRows: 87, sourceCalls: 557, tableRows: 87,
#   total: { calls: 557, TL: 388, WO: 169, DO: 0, EX: 0 },
#   unresolved: [], duplicates: [], omitted: [],
#   countMismatch: [], rowPartitionMismatch: []
# }
```

Отдельная сверка трёх исправленных строк:

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import ts from '/home/dev/.local/share/pnpm/global/5/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js';
for (const file of [
  'apps/webapp/src/infra/repos/pgDoctorBroadcastDelivery.ts',
  'apps/webapp/src/infra/repos/pgReferences.ts',
  'apps/webapp/src/infra/repos/pgSupportCommunication.ts',
]) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let calls = 0;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'runWebappPgText') calls += 1;
    ts.forEachChild(node, visit);
  }
  visit(sf);
  console.log(file, calls);
}
NODE
# apps/webapp/src/infra/repos/pgDoctorBroadcastDelivery.ts 3
# apps/webapp/src/infra/repos/pgReferences.ts 22
# apps/webapp/src/infra/repos/pgSupportCommunication.ts 52
```

## 3. Независимый partition и mixed rows

Список owner-held путей восстановлен из действующих D10/D15, Ч4/Ч4б/current
tariff, Ч7 и В9б authorities. Counts ниже берутся из AST source map; вручную не
подставляются, кроме семантического правила split для двух mixed-файлов.

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import ts from '/home/dev/.local/share/pnpm/global/5/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js';
const root = path.resolve('apps/webapp/src');
const source = new Map();
const owners = new Map();
function functionName(fn, sf) {
  if (ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) return fn.name?.getText(sf) ?? '<anonymous>';
  if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
    const parent = fn.parent;
    if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) return parent.name.getText(sf);
    return '<callback>';
  }
  return '<function>';
}
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec|stories)\.(ts|tsx)$/.test(entry.name)) {
      const sf = ts.createSourceFile(full, fs.readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true,
        full.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const callOwners = [];
      function visit(node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'runWebappPgText') {
          let parent = node.parent;
          while (parent && !ts.isFunctionLike(parent)) parent = parent.parent;
          callOwners.push(parent ? functionName(parent, sf) : '<top>');
        }
        ts.forEachChild(node, visit);
      }
      visit(sf);
      if (callOwners.length) {
        const rel = path.relative(root, full);
        source.set(rel, callOwners.length);
        owners.set(rel, callOwners);
      }
    }
  }
}
walk(root);
const supportOwners = owners.get('infra/repos/pgSupportCommunication.ts') ?? [];
const supportWO = supportOwners.filter((name) => name === 'resolvePlatformUserId' || name.endsWith('FromProjection')).length;
const userOwners = owners.get('infra/repos/pgUserProjection.ts') ?? [];
const userWO = userOwners.filter((name) => name === 'txPgText' || name === 'updateProfileByPhone' || name === 'upsertNotificationTopics').length;
const wholeGroups = {
  'D10/D15': [
    'infra/repos/pgAppointmentProjection.ts', 'infra/repos/identityPhoneSql.ts',
    'infra/repos/pgChannelLinkStart.ts', 'infra/repos/pgChannelPreferences.ts',
    'infra/repos/pgMessengerPhoneHttpBind.ts', 'infra/repos/pgPhoneHistory.ts',
    'infra/upsertBroadcastDefaultsAfterChannelBind.ts', 'infra/repos/pgCanonicalPlatformUser.ts',
    'infra/repos/pgPatientOrganizationEnrollment.ts',
  ],
  'Ч4/Ч4б/current tariff': [
    'infra/repos/pgBookingEngine.ts', 'infra/repos/pgBookingScheduling.ts',
    'infra/repos/pgProductAnalytics.ts', 'infra/repos/pgOrgEntitlements.ts',
    'infra/repos/pgOrganizationInvites.ts', 'infra/repos/stockQuotaCheck.ts',
  ],
  'Ч7': ['infra/repos/pgAppRuntimeSettings.ts', 'infra/repos/pgSystemSettings.ts'],
  'В9б': [
    'infra/repos/pgPatientBookings.ts', 'infra/repos/pgChannelLinkClaim.ts',
    'infra/repos/pgPlatformUserCalendarTimezone.ts', 'infra/repos/pgBranches.ts',
  ],
};
const assigned = new Set();
const groupTotals = {};
for (const [group, paths] of Object.entries(wholeGroups)) {
  let total = 0;
  for (const file of paths) {
    if (assigned.has(file)) throw new Error(`duplicate authority assignment: ${file}`);
    if (!source.has(file)) throw new Error(`authority path absent from AST census: ${file}`);
    assigned.add(file);
    total += source.get(file);
  }
  groupTotals[group] = total;
}
groupTotals['D10/D15'] += supportWO + userWO;
const denominator = [...source.values()].reduce((sum, value) => sum + value, 0);
const WO = Object.values(groupTotals).reduce((sum, value) => sum + value, 0);
console.log({
  mixed: {
    pgSupportCommunication: { WO: supportWO, TL: supportOwners.length - supportWO, total: supportOwners.length },
    pgUserProjection: { WO: userWO, TL: userOwners.length - userWO, total: userOwners.length },
  },
  groupTotals,
  partition: { TL: denominator - WO, WO, DO: 0, EX: 0, denominator },
});
NODE
# {
#   mixed: {
#     pgSupportCommunication: { WO: 21, TL: 31, total: 52 },
#     pgUserProjection: { WO: 3, TL: 6, total: 9 }
#   },
#   groupTotals: { 'D10/D15': 72, 'Ч4/Ч4б/current tariff': 24, 'Ч7': 38, 'В9б': 35 },
#   partition: { TL: 388, WO: 169, DO: 0, EX: 0, denominator: 557 }
# }
```

Mixed caller proof:

- `pgSupportCommunication`: `resolvePlatformUserId` содержит 2 invocation;
  `upsertConversationFromProjection` 1, `appendConversationMessageFromProjection` 7,
  `setConversationStatusFromProjection` 2, `upsertQuestionFromProjection` 2,
  `appendQuestionMessageFromProjection` 6, `appendDeliveryEventFromProjection` 1.
  Итого 21 WO. Все шесть projection methods вызываются живым
  `modules/integrator/events.ts`, который подключён к
  `app/api/integrator/events/route.ts`. Остальные 31 invocation принадлежат
  patient/doctor/admin chat, unread и message paths и остаются TL.
- `pgUserProjection`: shared `txPgText` invocation обслуживает D15
  `upsertFromProjection`/`updatePhone` и поэтому целиком WO; прямые
  `updateProfileByPhone` и `upsertNotificationTopics` дают ещё 2 WO.
  `modules/integrator/events.ts` вызывает эти D15 paths. Шесть прямых invocation
  `findByIntegratorId`, `findByPhoneNormalized`, `updateRole`,
  `getProfileEmailFields`, `clearStaffAccountEmail` имеют живые auth/account/admin/
  notification callers и дают 6 TL.

`DELETE_BY_OWNER_STAGE=0`: у `pgBranches` нет runtime method consumer, но
`V9B_WALL_RECOMMENDATION.md` называет retirement рекомендацией и требует сначала
FK/backref proof. Это живой owner-stage `WAIT_OVERLAP`, не deletion authority.
`LOW_LEVEL_EXEMPT=0`: `infra/db/runWebappSql.ts` объявляет порт и не вызывает
`runWebappPgText`; helper/wrapper invocation не становится отдельным execution port.

## 4. Ранее пропущенные 43 файла: operation, caller и category

Перечень файлов взят только из секции 3.2 первичного FAIL (это authority списка),
а operations и back-references восстановлены по актуальному source. AST показывает,
что каждый из них generic-only относительно старого literal denominator. Точная
проверка selection:

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
const audit = fs.readFileSync('docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS_AUDIT_REPORT.md', 'utf8');
const omittedSection = audit.split('### 3.2 Полностью отсутствующие production-файлы')[1]
  .split('### 3.3 Four-way classification')[0];
const omitted = [...omittedSection.matchAll(/^\| `([^`]+)` \| (\d+) \|/gm)]
  .map((match) => ({ path: match[1], calls: Number(match[2]) }));
const report = fs.readFileSync('docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md', 'utf8');
const section = report.split('## Census by file and operation/caller authority')[1]
  .split('## Partition and reconciliation')[0];
const reportRows = [...section.matchAll(/^\| `([^`]+)` \| (\d+) \| (.+) \|$/gm)]
  .map((match) => ({ label: match[1], calls: Number(match[2]), text: match[3] }));
const selected = omitted.map((row) => {
  const reportRow = reportRows.find((candidate) => candidate.label === row.path);
  if (!reportRow) throw new Error(`missing ${row.path}`);
  const parts = [...reportRow.text.matchAll(/\b(TL|WO|DO|EX) (\d+)\b/g)]
    .map((match) => ({ category: match[1], calls: Number(match[2]) }));
  return { ...row, parts };
});
const totals = { TL: 0, WO: 0, DO: 0, EX: 0 };
for (const row of selected) for (const part of row.parts) totals[part.category] += part.calls;
console.log({ rows: selected.length, calls: selected.reduce((sum, row) => sum + row.calls, 0), totals,
  nonSingleAssignment: selected.filter((row) => row.parts.reduce((sum, part) => sum + part.calls, 0) !== row.calls) });
NODE
# { rows: 43, calls: 131, totals: { TL: 114, WO: 17, DO: 0, EX: 0 }, nonSingleAssignment: [] }
```

Ниже для каждой строки приведён независимо найденный enclosing operation и
production caller/back-reference. Для TL достаточно живого human path; для WO
назван текущий owner-stage.

| Файл | AST operation(s) и caller/back-reference | Категория |
|---|---|---:|
| `infra/idempotency/pgStore.ts` | `getCachedResponse`/`setCachedResponse` → integrator API routes, включая `integrator/events` | TL 2 |
| `infra/platformUserPurgeSql.ts` | `runPurgeClientPgText` → `platformUserFullPurge.ts` | TL 1 |
| `infra/repos/broadcastChannelCounts.ts` | `getChannelCountsByUserIds` → doctor-broadcast service через `buildAppDeps` | TL 5 |
| `infra/repos/doctorAppointmentPurgeFilter.ts` | `loadPurgedCanonicalAppointmentIds` → booking calendar/canonical appointment repos | TL 1 |
| `infra/repos/identityPhoneSql.ts` | pool/client identity bridges → identity resolution, phone bind, user-by-phone | WO 2 — D15 |
| `infra/repos/loadPlatformUserChannelBindings.ts` | одноимённый export → reminder notify route и specialist reminder tick | TL 1 |
| `infra/repos/mergeLegacySupportConversations.ts` | `mergeSqlOnClient` → live support-communication merge | TL 1 |
| `infra/repos/pgAdminClientProfileConflicts.ts` | email/phone conflict lookups → admin profile route и user projection | TL 2 |
| `infra/repos/pgAdminNotificationTargets.ts` | `loadAdminNotificationTargetsFromDb` → operator-alert runtime registration/dispatch | TL 1 |
| `infra/repos/pgAdminPlatformUserStats.ts` | `queryRows` → registration/subscriber stats service and admin route | TL 1 |
| `infra/repos/pgAdminTranscodeHealthMetrics.ts` | transcode counts → `adminTranscodeHealthMetrics.ts` | TL 2 |
| `infra/repos/pgBookingEngine.ts` | branch quota count in `createPhysicalBranchWithDefaultColor` → booking service | WO 1 — Ч4/current tariff |
| `infra/repos/pgBookingScheduling.ts` | `resolvePublicBookingOrganization` → booking scheduling/in-person resolver | WO 1 — Ч4 owns file |
| `infra/repos/pgBranches.ts` | `upsertFromProjection`/`getByIntegratorBranchId`; only DI wiring found | WO 2 — В9б retirement stage, not DO |
| `infra/repos/pgBroadcastAudit.ts` | `append`/`list` → doctor-broadcast service and delivery jobs | TL 2 |
| `infra/repos/pgCanonicalPlatformUser.ts` | six canonical lookup/merge-chain operations → auth/identity/admin repo/API backrefs | WO 6 — D15 identity seam |
| `infra/repos/pgClinicDirectory.ts` | slug resolve/canonical/availability → clinic auth, public booking, settings | TL 3 |
| `infra/repos/pgCourses.ts` | `loadCourseUsageSummary` → courses service → doctor usage API/page | TL 1 |
| `infra/repos/pgDoctorAnalyticsMetricAccounts.ts` | `queryByMetric` → doctor analytics metric-accounts route | TL 25 |
| `infra/repos/pgDoctorCalendarTimezone.ts` | `getDoctorCalendarTimezoneIana` → doctor schedule resolver/page | TL 1 |
| `infra/repos/pgDoctorNotes.ts` | `listForUser` → doctor notes API/client page/history | TL 1 |
| `infra/repos/pgDoctorProactiveInsights.ts` | support/wellbeing/program reads → proactive-insight APIs/dashboard | TL 5 |
| `infra/repos/pgEmailOtpPublic.ts` | public email user/challenge operations → email OTP/join/invite routes | TL 5 |
| `infra/repos/pgEmailPasswordLookup.ts` | auth-state queries → email password forgot/lookup/register/setup routes | TL 2 |
| `infra/repos/pgLfkAssignments.ts` | shared `pgTextTx` → `assignPublishedTemplateToPatient` service | TL 1 |
| `infra/repos/pgMaterialRating.ts` | `getDoctorDetail` queries → material-rating patient/doctor APIs | TL 3 |
| `infra/repos/pgMediaFolderLookup.ts` | `mediaFolderExists` → `s3MediaStorage.ts` | TL 1 |
| `infra/repos/pgMessageLog.ts` | `append`/user/admin lists → doctor messaging/cabinet services | TL 5 |
| `infra/repos/pgOAuthBindings.ts` | provider/user bindings reads → OAuth callbacks and check-phone | TL 2 |
| `infra/repos/pgOnlineIntake.ts` | get/list/count helpers → doctor/patient online-intake routes | TL 14 |
| `infra/repos/pgOrgEntitlements.ts` | patient snapshot/access/quota reads → layouts, guards, files/admin APIs | WO 4 — current tariff owner |
| `infra/repos/pgPasskeyStore.ts` | credential/challenge lifecycle → passkey auth module | TL 9 |
| `infra/repos/pgPasswordLoginProtection.ts` | proof/ALTCHA operations → password auth modules | TL 4 |
| `infra/repos/pgPatientMaintenanceHistory.ts` | current-patient history → patient layout | TL 1 |
| `infra/repos/pgPatientOrganization.ts` | active enrollment/program organization reads → patient/booking/integrator routes | TL 2 |
| `infra/repos/pgPatientOrganizationEnrollment.ts` | invited relationship quota count → booking engine/patient organization | WO 1 — D15 enrollment ownership (also quota work) |
| `infra/repos/pgPatientTelegramUsernameMention.ts` | username lookup → patient mention resolver | TL 1 |
| `infra/repos/pgPayments.ts` | provider-webhook organization resolve → payment/acquiring flow | TL 1 |
| `infra/repos/pgPlatformAccess.ts` | canonical access row → `/api/me` and messenger contact gate | TL 1 |
| `infra/repos/pgPlatformLfkMediaAccess.ts` | `pgCanReadPlatformLfkMedia` → platform LFK media resolver | TL 1 |
| `infra/repos/pgPublicBookingOtp.ts` | issue/consume challenge → public booking verification | TL 2 |
| `infra/repos/pgTreatmentProgram.ts` | template previews/usage → treatment-program services/routes | TL 3 |
| `infra/repos/pgTreatmentProgramItemSnapshot.ts` | catalog preview rows → treatment-program instance snapshot builder | TL 1 |

Exact back-reference probes were run only after the AST supplied operation names.
Representative command form, applied in one batch to all names above:

```sh
rg -n 'getCachedResponse|runPurgeClientPgText|getChannelCountsByUserIds|loadPurgedCanonicalAppointmentIds|runIdentityPoolPgText|loadPlatformUserChannelBindings|runMergeLegacySupportConversations|findPlatformUserIdWithEmailConflict|loadAdminNotificationTargetsFromDb|getRegistrationStats|loadAdminTranscodeMediaFileCounts|createPhysicalBranchWithDefaultColor|resolvePublicBookingOrganization|branchesProjection|broadcastAudit|resolveCanonicalUserId|clinicDirectory|loadCourseUsageSummary|doctorAnalyticsMetricAccounts|getDoctorCalendarTimezoneIana|doctorNotes|doctorProactiveInsights|emailOtpPublic|emailPasswordLookup|lfkAssignments|materialRating|mediaFolderExists|messageLog|oauthBindings|onlineIntake|orgEntitlements|passkeyStore|passwordLoginProtection|patientMaintenanceHistory|patientOrganization|ensureInvitedOrganizationClientRelationship|loadPatientTelegramUsername|payments|platformAccess|pgCanReadPlatformLfkMedia|publicBookingOtp|treatmentProgram|treatmentProgramItemSnapshot' \
  apps/webapp/src --glob '*.{ts,tsx}' --glob '!**/*.test.*' --glob '!**/*.spec.*'
```

## 5. Первый bounded live slice

### Один reachable call

AST gate из §1 находит в
`apps/webapp/src/infra/repos/pgPlaybackResolutionEvents.ts` ровно один invocation,
в `insertPlaybackResolutionEvent`. Production chain:

`resolveMediaPlaybackPayload.ts:119,192` →
`playbackResolutionEvents.ts:8` →
`pgPlaybackResolutionEvents.ts:9`.

Две строки resolver — mutually exclusive non-video и resolved video branches;
на одном successful resolution вызывается одна запись, не две.

### Нет overlap с В9б / Track D / тарифами

Сначала выполнен semantic code-search:

```sh
node /home/dev/brain/tools/code-search.mjs \
  "pgPlaybackResolutionEvents record media playback resolution event caller analytics playback payload" \
  --repo bcb -k 20
# нашёл repo, schema, accessor SQL, analytics readers и playback smoke;
# owner-stage ссылки на В9б/Track D/тарифы не найдены
```

Затем exact identifier/function/table check по owner authorities и их registries:

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
const files = [
  'docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md',
  'docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md',
  'docs/_TODO/runs/testsuite-v2/V9B_WALL_RECOMMENDATION.md',
  'docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md',
  'docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md',
  'docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md',
  'docs/CURRENT_AUTHORITY_MAP.md',
  'docs/INITIATIVES.md',
  'docs/_TODO/SAAS_FOUNDATION_PLAN_MAP_2026-08-01.md',
];
const needles = ['pgPlaybackResolutionEvents', 'record_media_playback_resolution_event', 'media_playback_resolution_events'];
console.log(files.map((file) => {
  const text = fs.readFileSync(file, 'utf8');
  return { file, hits: Object.fromEntries(needles.map((needle) => [needle, (text.match(new RegExp(needle, 'g')) ?? []).length])) };
}));
NODE
# каждый из 9 файлов: 0 / 0 / 0
```

Это не утверждение, что telemetry нигде больше не документирована: exact repo search
нашёл schema/migrations/security history и существующий playback smoke. Утверждение
уже и проверяемо: названный файл/function/table не назначены текущим В9б, Track D,
Ч4/Ч4б/current tariff или billing owner-stage.

### Existing boundary

- `infra/db/runWebappSql.ts:46` уже принимает `WebappSqlExecutor` + Drizzle `SQL` и
  исполняет `db.execute(fragment)`; `runWebappPgText` ниже — только legacy bridge.
- `db/schema/schema.ts:2211` уже объявляет `mediaPlaybackResolutionEvents`.
- `app.record_media_playback_resolution_event` уже является узким accessor; текущая
  реализация функции содержит один `INSERT INTO public.media_playback_resolution_events`
  (`0189_patient_runtime_cooldown_playback_accessors.sql:91,124`).

Следовательно slice переводится на существующие `runWebappSql<T>(..., sql\`...\`)`
и schema/read boundary без новой таблицы, порта, parser или migration.

### Настоящий behavior oracle

Oracle наблюдает не текст исходника, а поведение:

1. seed допустимых user/media/organization;
2. выполнить один playback resolution через публичный app-layer path;
3. увидеть ровно одну event row с тем же `user/media/delivery/fallback` и увидеть её
   через существующий analytics read (`adminPlaybackHealthMetrics.ts:71` либо
   `loadAdminReminderStats.ts:446,453`);
4. форсировать DB write failure и подтвердить, что playback остаётся успешным:
   `recordPlaybackResolutionEvent` ловит ошибку и пишет
   `playback_resolution_event_write_failed` (`playbackResolutionEvents.ts:8-20`).

Для позднее авторизованной implementation-проверки уже есть opt-in mutating harness
pattern: `pgEmailOtpPublicAtomicConsume.devDb.integration.test.ts` требует
`USE_REAL_DATABASE=1` + named `RUN_*_DEV_DB`, проверяет `current_database()` против
allowlist и чистит fixture; `pgAuthRateLimitEvents.devDb.integration.test.ts` показывает
тот же explicit opt-in. В этом audit DB/test не запускался и новый тест не создавался.

## Итоговый gate

Named FAIL отсутствует. Исправленный census воспроизводит единый semantic denominator,
полную per-file map, authority partition и безопасный первый slice. Дополнительный
fix-round не требуется.
