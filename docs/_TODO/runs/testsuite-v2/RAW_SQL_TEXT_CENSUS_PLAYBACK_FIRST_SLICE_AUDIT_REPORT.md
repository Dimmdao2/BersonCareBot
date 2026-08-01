# Независимый аудит первого playback SQL-text slice (#1082)

**Candidate:** `1c020485cfcd308dc06fe5ce1dfb189ca9558044`
**Verdict:** **PASS**.

`pgPlaybackResolutionEvents.ts` replaces its sole legacy `runWebappPgText` call with
one `runWebappSql(getWebappSqlDb(), sql\`...\`)` call. AST inspection found
`runWebappPgText: 0`, `runWebappSql: 1`, `sql.raw: 0`, and exactly these bound
expressions in order: `input.userId`, `input.mediaId`, `input.delivery`,
`input.fallbackUsed`. Compiling that fragment with `new PgDialect().sqlToQuery()`
produced `SELECT app.record_media_playback_resolution_event($1::uuid, $2::uuid,
$3, $4)` and the same four values in order.

The function signature remains
`app.record_media_playback_resolution_event(uuid,uuid,text,boolean)`; its caller's
`try/catch` best-effort behavior and analytics readers are outside, and unchanged by,
the candidate diff. `git diff --name-status 1c020485c^ 1c020485c` reports only the
repository file and the pre-existing fix evidence report; no helper, port, schema, or
migration was added.

Exact checks run:

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import ts from '/home/dev/.local/share/pnpm/global/5/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js';
const f = 'apps/webapp/src/infra/repos/pgPlaybackResolutionEvents.ts';
const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const c = { runWebappPgText: 0, runWebappSql: 0, sqlRaw: 0 }; let values = [];
const name = (n) => ts.isIdentifier(n) ? n.text : ts.isPropertyAccessExpression(n) ? `${name(n.expression)}.${n.name.text}` : n.getText(sf);
function visit(n) {
  if (ts.isCallExpression(n) && name(n.expression) in c) c[name(n.expression)] += 1;
  if (ts.isTaggedTemplateExpression(n) && name(n.tag) === 'sql' && ts.isTemplateExpression(n.template)) values = n.template.templateSpans.map((s) => name(s.expression));
  ts.forEachChild(n, visit);
}
visit(sf); console.log({ f, ...c, values });
if (c.runWebappPgText || c.runWebappSql !== 1 || c.sqlRaw || values.join() !== 'input.userId,input.mediaId,input.delivery,input.fallbackUsed') process.exit(1);
NODE
# { f: 'apps/webapp/src/infra/repos/pgPlaybackResolutionEvents.ts', runWebappPgText: 0, runWebappSql: 1, sqlRaw: 0, values: [ 'input.userId', 'input.mediaId', 'input.delivery', 'input.fallbackUsed' ] }

node --input-type=module <<'NODE'
import { sql } from './apps/webapp/node_modules/drizzle-orm/index.js';
import { PgDialect } from './apps/webapp/node_modules/drizzle-orm/pg-core/index.js';
const u = '11111111-1111-4111-8111-111111111111', m = '22222222-2222-4222-8222-222222222222';
console.log(new PgDialect().sqlToQuery(sql`SELECT app.record_media_playback_resolution_event(${u}::uuid, ${m}::uuid, ${'hls'}, ${false})`));
NODE
# { sql: 'SELECT app.record_media_playback_resolution_event($1::uuid, $2::uuid, $3, $4)', params: [ '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'hls', false ] }

pnpm --dir packages/operator-db-schema run build
pnpm --dir packages/db-principal run build
pnpm --dir packages/error-tracking run build
pnpm --dir packages/platform-merge run build
pnpm --dir apps/webapp run typecheck
pnpm --dir apps/webapp exec eslint src/infra/repos/pgPlaybackResolutionEvents.ts
git diff --check 1c020485c^ 1c020485c
```

All commands exited `0`. The four package builds only supplied absent local
TypeScript workspace declarations after the initial typecheck could not resolve them.
No DB, DEV, TEST, or PROD operation; no product fix; no permanent test or harness.
