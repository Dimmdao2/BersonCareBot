#!/usr/bin/env node

/**
 * One-shot forensic census of declared PostgreSQL function relation surfaces.
 *
 * This deliberately does not import the product body parser.  It reconstructs the
 * accepted B0 function bodies from the last pre-B0 schema snapshot, overlays the
 * active B0-forward migrations, tokenizes the SQL/PLpgSQL bodies, and compares
 * relation × operation requirements with the current declaration.
 *
 * The historical object is evidence only.  It is never executed or used as a
 * migration/bootstrap source.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import declaration from '../../deploy/postgres/privileges/declaration.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const B0_EVIDENCE_COMMIT = '2e8ffe851a404da1894cb20b5b9d27e2dd409394';
const B0_EVIDENCE_PATH = 'deploy/postgres/generated/prod-to-target/schema-pre.sql';
const MIGRATION_DIR = path.join(ROOT, 'apps/webapp/db/drizzle-migrations');
const PORT_CONTEXT_CONTRACT = path.join(ROOT, 'deploy/postgres/port-context/contract.sql');
const TEST_FIXTURE = path.join(ROOT, 'deploy/postgres/test-saas-isolation-telemetry-fixtures.sql');
const OPERATION_ORDER = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
const CLAUSE_END = new Set(['where', 'group', 'order', 'limit', 'offset', 'returning', 'set', 'values', 'on']);
const outputFlag = process.argv.indexOf('--output');
const outputPath = outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined;
if (outputFlag >= 0 && !outputPath) throw new Error('--output requires a path');

function stripComments(text) {
  let output = '';
  let index = 0;
  while (index < text.length) {
    if (text[index] === "'") {
      const start = index;
      index += 1;
      while (index < text.length) {
        if (text[index] === "'" && text[index + 1] === "'") { index += 2; continue; }
        if (text[index] === "'") { index += 1; break; }
        index += 1;
      }
      output += text.slice(start, index);
      continue;
    }
    if (text[index] === '"') {
      const start = index;
      index += 1;
      while (index < text.length) {
        if (text[index] === '"' && text[index + 1] === '"') { index += 2; continue; }
        if (text[index] === '"') { index += 1; break; }
        index += 1;
      }
      output += text.slice(start, index);
      continue;
    }
    const dollar = text.slice(index).match(/^\$[a-zA-Z_0-9]*\$/u);
    if (dollar) {
      const close = text.indexOf(dollar[0], index + dollar[0].length);
      const end = close < 0 ? index + dollar[0].length : close + dollar[0].length;
      output += text.slice(index, end);
      index = end;
      continue;
    }
    if (text.startsWith('--', index)) {
      const newline = text.indexOf('\n', index + 2);
      index = newline < 0 ? text.length : newline;
      output += ' ';
      continue;
    }
    if (text.startsWith('/*', index)) {
      const close = text.indexOf('*/', index + 2);
      index = close < 0 ? text.length : close + 2;
      output += ' ';
      continue;
    }
    output += text[index];
    index += 1;
  }
  return output;
}

function extractFunctions(sourceName, text) {
  const result = [];
  const pattern = /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+([a-zA-Z_][\w$]*\.[a-zA-Z_][\w$]*)\s*\([\s\S]*?\)\s+RETURNS[\s\S]*?\bAS\s+(\$[a-zA-Z_0-9]*\$)([\s\S]*?)\2\s*;/gimu;
  for (const match of text.matchAll(pattern)) {
    result.push({ name: match[1].toLowerCase(), body: stripComments(match[3]), source: sourceName });
  }
  return result;
}

function loadBodies() {
  const bodies = new Map();
  const relations = new Set();
  const collectRelations = (text) => {
    for (const match of text.matchAll(/CREATE\s+(?:UNLOGGED\s+)?(?:TABLE|(?:MATERIALIZED\s+)?VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][\w$]*\.[a-zA-Z_][\w$]*)/gimu)) {
      relations.add(match[1].toLowerCase());
    }
  };
  const baseline = execFileSync('git', ['show', `${B0_EVIDENCE_COMMIT}:${B0_EVIDENCE_PATH}`], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });
  collectRelations(baseline);
  for (const fn of extractFunctions(`${B0_EVIDENCE_COMMIT}:${B0_EVIDENCE_PATH}`, baseline)) {
    bodies.set(fn.name, fn);
  }
  for (const file of fs.readdirSync(MIGRATION_DIR).filter((entry) => entry.endsWith('.sql')).sort()) {
    const absolute = path.join(MIGRATION_DIR, file);
    const text = fs.readFileSync(absolute, 'utf8');
    collectRelations(text);
    for (const fn of extractFunctions(path.relative(ROOT, absolute), text)) {
      bodies.set(fn.name, fn);
    }
  }
  const portContext = fs.readFileSync(PORT_CONTEXT_CONTRACT, 'utf8');
  collectRelations(portContext);
  for (const fn of extractFunctions(path.relative(ROOT, PORT_CONTEXT_CONTRACT), portContext)) {
    bodies.set(fn.name, fn);
  }
  for (const fn of extractFunctions(path.relative(ROOT, TEST_FIXTURE), fs.readFileSync(TEST_FIXTURE, 'utf8'))) {
    bodies.set(fn.name, fn);
  }
  return { bodies, relations };
}

function tokenize(body) {
  const tokens = [];
  let index = 0;
  while (index < body.length) {
    const rest = body.slice(index);
    const whitespace = rest.match(/^\s+/u);
    if (whitespace) { index += whitespace[0].length; continue; }
    if (rest.startsWith("'")) {
      let end = 1;
      while (end < rest.length) {
        if (rest[end] === "'" && rest[end + 1] === "'") { end += 2; continue; }
        if (rest[end] === "'") { end += 1; break; }
        end += 1;
      }
      tokens.push({ value: '<string>', index, kind: 'string' });
      index += end;
      continue;
    }
    if (rest.startsWith('"')) {
      let end = 1;
      let value = '';
      while (end < rest.length) {
        if (rest[end] === '"' && rest[end + 1] === '"') { value += '"'; end += 2; continue; }
        if (rest[end] === '"') { end += 1; break; }
        value += rest[end];
        end += 1;
      }
      tokens.push({ value: value.toLowerCase(), index, kind: 'word' });
      index += end;
      continue;
    }
    const dollar = rest.match(/^\$[a-zA-Z_0-9]*\$/u);
    if (dollar) {
      const close = rest.indexOf(dollar[0], dollar[0].length);
      const length = close < 0 ? dollar[0].length : close + dollar[0].length;
      tokens.push({ value: '<dollar-string>', index, kind: 'string' });
      index += length;
      continue;
    }
    const word = rest.match(/^[a-zA-Z_][a-zA-Z_0-9$]*/u);
    if (word) {
      tokens.push({ value: word[0].toLowerCase(), index, kind: 'word' });
      index += word[0].length;
      continue;
    }
    tokens.push({ value: rest[0], index, kind: 'symbol' });
    index += 1;
  }
  return tokens;
}

function statementBounds(tokens, start) {
  let left = start;
  while (left > 0 && tokens[left - 1].value !== ';') left -= 1;
  let right = start;
  while (right < tokens.length && tokens[right].value !== ';') right += 1;
  return [left, right];
}

function relationResolver(tableKeys, searchPath) {
  const byBase = new Map();
  for (const relation of tableKeys) {
    const base = relation.split('.').at(-1);
    const list = byBase.get(base) ?? [];
    list.push(relation);
    byBase.set(base, list);
  }
  return (tokens, index) => {
    if (!tokens[index] || tokens[index].kind !== 'word') return undefined;
    if (tokens[index + 1]?.value === '.' && tokens[index + 2]?.kind === 'word') {
      const qualified = `${tokens[index].value}.${tokens[index + 2].value}`;
      return tableKeys.has(qualified) ? { relation: qualified, next: index + 3, qualified: true } : undefined;
    }
    const candidates = byBase.get(tokens[index].value) ?? [];
    if (candidates.length === 1) return { relation: candidates[0], next: index + 1, qualified: false };
    for (const schema of searchPath) {
      const qualified = `${schema}.${tokens[index].value}`;
      if (candidates.includes(qualified)) return { relation: qualified, next: index + 1, qualified: false };
    }
    return undefined;
  };
}

function declaredSearchPath(fn) {
  const config = fn.proconfig.find((entry) => entry.startsWith('search_path='));
  if (!config) return ['public'];
  return config.slice('search_path='.length).split(',').map((entry) => entry.trim()).filter(Boolean);
}

function addOperation(result, relation, operation, evidence) {
  const row = result.get(relation) ?? { operations: new Set(), evidence: [] };
  row.operations.add(operation);
  row.evidence.push(evidence);
  result.set(relation, row);
}

function extractOperations(body, fn, tableKeys) {
  const tokens = tokenize(body);
  const resolve = relationResolver(tableKeys, declaredSearchPath(fn));
  const result = new Map();
  const dynamicSql = [];
  const cteNames = new Set();

  for (let i = 0; i < tokens.length - 2; i += 1) {
    if ((tokens[i].value === 'with' || tokens[i].value === ',')
        && tokens[i + 1]?.kind === 'word' && tokens[i + 2]?.value === 'as' && tokens[i + 3]?.value === '(') {
      cteNames.add(tokens[i + 1].value);
    }
    if (tokens[i].value === 'execute') {
      const [left, right] = statementBounds(tokens, i);
      dynamicSql.push(tokens.slice(left, right).map((token) => token.value).join(' '));
    }
  }

  const parseAfter = (index, skip = new Set()) => {
    let cursor = index;
    while (skip.has(tokens[cursor]?.value)) cursor += 1;
    if (cteNames.has(tokens[cursor]?.value)) return undefined;
    return resolve(tokens, cursor);
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i].value;
    if (token === 'insert') {
      const target = parseAfter(i + 1, new Set(['into']));
      if (!target) continue;
      addOperation(result, target.relation, 'INSERT', `INSERT@${tokens[i].index}`);
      const [, right] = statementBounds(tokens, i);
      const values = tokens.slice(i, right).map((entry) => entry.value);
      const conflict = values.indexOf('conflict');
      if (conflict >= 0) {
        const doAt = values.indexOf('do', conflict + 1);
        if (doAt >= 0 && values[doAt + 1] === 'update') {
          addOperation(result, target.relation, 'UPDATE', `ON CONFLICT DO UPDATE@${tokens[i].index}`);
          addOperation(result, target.relation, 'SELECT', `ON CONFLICT row read@${tokens[i].index}`);
        } else if (doAt >= 0 && values[doAt + 1] === 'nothing'
                   && (values[conflict + 1] === '(' || values[conflict + 1] === 'on')) {
          addOperation(result, target.relation, 'SELECT', `targeted ON CONFLICT DO NOTHING@${tokens[i].index}`);
        }
      }
      if (values.includes('returning')) addOperation(result, target.relation, 'SELECT', `INSERT RETURNING@${tokens[i].index}`);
      continue;
    }
    if (token === 'update') {
      const target = parseAfter(i + 1, new Set(['only']));
      if (!target) continue;
      addOperation(result, target.relation, 'UPDATE', `UPDATE@${tokens[i].index}`);
      const [, right] = statementBounds(tokens, i);
      const values = tokens.slice(i, right).map((entry) => entry.value);
      if (values.includes('where') || values.includes('returning')) {
        addOperation(result, target.relation, 'SELECT', `UPDATE predicate/RETURNING@${tokens[i].index}`);
      }
      continue;
    }
    if (token === 'delete' && tokens[i + 1]?.value === 'from') {
      const target = parseAfter(i + 2);
      if (!target) continue;
      addOperation(result, target.relation, 'DELETE', `DELETE@${tokens[i].index}`);
      const [, right] = statementBounds(tokens, i);
      const values = tokens.slice(i, right).map((entry) => entry.value);
      if (values.includes('where') || values.includes('returning')) {
        addOperation(result, target.relation, 'SELECT', `DELETE predicate/RETURNING@${tokens[i].index}`);
      }
      continue;
    }
    if (token === 'from') {
      if (tokens[i - 1]?.value === 'delete') continue;
      const source = parseAfter(i + 1, new Set(['only']));
      if (source) addOperation(result, source.relation, 'SELECT', `FROM@${tokens[i].index}`);
      // PostgreSQL permits a comma-separated FROM list.  Stop at the next clause.
      let depth = 0;
      for (let cursor = i + 1; cursor < tokens.length && tokens[cursor].value !== ';'; cursor += 1) {
        if (tokens[cursor].value === '(') depth += 1;
        if (tokens[cursor].value === ')') depth = Math.max(0, depth - 1);
        if (depth === 0 && CLAUSE_END.has(tokens[cursor].value)) break;
        if (depth === 0 && tokens[cursor].value === ',') {
          const commaSource = parseAfter(cursor + 1);
          if (commaSource) addOperation(result, commaSource.relation, 'SELECT', `comma FROM@${tokens[cursor].index}`);
        }
      }
      continue;
    }
    if (token === 'join' || token === 'using') {
      const source = parseAfter(i + 1, new Set(['only']));
      if (source) addOperation(result, source.relation, 'SELECT', `${token.toUpperCase()}@${tokens[i].index}`);
      continue;
    }
    if (token === 'table') {
      const source = parseAfter(i + 1, new Set(['only']));
      if (source) addOperation(result, source.relation, 'SELECT', `TABLE@${tokens[i].index}`);
    }
  }

  return { result, dynamicSql };
}

function normalizedOperations(row) {
  return OPERATION_ORDER.filter((operation) => row?.operations.has(operation));
}

function patternClasses(body) {
  const normalized = body.toLowerCase();
  return {
    performFrom: /\bperform\b[^;]*\bfrom\b/u.test(normalized),
    selectInto: /\bselect\b[^;]*\binto\b[^;]*\bfrom\b/u.test(normalized),
    cte: /\bwith\s+(?:recursive\s+)?[a-z_][a-z0-9_]*\s+as\s*\(/u.test(normalized),
    alias: /\b(?:from|join|using)\s+(?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*\s+(?:as\s+)?[a-z_][a-z0-9_]*/u.test(normalized),
    returnQuery: /\breturn\s+query\b/u.test(normalized),
    updateFrom: /\bupdate\b[^;]*\bfrom\b/u.test(normalized),
    deleteUsing: /\bdelete\s+from\b[^;]*\busing\b/u.test(normalized),
    dynamicSql: /\bexecute\b/u.test(normalized),
  };
}

const SPECIAL_RELATION_CONTRACT = new Map([
  ['app.install_port_context(uuid,app.port_context_claims)', 'deploy/postgres/port-context/contract.sql'],
  ['app.clear_port_context()', 'deploy/postgres/port-context/contract.sql'],
  ['app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure)', 'deploy/postgres/port-context/contract.sql'],
  ['app.current_org_id()', 'deploy/postgres/port-context/contract.sql'],
  ['app.current_actor_user_id()', 'deploy/postgres/port-context/contract.sql'],
  ['app.current_patient_user_id()', 'deploy/postgres/port-context/contract.sql'],
  ['app.current_integrator_user_id()', 'deploy/postgres/port-context/contract.sql'],
  ['app_control.enforce_relation_birth_wall()', 'postgres-owned event-trigger birth-wall contract'],
]);

const loaded = loadBodies();
const { bodies } = loaded;
const tableKeys = new Set([
  ...Object.keys(declaration.databases.bcb_webapp_dev.tables),
  ...loaded.relations,
  ...Object.values(declaration.portContext.functions).flatMap((fn) =>
    (fn.relationSurfaces ?? []).map((surface) => surface.relation)),
]);
const declarations = Object.entries(declaration.portContext.functions);
const reports = [];
const missingBodies = [];
const definerUnder = [];
const definerOver = [];
const specialContractRequirements = [];
const invokerDependencies = [];
const dynamicSql = [];
const patternCensus = {
  performFrom: [], selectInto: [], cte: [], alias: [], returnQuery: [], updateFrom: [], deleteUsing: [], dynamicSql: [],
};

for (const [signature, fn] of declarations) {
  const name = signature.slice(0, signature.indexOf('('));
  const source = bodies.get(name);
  if (!source) {
    missingBodies.push({ signature, security: fn.security, expectedExternal: name.startsWith('app_ext.') });
    continue;
  }
  const actual = extractOperations(source.body, fn, tableKeys);
  const classes = patternClasses(source.body);
  for (const [kind, present] of Object.entries(classes)) if (present) patternCensus[kind].push(signature);
  if (actual.dynamicSql.length > 0) dynamicSql.push({ signature, statements: actual.dynamicSql });
  const declared = new Map((fn.relationSurfaces ?? []).map((surface) => [surface.relation, new Set(surface.operations)]));
  const actualRows = [...actual.result.entries()].map(([relation, row]) => ({
    relation,
    operations: normalizedOperations(row),
    evidence: [...new Set(row.evidence)],
  })).sort((a, b) => a.relation.localeCompare(b.relation));
  reports.push({ signature, security: fn.security, invocation: fn.invocation ?? 'runtime', source: source.source, actual: actualRows });

  if (fn.security === 'INVOKER') {
    if (actualRows.length > 0) invokerDependencies.push({ signature, owner: fn.owner, dependencies: actualRows });
    continue;
  }
  if (SPECIAL_RELATION_CONTRACT.has(signature)) {
    specialContractRequirements.push({
      signature,
      contract: SPECIAL_RELATION_CONTRACT.get(signature),
      requirements: actualRows,
    });
    continue;
  }
  const relations = new Set([...actual.result.keys(), ...declared.keys()]);
  for (const relation of [...relations].sort()) {
    const actualOps = new Set(normalizedOperations(actual.result.get(relation)));
    const declaredOps = declared.get(relation) ?? new Set();
    for (const operation of actualOps) {
      if (!declaredOps.has(operation)) definerUnder.push({ signature, relation, operation });
    }
    for (const operation of declaredOps) {
      if (!actualOps.has(operation)) definerOver.push({ signature, relation, operation });
    }
  }
}

const actualByOwner = new Map();
for (const report of reports) {
  const owner = declaration.portContext.functions[report.signature].owner;
  const requirements = actualByOwner.get(owner) ?? new Set();
  for (const relation of report.actual) {
    for (const operation of relation.operations) requirements.add(`${relation.relation}:${operation}`);
  }
  actualByOwner.set(owner, requirements);
}
const classifyOwnerAggregate = (row) => {
  const owner = declaration.portContext.functions[row.signature].owner;
  const siblings = reports.filter((report) => report.signature !== row.signature
      && declaration.portContext.functions[report.signature].owner === owner
      && report.actual.some((relation) => relation.relation === row.relation
        && relation.operations.includes(row.operation))).map((report) => report.signature).sort();
  return { ...row, owner, physicallyMaskedBySibling: siblings.length > 0, siblings };
};
const classifiedUnder = definerUnder.map(classifyOwnerAggregate);
const classifiedOver = definerOver.map((row) => {
  const owner = declaration.portContext.functions[row.signature].owner;
  return {
    ...row,
    owner,
    physicalOwnerGrantExcess: !actualByOwner.get(owner)?.has(`${row.relation}:${row.operation}`),
  };
});

const probeFn = { proconfig: ['search_path=pg_catalog, public, pg_temp'] };
const probeBody = stripComments(`
BEGIN
  -- This real comment must disappear, while comment markers inside literals must survive.
  PERFORM 'literal -- is not a comment';
  PERFORM 'literal /* is not a block comment */';
  PERFORM 1 FROM public.reminder_rules rule WHERE rule.integrator_rule_id = 'r';
  INSERT INTO public.reminder_rules DEFAULT VALUES;
  SELECT identity.platform_user_id INTO STRICT target_id FROM public.user_identity AS identity;
  RETURN QUERY SELECT person.id FROM public.platform_users person;
  WITH picked AS (SELECT p.id FROM public.platform_users p)
  UPDATE public.user_identity identity SET display_name = 'x' FROM picked
    WHERE identity.platform_user_id = picked.id RETURNING identity.platform_user_id;
  DELETE FROM public.user_identity identity USING public.platform_users person
    WHERE identity.platform_user_id = person.id RETURNING identity.platform_user_id;
  EXECUTE 'SELECT * FROM public.system_settings';
END`);
const probe = extractOperations(probeBody, probeFn, tableKeys);
const probeActual = Object.fromEntries([...probe.result.entries()].sort(([a], [b]) => a.localeCompare(b))
  .map(([relation, row]) => [relation, normalizedOperations(row)]));
const probeExpected = {
  'public.platform_users': ['SELECT'],
  'public.reminder_rules': ['SELECT', 'INSERT'],
  'public.user_identity': ['SELECT', 'UPDATE', 'DELETE'],
};
const parserProbe = {
  expected: probeExpected,
  actual: probeActual,
  dynamicStatementsDetected: probe.dynamicSql.length,
  pass: JSON.stringify(probeActual) === JSON.stringify(probeExpected) && probe.dynamicSql.length === 1,
};

const output = {
  authority: {
    auditedCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    b0Evidence: `${B0_EVIDENCE_COMMIT}:${B0_EVIDENCE_PATH}`,
    note: 'historical object is read-only forensic evidence and is never executed',
  },
  counts: {
    declaredFunctions: declarations.length,
    declaredDefiners: declarations.filter(([, fn]) => fn.security === 'DEFINER').length,
    declaredInvokers: declarations.filter(([, fn]) => fn.security === 'INVOKER').length,
    reconstructedBodies: bodies.size,
    auditedDeclaredBodies: reports.length,
    missingBodies: missingBodies.length,
    definerUnderdeclaredTriples: classifiedUnder.length,
    definerUnderdeclaredUnmaskedOwnerAclTriples: classifiedUnder.filter((row) => !row.physicallyMaskedBySibling).length,
    definerOverdeclaredTriples: classifiedOver.length,
    definerOverdeclaredPhysicalOwnerGrantTriples: classifiedOver.filter((row) => row.physicalOwnerGrantExcess).length,
    invokerFunctionsWithRelationDependencies: invokerDependencies.length,
    specialContractFunctionsWithRelationDependencies: specialContractRequirements.length,
    dynamicSqlFunctions: dynamicSql.length,
  },
  missingBodies,
  definerUnder: classifiedUnder,
  definerOver: classifiedOver,
  invokerDependencies,
  specialContractRequirements,
  patternCensus,
  parserProbe,
  dynamicSql,
  functions: reports,
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (outputPath) fs.writeFileSync(path.resolve(ROOT, outputPath), serialized);
else process.stdout.write(serialized);
process.exitCode = classifiedUnder.length > 0 || !parserProbe.pass
  || missingBodies.some((entry) => !entry.expectedExternal) ? 1 : 0;
