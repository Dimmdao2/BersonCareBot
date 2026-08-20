/**
 * What the applied part of the Drizzle journal PROMISES the database currently contains.
 *
 * The ledger answers one question — "was this migration ever run" — and it answers it from its own
 * rows, never from the catalog.  Anything that removes an object afterwards therefore leaves the
 * ledger saying "applied" over a hole, and the watermark migrator, which picks pending work by
 * `created_at`, will never look at that migration again.  This has now happened twice on the shared
 * DEV database: a reconcile run from a neighbouring branch drops every SECURITY DEFINER function of
 * a managed schema that its own declaration does not list, which includes every door an unlanded
 * branch has just created.
 *
 * So the promise has to be reconstructed from the migration files themselves and compared with the
 * catalog.  Post-B0 migrations create exactly one kind of durable object — functions (measured
 * 2026-08-19: 140 `CREATE FUNCTION`, 4 `DROP FUNCTION`, no `CREATE TABLE/VIEW/TRIGGER`, no
 * `RENAME`) — so a fold of creates and drops over the APPLIED entries, in journal order, is the
 * exact set of functions the ledger claims to be standing.
 *
 * Only applied entries are folded: a pending migration that drops a function has not dropped it
 * yet, and a pending migration that creates one is not promised by anybody.
 */

/**
 * Type names PostgreSQL spells with more than one word.  They matter only for the unnamed-argument
 * form (`FUNCTION f(timestamp with time zone)`), where the first word must not be mistaken for an
 * argument name.
 */
const MULTI_WORD_TYPE_HEADS = new Set([
  'timestamp',
  'time',
  'double',
  'character',
  'bit',
  'interval',
]);

function splitTopLevelArguments(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  let quote = null;
  for (const character of text) {
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      current += character;
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * One declared argument -> the type PostgreSQL puts in the function's identity.  `OUT` arguments
 * are reported separately because `regprocedure` does not carry them.
 */
function declaredArgument(declaration) {
  let rest = declaration.replaceAll(/\s+/gu, ' ').trim();
  const mode = /^(IN|OUT|INOUT|VARIADIC)\s+/iu.exec(rest);
  let out = false;
  if (mode) {
    out = mode[1].toUpperCase() === 'OUT';
    rest = rest.slice(mode[0].length);
  }
  // `\b` rather than `\s+`: the default EXPRESSION may already be blanked out as a string literal,
  // leaving the keyword with nothing after it.
  rest = rest.replace(/\s+DEFAULT\b[\s\S]*$/iu, '').replace(/\s*=\s*[\s\S]*$/u, '').trim();
  const head = rest.split(' ')[0];
  const tail = rest.slice(head.length).trim();
  const named = tail.length > 0 && !MULTI_WORD_TYPE_HEADS.has(head.toLowerCase().replace(/[[(].*$/u, ''));
  return { out, type: (named ? tail : rest).toLowerCase().replaceAll(/\s+/gu, ' ') };
}

/**
 * Blank out everything PostgreSQL does not read as code: line and block comments, string and
 * dollar-quoted literals (which is where every function BODY lives).  Without this a migration that
 * merely MENTIONS a function — in one of this repository's long Russian rationale comments, or in a
 * `RAISE NOTICE` inside a body — would be read as a promise, and the gate would demand an object
 * nobody ever created.  Blanking keeps the length, so nothing downstream has to care.
 */
function stripNonCode(source) {
  let out = '';
  let i = 0;
  const blank = (from, to) => source.slice(from, to).replaceAll(/[^\n]/gu, ' ');
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '--') {
      const end = source.indexOf('\n', i);
      const stop = end < 0 ? source.length : end;
      out += blank(i, stop);
      i = stop;
      continue;
    }
    if (two === '/*') {
      let depth = 0;
      let j = i;
      while (j < source.length) {
        if (source.slice(j, j + 2) === '/*') { depth += 1; j += 2; continue; }
        if (source.slice(j, j + 2) === '*/') { depth -= 1; j += 2; if (depth === 0) break; continue; }
        j += 1;
      }
      out += blank(i, j);
      i = j;
      continue;
    }
    if (source[i] === "'") {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "'" && source[j + 1] === "'") { j += 2; continue; }
        if (source[j] === "'") { j += 1; break; }
        j += 1;
      }
      out += blank(i, j);
      i = j;
      continue;
    }
    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/u.exec(source.slice(i));
    if (dollar) {
      const close = source.indexOf(dollar[0], i + dollar[0].length);
      const stop = close < 0 ? source.length : close + dollar[0].length;
      out += blank(i, stop);
      i = stop;
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

function closingParenthesis(source, openIndex, tag) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`migration ${tag} has an unbalanced function argument list`);
}

/**
 * Every function this migration creates or drops, in statement order.  Identities come out in the
 * shape `schema.name(type,type)`, which is what `to_regprocedure` takes and what `regprocedure`
 * prints back, so the comparison never has to normalise type names by hand.
 */
export function parseFunctionStatements(rawSource, tag) {
  const source = stripNonCode(rawSource);
  const statements = [];
  const pattern =
    /\b(CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|DROP\s+FUNCTION(?:\s+IF\s+EXISTS)?)\s+([a-z_][a-z_0-9]*)\s*\.\s*([a-z_][a-z_0-9]*)\s*\(/giu;
  let match = pattern.exec(source);
  while (match) {
    const open = match.index + match[0].length - 1;
    const close = closingParenthesis(source, open, tag);
    const types = splitTopLevelArguments(source.slice(open + 1, close))
      .map(declaredArgument)
      .filter((argument) => !argument.out)
      .map((argument) => argument.type);
    statements.push({
      kind: /^CREATE/iu.test(match[1]) ? 'create' : 'drop',
      identity: `${match[2].toLowerCase()}.${match[3].toLowerCase()}(${types.join(',')})`,
    });
    pattern.lastIndex = close;
    match = pattern.exec(source);
  }
  return statements;
}

/**
 * Fold the applied migrations, oldest first, into `identity -> tag that last created it`.
 * `appliedWhens` is the set of `created_at` values the ledger actually holds.
 */
export function functionsPromisedByLedger(migrations, appliedWhens) {
  const promised = new Map();
  const ordered = [...migrations].sort((left, right) => left.when - right.when);
  for (const migration of ordered) {
    if (!appliedWhens.has(migration.when)) continue;
    for (const statement of parseFunctionStatements(migration.source, migration.tag)) {
      if (statement.kind === 'drop') promised.delete(statement.identity);
      else promised.set(statement.identity, migration.tag);
    }
  }
  return promised;
}
