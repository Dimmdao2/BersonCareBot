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
