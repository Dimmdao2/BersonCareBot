# RAW_SQL_TEXT_CENSUS fix-round report (#1082)

## Result

Corrected `RAW_SQL_TEXT_CENSUS.md` only, using the independent FAIL audit as the
implementation authority. No product code, SQL conversion, schema/migration,
DB/DEV/TEST/PROD operation, deploy, or permanent source-text test/script was added.

The denominator is now AST semantic `runWebappPgText` calls, including generic
forms: **557 invocations in 87 production files**. The map includes all **43**
previously omitted generic-only files, corrects `pgDoctorBroadcastDelivery` to 3,
`pgReferences` to 22, and `pgSupportCommunication` to 52, and records the latter
as **21 WO + 31 TL**.

The category reconciliation is **388 TL + 169 WO + 0 DO + 0 EX = 557**. `pgBranches`
remains WO: no runtime method consumer is not an owner-approved deletion authority.
The first bounded live slice is now `infra/repos/pgPlaybackResolutionEvents.ts`
(one semantic call), with the existing `runWebappSql<T>(SQL)` / Drizzle `sql`
boundary and the named opt-in DEV-DB behavior oracle.

## Commands executed and results

```sh
# AST semantic invocation census (the exact command is embedded in RAW_SQL_TEXT_CENSUS.md)
node --input-type=module <<'NODE'
// TypeScript AST walk over production apps/webapp/src files for CallExpression
// identifier runWebappPgText, including generic calls.
NODE
# { candidateFiles: 88, invocationFiles: 87, semanticCalls: 557 }

# Parse the report census table.
node --input-type=module <<'NODE'
// Parse rows between “Census by file...” and “Partition...” and sum calls.
NODE
# { rows: 87, claimedSum: 557 }

# Parse TL/WO markers in the same table.
node --input-type=module <<'NODE'
// Sum TL, WO, DO, EX per-row partitions.
NODE
# { TL: 388, WO: 169, DO: 0, EX: 0 } { total: 557 }

# Compare audit omission rows with the corrected census table.
node --input-type=module <<'NODE'
// Extract the 3.2 audit table and assert each path appears in the census table.
NODE
# { omittedRows: 43, missing: [] }

git diff --check
# exit 0
```

The report itself contains the complete repeatable AST command, table parser,
reconciliation arithmetic, and caller-reachability searches. The abbreviated
heredocs above document the commands' purpose and their directly observed output;
they are not added as repository scripts.

## First bounded live slice — playback telemetry (2026-08-02)

`apps/webapp/src/infra/repos/pgPlaybackResolutionEvents.ts` now calls the existing
`app.record_media_playback_resolution_event` through `getWebappSqlDb()` and
`runWebappSql(db, sql\`...\`)`. Its four values are Drizzle-bound interpolations;
the caller remains best-effort in `playbackResolutionEvents.ts`. No schema,
migration, helper/port, test, or DB/DEV/TEST/PROD operation was added or run.

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import ts from 'typescript';
const file = 'apps/webapp/src/infra/repos/pgPlaybackResolutionEvents.ts';
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const counts = { runWebappPgText: 0, runWebappSql: 0 };
function visit(node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text in counts) counts[node.expression.text] += 1;
  ts.forEachChild(node, visit);
}
visit(source);
console.log({ file, ...counts });
if (counts.runWebappPgText !== 0 || counts.runWebappSql !== 1) process.exitCode = 1;
NODE
# { file: 'apps/webapp/src/infra/repos/pgPlaybackResolutionEvents.ts', runWebappPgText: 0, runWebappSql: 1 }

pnpm --dir apps/webapp run typecheck
# exit 0

pnpm --dir apps/webapp exec eslint src/infra/repos/pgPlaybackResolutionEvents.ts
# exit 0

git diff --check
# exit 0
```
