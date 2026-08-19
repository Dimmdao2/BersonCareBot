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

export function extractRelationOperations(body) {
  const schemaPattern = RELATION_SCHEMAS.join('|');
  const relationNames = [...new Set([...body.matchAll(
    new RegExp(`\\b(${schemaPattern})\\.([a-z_][a-z0-9_]*)\\b`, 'g'),
  )].map((match) => `${match[1]}.${match[2]}`))].sort();
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
