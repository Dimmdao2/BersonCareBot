import fs from 'node:fs';

const OPERATION_ORDER = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
const RELATION_SCHEMAS = ['app', 'app_ext', 'integrator', 'public'];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripSqlComments = (sql) => {
  let output = '';
  let index = 0;
  while (index < sql.length) {
    const quote = sql[index];
    if (quote === "'" || quote === '"') {
      const start = index;
      index += 1;
      while (index < sql.length) {
        if (sql[index] === quote && sql[index + 1] === quote) { index += 2; continue; }
        if (sql[index] === quote) { index += 1; break; }
        index += 1;
      }
      output += sql.slice(start, index);
      continue;
    }
    const dollar = sql.slice(index).match(/^\$[a-z_0-9]*\$/i);
    if (dollar) {
      const close = sql.indexOf(dollar[0], index + dollar[0].length);
      const end = close < 0 ? index + dollar[0].length : close + dollar[0].length;
      output += sql.slice(index, end);
      index = end;
      continue;
    }
    if (sql.startsWith('--', index)) {
      const newline = sql.indexOf('\n', index + 2);
      index = newline < 0 ? sql.length : newline;
      output += ' ';
      continue;
    }
    if (sql.startsWith('/*', index)) {
      const close = sql.indexOf('*/', index + 2);
      index = close < 0 ? sql.length : close + 2;
      output += ' ';
      continue;
    }
    output += sql[index];
    index += 1;
  }
  return output;
};

export function parseExecutableFunctions(sql) {
  const functions = [];
  const pattern = /create\s+(?:or\s+replace\s+)?function\s+((?:app|app_ext|integrator|public)\.[a-z_][a-z0-9_]*)\s*\([\s\S]*?\)\s*([\s\S]*?)\bas\s+(\$[a-z_][a-z0-9_]*\$|\$\$)([\s\S]*?)\3\s*;/gi;
  for (const match of sql.matchAll(pattern)) {
    functions.push({
      name: match[1].toLowerCase(),
      securityDefiner: /\bsecurity\s+definer\b/i.test(match[2]),
      body: stripSqlComments(match[4]).toLowerCase(),
    });
  }
  return functions;
}

/** Words that sit where a table alias would, but are not one. */
const SQL_NOISE_AFTER_RELATION = new Set([
  'as', 'on', 'where', 'order', 'group', 'having', 'limit', 'offset', 'for', 'inner', 'left',
  'right', 'full', 'cross', 'join', 'using', 'set', 'values', 'returning', 'select', 'and', 'or',
  'union', 'except', 'intersect', 'window', 'fetch',
]);

const LOCKING_CLAUSE = /\bfor\s+(?:no\s+key\s+update|key\s+share|update|share)\b(?:\s+of\s+([a-z_][a-z0-9_]*(?:\s*,\s*[a-z_][a-z0-9_]*)*))?/g;

/** Parenthesis nesting depth at every position; a bracket itself belongs to the outer level. */
function parenDepths(text) {
  const depths = new Array(text.length);
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '(') { depths[index] = depth; depth += 1; continue; }
    if (text[index] === ')') { depth -= 1; depths[index] = depth; continue; }
    depths[index] = depth;
  }
  return depths;
}

/**
 * Relations whose rows the body locks with an explicit locking clause.
 *
 * PostgreSQL rule, verified against the live DEV database: a bare `FOR UPDATE` locks every table of
 * its own `FROM`/`JOIN` list and leaves subqueries alone, while `FOR UPDATE OF <alias>` locks only
 * the named ones. Scope is therefore taken by the parenthesis depth of the clause itself: a
 * subquery sits deeper, a CTE body is its own group.
 */
export function rowLockedRelations(body) {
  const schemaPattern = RELATION_SCHEMAS.join('|');
  const relationHead = new RegExp(`^(?:${schemaPattern})\\.[a-z_][a-z0-9_]*`);
  const sourcePattern = new RegExp(`\\b(?:${schemaPattern})\\.[a-z_][a-z0-9_]*\\b(?:\\s+as)?(?:\\s+([a-z_][a-z0-9_]*))?`, 'g');
  const depths = parenDepths(body);
  const locked = new Set();
  for (const clause of body.matchAll(LOCKING_CLAUSE)) {
    const lockDepth = depths[clause.index];
    let scopeStart = body.lastIndexOf(';', clause.index) + 1;
    for (let index = clause.index; index >= scopeStart; index -= 1) {
      if (body[index] === '(' && depths[index] === lockDepth - 1) { scopeStart = index + 1; break; }
    }
    const named = clause[1] ? new Set(clause[1].split(',').map((alias) => alias.trim())) : null;
    for (const source of body.slice(scopeStart, clause.index).matchAll(sourcePattern)) {
      if (depths[scopeStart + source.index] !== lockDepth) continue;
      const relation = source[0].match(relationHead)[0];
      // `app.some_function(...)` inside the WHERE clause is a call, not a locked source.
      if (body[scopeStart + source.index + relation.length] === '(') continue;
      const alias = source[1] && !SQL_NOISE_AFTER_RELATION.has(source[1]) ? source[1] : null;
      if (named && !named.has(alias ?? relation.slice(relation.indexOf('.') + 1))) continue;
      locked.add(relation);
    }
  }
  return locked;
}

export function extractRelationOperations(body) {
  const schemaPattern = RELATION_SCHEMAS.join('|');
  const relationNames = [...new Set([...body.matchAll(
    new RegExp(`\\b(${schemaPattern})\\.([a-z_][a-z0-9_]*)\\b`, 'g'),
  )].map((match) => `${match[1]}.${match[2]}`))].sort();
  const locked = rowLockedRelations(body);
  const result = new Map();

  for (const relation of relationNames) {
    const escaped = escapeRegExp(relation);
    const operations = new Set();
    const insert = new RegExp(`\\binsert\\s+into\\s+${escaped}\\b`, 'g');
    const update = new RegExp(`\\bupdate\\s+(?:only\\s+)?${escaped}\\b`, 'g');
    const deletion = new RegExp(`\\bdelete\\s+from\\s+${escaped}\\b`, 'g');

    if (insert.test(body)) operations.add('INSERT');
    if (update.test(body)) operations.add('UPDATE');
    if (deletion.test(body)) operations.add('DELETE');

    const read = new RegExp(`\\b(from|join|using)\\s+${escaped}\\b`, 'g');
    for (const match of body.matchAll(read)) {
      const prefix = body.slice(Math.max(0, match.index - 24), match.index);
      // `IS [NOT] DISTINCT FROM app.f()` is a comparison operator, never a FROM clause: without
      // this the lexical upper bound reports a read of a relation the body never touches.
      if (match[1] === 'from' && /\bdistinct\s+$/.test(prefix)) continue;
      if (match[1] !== 'from' || !/delete\s+$/.test(prefix)) operations.add('SELECT');
    }
    if (new RegExp(`\\bfrom\\b[^;]*,\\s*${escaped}\\b`).test(body)) operations.add('SELECT');

    for (const match of body.matchAll(new RegExp(`\\binsert\\s+into\\s+${escaped}\\b[^;]*`, 'g'))) {
      const statement = match[0];
      if (/\bon\s+conflict\b[^;]*\bdo\s+update\b/.test(statement)) {
        operations.add('UPDATE');
        operations.add('SELECT');
      }
      if (/\bon\s+conflict\s+(?:\(|on\s+constraint\b)[^;]*\bdo\s+nothing\b/.test(statement)) {
        operations.add('SELECT');
      }
      if (/\breturning\b/.test(statement)) operations.add('SELECT');
    }
    for (const match of body.matchAll(new RegExp(`\\bupdate\\s+(?:only\\s+)?${escaped}\\b[^;]*`, 'g'))) {
      if (/\b(where|returning)\b/.test(match[0])) operations.add('SELECT');
    }
    for (const match of body.matchAll(new RegExp(`\\bdelete\\s+from\\s+${escaped}\\b[^;]*`, 'g'))) {
      if (/\b(where|returning)\b/.test(match[0])) operations.add('SELECT');
    }

    // A row lock (`FOR UPDATE`/`FOR SHARE` and relatives) is not a read: PostgreSQL charges it an
    // UPDATE-class privilege, and a column-level SELECT never satisfies it. Without this line the
    // lexical upper bound calls such a table merely readable, the declaration grants the seam owner
    // SELECT alone, and the live SECURITY DEFINER call dies with 42501 — exactly how the email-code
    // login broke on 21.08.
    if (operations.has('SELECT') && locked.has(relation)) operations.add('UPDATE');

    if (operations.size > 0) {
      result.set(relation, OPERATION_ORDER.filter((operation) => operations.has(operation)));
    }
  }
  return result;
}

export const extractPublicRelationOperations = extractRelationOperations;

export function currentPatientArtifactFunctions(paths) {
  return paths.flatMap((file) => parseExecutableFunctions(fs.readFileSync(file, 'utf8')));
}

/** Latest active B0-forward definition for every function name in migration order. */
export function latestArtifactFunctions(paths) {
  const latest = new Map();
  for (const file of paths) {
    for (const fn of parseExecutableFunctions(fs.readFileSync(file, 'utf8'))) latest.set(fn.name, fn);
  }
  return [...latest.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function compareFunctionSurfaces(functions, declaredFunctions) {
  const gaps = [];
  for (const fn of functions) {
    const candidates = Object.entries(declaredFunctions)
      .filter(([signature]) => signature.startsWith(`${fn.name}(`));
    if (candidates.length !== 1) {
      gaps.push(`${fn.name}: expected one exact declaration identity, found ${candidates.length}`);
      continue;
    }
    const [signature, declaration] = candidates[0];
    const actual = extractRelationOperations(fn.body);
    // A delegated SECURITY DEFINER call reads as `FROM schema.fn(...)` lexically identically to a
    // table read, but its access is tracked and generated through `delegatesTo`/EXECUTE, never
    // through `relationSurfaces` (`generate.mjs` rejects a relationSurface whose `relation` isn't a
    // real table). Without this, any B0-forward function that calls another door via `FROM fn() AS
    // x` — the only plpgsql syntax for invoking a set-returning function — reports a phantom gap
    // for a relation that was never meant to appear in relationSurfaces at all.
    for (const delegated of declaration.delegatesTo ?? []) {
      actual.delete(delegated.slice(0, delegated.indexOf('(')));
    }
    const declared = new Map((declaration.relationSurfaces ?? [])
      .map((surface) => [surface.relation, [...surface.operations].sort()]));
    for (const relation of [...new Set([...actual.keys(), ...declared.keys()])].sort()) {
      const actualOperations = actual.get(relation);
      const declaredOperations = declared.get(relation);
      if (!actualOperations) {
        gaps.push(`${signature} -> ${relation}: declared surface has no executable relation operation`);
      } else if (!declaredOperations) {
        gaps.push(`${signature} -> ${relation}: executable relation surface is absent; actual=${actualOperations.join(',')}`);
      } else {
        const expected = [...actualOperations].sort();
        if (expected.join(',') !== declaredOperations.join(',')) {
          gaps.push(`${signature} -> ${relation}: actual=${expected.join(',')} declared=${declaredOperations.join(',')}`);
        }
      }
    }
  }
  return gaps.sort();
}

/** Closing index of the bracket that opens at `open`, or -1 if the body never closes it. */
function matchParen(body, open) {
  let depth = 0;
  for (let index = open; index < body.length; index += 1) {
    if (body[index] === '(') depth += 1;
    else if (body[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Top-level comma split: a comma inside brackets belongs to the expression, not to the list. */
function splitTopLevel(list) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const character of list) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += character;
  }
  parts.push(current.trim());
  return parts;
}

const stripTrailingCast = (expression) => expression.replace(/::[a-z_][a-z0-9_. []]*$/, '').trim();

/**
 * Which column of an `INSERT … VALUES` each expression lands in.
 *
 * Column list and VALUES tuple are two parallel lists that PostgreSQL matches BY POSITION and never
 * by name: swap two entries on one side only, and the statement still compiles, still runs, and
 * writes each value into the neighbouring column. Returns one binding per column —
 * `{ relation, column, expression, parameter }`, where `parameter` is the root parameter the
 * expression is fed from (`p_x`, also through a single `v_x := p_x::type` normalisation) or null
 * when the value is a literal, `now()` or any other expression that no parameter reaches.
 * `column` is null when the two lists have different lengths — that is itself the finding.
 */
export function insertColumnBindings(body) {
  const assignments = new Map();
  for (const assignment of body.matchAll(/\b(v_[a-z0-9_]+)\s*:=\s*([^;]+);/g)) {
    if (!assignments.has(assignment[1])) assignments.set(assignment[1], assignment[2].trim());
  }
  const schemaPattern = RELATION_SCHEMAS.join('|');
  const head = new RegExp(`\\binsert\\s+into\\s+((?:${schemaPattern})\\.[a-z_][a-z0-9_]*)\\s*\\(`, 'g');
  const bindings = [];
  for (const match of body.matchAll(head)) {
    const columnsOpen = match.index + match[0].length - 1;
    const columnsClose = matchParen(body, columnsOpen);
    if (columnsClose < 0) continue;
    const afterColumns = body.slice(columnsClose + 1).match(/^\s*values\s*\(/);
    if (!afterColumns) continue;
    const valuesOpen = columnsClose + afterColumns[0].length;
    const valuesClose = matchParen(body, valuesOpen);
    if (valuesClose < 0) continue;
    const relation = match[1];
    const columns = splitTopLevel(body.slice(columnsOpen + 1, columnsClose));
    const expressions = splitTopLevel(body.slice(valuesOpen + 1, valuesClose));
    if (columns.length !== expressions.length) {
      bindings.push({ relation, column: null, expression: `${columns.length} columns / ${expressions.length} values`, parameter: null });
      continue;
    }
    for (let index = 0; index < columns.length; index += 1) {
      let source = stripTrailingCast(expressions[index]);
      if (assignments.has(source)) source = stripTrailingCast(assignments.get(source));
      bindings.push({
        relation,
        column: columns[index],
        expression: expressions[index],
        parameter: /^p_[a-z0-9_]+$/.test(source) ? source : null,
      });
    }
  }
  return bindings;
}
