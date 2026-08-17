import fs from 'node:fs';

const OPERATION_ORDER = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripSqlComments = (sql) => sql
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/--[^\n]*/g, ' ');

export function parseExecutableFunctions(sql) {
  const functions = [];
  const pattern = /create\s+or\s+replace\s+function\s+(app\.[a-z_][a-z0-9_]*)\s*\([\s\S]*?\)\s*returns\s+[\s\S]*?\bas\s+\$function\$([\s\S]*?)\$function\$\s*;/gi;
  for (const match of sql.matchAll(pattern)) {
    functions.push({ name: match[1].toLowerCase(), body: stripSqlComments(match[2]).toLowerCase() });
  }
  return functions;
}

export function extractPublicRelationOperations(body) {
  const relationNames = [...new Set([...body.matchAll(/\bpublic\.([a-z_][a-z0-9_]*)\b/g)]
    .map((match) => `public.${match[1]}`))].sort();
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
      const prefix = body.slice(Math.max(0, match.index - 16), match.index);
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

export function currentPatientArtifactFunctions(paths) {
  return paths.flatMap((file) => parseExecutableFunctions(fs.readFileSync(file, 'utf8')));
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
    const actual = extractPublicRelationOperations(fn.body);
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
