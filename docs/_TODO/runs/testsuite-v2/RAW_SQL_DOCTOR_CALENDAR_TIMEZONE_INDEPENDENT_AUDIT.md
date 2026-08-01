# Raw SQL doctor calendar timezone — independent inspection audit (#1082)

## Verdict: PASS

This is a one-time transport conversion, so the required proof is inspection,
not a new source-shape or DB test. No DB, DEV, TEST runtime, PROD, deploy, or
taskdb action was performed. The plan checkbox remains open.

## Scope and contract inspection

Candidate `d1e473174` changes exactly two paths relative to its first parent:

```sh
git diff --name-status d1e473174^ d1e473174
# M apps/webapp/src/infra/repos/pgDoctorCalendarTimezone.ts
# A docs/_TODO/runs/single-entry/RAW_SQL_DOCTOR_CALENDAR_TIMEZONE_REPORT.md
```

The repository change is the requested Drizzle read only: existing
`platformUsers` schema plus `getWebappSqlDb()`,
`eq(platformUsers.id, platformUserId)`, and `limit(1)`. It retains
`DoctorCalendarTimezonePort`, its callers, no role or organization predicate,
and `rows[0]?.calendarTimezone ?? null`; therefore missing-row, nullable-column,
and error propagation semantics are unchanged. No new abstraction or SQL text
was added.

```sh
rg -n 'runWebappPgText|\$[0-9]+|webappSqlFromPgText|sql\.raw' \
  apps/webapp/src/infra/repos/pgDoctorCalendarTimezone.ts
# exit 1 (no matches)
```

## Exact direct-bridge AST census

Executed from the repository root on the corrected product base (`HEAD`, which
contains merge `986516695`):

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
  if (fileCalls) invocationFiles += 1;
}
console.log({ candidateFiles: candidates.length, invocationFiles, semanticCalls });
NODE
# { candidateFiles: 84, invocationFiles: 83, semanticCalls: 551 }
```

The same command in a detached inspection worktree at corrected-base parent
`986516695^2` (`4e336d856a7541d81732c032b977f4c84f8464a6`) produced:

```text
{ candidateFiles: 85, invocationFiles: 84, semanticCalls: 552 }
```

The direct AST denominator therefore changes by exactly **−1 invocation file /
−1 call**. The broad production `$n` pattern census is separate: it returned
**103 files**, with **25** outside the direct bridge candidate set. It must not
be reported as the complete remaining raw-SQL-text denominator.

## Validation

All commands exited 0:

```sh
pnpm --dir apps/webapp exec eslint src/infra/repos/pgDoctorCalendarTimezone.ts
pnpm --dir apps/webapp typecheck
node scripts/check-no-new-raw-sql.mjs
git diff --check
```

The worker report's pre-merge absolute counts were stale; it was corrected to
the measured 84/552 → 83/551 delta. No product fix was made by this audit.
