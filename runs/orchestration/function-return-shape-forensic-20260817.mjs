#!/usr/bin/env node

/**
 * Read-only forensic inventory of PostgreSQL function return shapes.
 *
 * The accepted pre-B0 schema snapshot is used as evidence, then only active
 * B0-forward definitions are overlaid. Historical SQL is never executed.
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
const outputIndex = process.argv.indexOf('--output');
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
if (outputIndex >= 0 && !outputPath) throw new Error('--output requires a path');
const liveIndex = process.argv.indexOf('--live-tsv');
const livePath = liveIndex >= 0 ? process.argv[liveIndex + 1] : undefined;
if (liveIndex >= 0 && !livePath) throw new Error('--live-tsv requires a path');

function skipQuoted(text, start) {
  const quote = text[start];
  if (quote === "'" || quote === '"') {
    let cursor = start + 1;
    while (cursor < text.length) {
      if (text[cursor] === quote && text[cursor + 1] === quote) { cursor += 2; continue; }
      if (text[cursor] === quote) return cursor + 1;
      cursor += 1;
    }
    return text.length;
  }
  if (text.startsWith('--', start)) {
    const end = text.indexOf('\n', start + 2);
    return end < 0 ? text.length : end + 1;
  }
  if (text.startsWith('/*', start)) {
    const end = text.indexOf('*/', start + 2);
    return end < 0 ? text.length : end + 2;
  }
  const dollar = text.slice(start).match(/^\$[a-zA-Z_0-9]*\$/u)?.[0];
  if (dollar) {
    const end = text.indexOf(dollar, start + dollar.length);
    return end < 0 ? text.length : end + dollar.length;
  }
  return start + 1;
}

function matchingParen(text, open) {
  let depth = 0;
  for (let cursor = open; cursor < text.length; cursor += 1) {
    if (text[cursor] === "'" || text[cursor] === '"' || text.startsWith('--', cursor)
        || text.startsWith('/*', cursor) || /^\$[a-zA-Z_0-9]*\$/u.test(text.slice(cursor))) {
      cursor = skipQuoted(text, cursor) - 1;
      continue;
    }
    if (text[cursor] === '(') depth += 1;
    if (text[cursor] === ')') {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  throw new Error(`unclosed parenthesis at byte ${open}`);
}

function splitTopLevel(text) {
  const rows = [];
  let start = 0;
  let depth = 0;
  for (let cursor = 0; cursor < text.length; cursor += 1) {
    if (text[cursor] === "'" || text[cursor] === '"' || text.startsWith('--', cursor)
        || text.startsWith('/*', cursor) || /^\$[a-zA-Z_0-9]*\$/u.test(text.slice(cursor))) {
      cursor = skipQuoted(text, cursor) - 1;
      continue;
    }
    if (text[cursor] === '(' || text[cursor] === '[') depth += 1;
    if (text[cursor] === ')' || text[cursor] === ']') depth -= 1;
    if (text[cursor] === ',' && depth === 0) {
      rows.push(text.slice(start, cursor).trim());
      start = cursor + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) rows.push(tail);
  return rows;
}

function normalizeType(raw) {
  let value = raw.trim()
    .replace(/\s+/gu, ' ')
    .replace(/\s*\[\s*\]/gu, '[]')
    .replace(/\([^()]*(?:\([^()]*\)[^()]*)*\)$/u, '')
    .replace(/^pg_catalog\./u, '')
    .toLowerCase();
  const array = value.endsWith('[]');
  if (array) value = value.slice(0, -2);
  const aliases = new Map([
    ['bool', 'boolean'], ['int2', 'smallint'], ['int4', 'integer'], ['int', 'integer'],
    ['int8', 'bigint'], ['float4', 'real'], ['float8', 'double precision'],
    ['decimal', 'numeric'], ['varchar', 'character varying'], ['char', 'character'],
    ['timestamptz', 'timestamp with time zone'], ['timestamp', 'timestamp without time zone'],
    ['timetz', 'time with time zone'], ['time', 'time without time zone'],
  ]);
  value = aliases.get(value) ?? value;
  // format_type() renders types in the verifier-visible public schema without
  // qualification (for example `saas_tariffs`, not `public.saas_tariffs`).
  if (value.startsWith('public.')) value = value.slice('public.'.length);
  return `${value}${array ? '[]' : ''}`;
}

function stripDefault(argument) {
  let depth = 0;
  const words = argument;
  for (let cursor = 0; cursor < words.length; cursor += 1) {
    if (words[cursor] === "'" || words[cursor] === '"') {
      cursor = skipQuoted(words, cursor) - 1;
      continue;
    }
    if (words[cursor] === '(' || words[cursor] === '[') depth += 1;
    if (words[cursor] === ')' || words[cursor] === ']') depth -= 1;
    if (depth === 0 && words[cursor] === '=') return words.slice(0, cursor).trim();
    if (depth === 0 && /^\sdefault\b/iu.test(words.slice(cursor))) return words.slice(0, cursor).trim();
  }
  return argument.trim();
}

function parameterModeAndType(argument) {
  const clean = stripDefault(argument);
  const modeMatch = clean.match(/^\s*(INOUT|OUT|IN|VARIADIC)\b\s*/iu);
  const mode = modeMatch?.[1].toUpperCase() ?? 'IN';
  let remainder = clean.slice(modeMatch?.[0].length ?? 0).trim();
  const pieces = remainder.match(/^("(?:[^"]|"")*"|[a-zA-Z_][\w$]*)\s+([\s\S]+)$/u);
  if (pieces) remainder = pieces[2];
  return { mode, type: normalizeType(remainder) };
}

function tableColumnType(column) {
  const pieces = column.trim().match(/^("(?:[^"]|"")*"|[a-zA-Z_][\w$]*)\s+([\s\S]+)$/u);
  if (!pieces) throw new Error(`cannot parse RETURNS TABLE column: ${column}`);
  return normalizeType(pieces[2]);
}

const ATTRIBUTE_START = /\b(?:LANGUAGE|TRANSFORM|WINDOW|IMMUTABLE|STABLE|VOLATILE|CALLED|RETURNS\s+NULL|STRICT|SECURITY|LEAKPROOF|NOT\s+LEAKPROOF|PARALLEL|COST|ROWS|SUPPORT|SET|AS)\b/iu;

function parseReturnShape(args, afterArgs) {
  const table = afterArgs.match(/^\s*RETURNS\s+TABLE\s*\(/iu);
  if (table) {
    const open = afterArgs.indexOf('(', table.index ?? 0);
    const close = matchingParen(afterArgs, open);
    const columns = splitTopLevel(afterArgs.slice(open + 1, close)).map(tableColumnType);
    if (columns.length === 0) throw new Error('RETURNS TABLE without columns');
    return { returns: columns.length === 1 ? columns[0] : 'record', returnsSet: true, form: 'TABLE', outTypes: columns };
  }
  const setof = afterArgs.match(/^\s*RETURNS\s+SETOF\s+([\s\S]+)$/iu);
  if (setof) {
    const end = setof[1].search(ATTRIBUTE_START);
    const raw = end < 0 ? setof[1] : setof[1].slice(0, end);
    return { returns: normalizeType(raw), returnsSet: true, form: 'SETOF', outTypes: [] };
  }
  const scalar = afterArgs.match(/^\s*RETURNS\s+([\s\S]+)$/iu);
  if (scalar) {
    const end = scalar[1].search(ATTRIBUTE_START);
    const raw = end < 0 ? scalar[1] : scalar[1].slice(0, end);
    return { returns: normalizeType(raw), returnsSet: false, form: 'SCALAR', outTypes: [] };
  }
  const outs = splitTopLevel(args).map(parameterModeAndType).filter((row) => row.mode === 'OUT' || row.mode === 'INOUT');
  if (outs.length === 0) throw new Error(`function has neither RETURNS nor OUT arguments: ${afterArgs.slice(0, 120)}`);
  return {
    returns: outs.length === 1 ? outs[0].type : 'record',
    returnsSet: false,
    form: 'OUT',
    outTypes: outs.map((row) => row.type),
  };
}

function extractDefinitions(source, text) {
  const definitions = [];
  const pattern = /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+([a-zA-Z_][\w$]*\.[a-zA-Z_][\w$]*)\s*\(/gimu;
  for (const match of text.matchAll(pattern)) {
    const open = (match.index ?? 0) + match[0].lastIndexOf('(');
    const close = matchingParen(text, open);
    const args = text.slice(open + 1, close);
    const afterArgs = text.slice(close + 1);
    const asMatch = afterArgs.match(/\bAS\s+\$[a-zA-Z_0-9]*\$/iu);
    if (!asMatch || asMatch.index === undefined) throw new Error(`no AS dollar quote for ${match[1]} in ${source}`);
    const headerTail = afterArgs.slice(0, asMatch.index);
    definitions.push({
      name: match[1].toLowerCase(),
      source,
      ...parseReturnShape(args, headerTail),
    });
  }
  return definitions;
}

function loadDefinitions() {
  const byName = new Map();
  const sourceCounts = [];
  const add = (source, text) => {
    const rows = extractDefinitions(source, text);
    sourceCounts.push({ source, definitions: rows.length });
    for (const row of rows) byName.set(row.name, row);
  };
  add(`${B0_EVIDENCE_COMMIT}:${B0_EVIDENCE_PATH}`, execFileSync('git', [
    'show', `${B0_EVIDENCE_COMMIT}:${B0_EVIDENCE_PATH}`,
  ], { cwd: ROOT, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 }));
  for (const file of fs.readdirSync(MIGRATION_DIR).filter((entry) => entry.endsWith('.sql')).sort()) {
    const absolute = path.join(MIGRATION_DIR, file);
    add(path.relative(ROOT, absolute), fs.readFileSync(absolute, 'utf8'));
  }
  add(path.relative(ROOT, PORT_CONTEXT_CONTRACT), fs.readFileSync(PORT_CONTEXT_CONTRACT, 'utf8'));
  add(path.relative(ROOT, TEST_FIXTURE), fs.readFileSync(TEST_FIXTURE, 'utf8'));
  return { byName, sourceCounts };
}

function parserProbe() {
  const cases = [
    { label: 'scalar', args: 'value integer', tail: ' RETURNS uuid LANGUAGE sql ', expected: ['uuid', false, 'SCALAR'] },
    { label: 'setof', args: '', tail: ' RETURNS SETOF public.example_row LANGUAGE sql ', expected: ['example_row', true, 'SETOF'] },
    { label: 'table-one', args: '', tail: ' RETURNS TABLE(id uuid) LANGUAGE sql ', expected: ['uuid', true, 'TABLE'] },
    { label: 'table-many', args: '', tail: ' RETURNS TABLE(id uuid, label text) LANGUAGE sql ', expected: ['record', true, 'TABLE'] },
    { label: 'out-one', args: 'IN value integer, OUT id uuid', tail: ' LANGUAGE sql ', expected: ['uuid', false, 'OUT'] },
    { label: 'out-many', args: 'IN value integer, OUT id uuid, OUT label text', tail: ' LANGUAGE sql ', expected: ['record', false, 'OUT'] },
  ];
  const results = cases.map((row) => {
    const actual = parseReturnShape(row.args, row.tail);
    const tuple = [actual.returns, actual.returnsSet, actual.form];
    return { label: row.label, expected: row.expected, actual: tuple, pass: JSON.stringify(tuple) === JSON.stringify(row.expected) };
  });
  return { cases: results, pass: results.every((row) => row.pass) };
}

const loaded = loadDefinitions();
const declared = Object.entries(declaration.portContext.functions);
const functions = [];
const missing = [];
const baseTypeMismatches = [];
const unexpressedSetReturning = [];
for (const [signature, fn] of declared) {
  const name = signature.slice(0, signature.indexOf('('));
  const canonical = loaded.byName.get(name);
  if (!canonical) {
    const expectedExternal = name === 'app_ext.digest' || name === 'app_ext.hmac';
    missing.push({ signature, expectedExternal });
    functions.push({
      signature,
      databases: fn.databases ?? Object.keys(declaration.databases),
      declared: { returns: fn.returns, returnsSet: null },
      canonical: null,
      classification: expectedExternal ? 'expected-extension-definition-unavailable' : 'unresolved',
    });
    continue;
  }
  const row = {
    signature,
    databases: fn.databases ?? Object.keys(declaration.databases),
    declared: { returns: fn.returns, returnsSet: null },
    canonical: {
      returns: canonical.returns,
      returnsSet: canonical.returnsSet,
      form: canonical.form,
      outTypes: canonical.outTypes,
      source: canonical.source,
    },
    baseTypeMatches: fn.returns === canonical.returns,
    setReturningExpressed: false,
  };
  functions.push(row);
  if (!row.baseTypeMatches) baseTypeMismatches.push({ signature, declared: fn.returns, canonical: canonical.returns, form: canonical.form, source: canonical.source });
  if (canonical.returnsSet) unexpressedSetReturning.push({ signature, returns: canonical.returns, form: canonical.form, source: canonical.source });
}

const probe = parserProbe();
const extensionShapes = new Map([
  ['app_ext.digest(text,text)', { returns: 'bytea', returnsSet: false, evidence: 'pgcrypto extension contract' }],
  ['app_ext.hmac(text,text,text)', { returns: 'bytea', returnsSet: false, evidence: 'pgcrypto extension contract' }],
]);
for (const row of functions) {
  if (!row.canonical && extensionShapes.has(row.signature)) {
    row.canonical = { ...extensionShapes.get(row.signature), form: 'EXTENSION', outTypes: [], source: 'external pgcrypto extension' };
    row.baseTypeMatches = row.declared.returns === row.canonical.returns;
    row.setReturningExpressed = false;
    row.classification = 'expected-extension-contract';
  }
}

const scalarExpected = functions.filter((row) => row.canonical && !row.canonical.returnsSet).length;
const setExpected = functions.filter((row) => row.canonical?.returnsSet).length;
const setBlindSpotWithMatchingBase = functions.filter((row) => row.canonical?.returnsSet && row.baseTypeMatches).length;
const generatorSource = fs.readFileSync(path.join(ROOT, 'deploy/postgres/privileges/generate.mjs'), 'utf8');
const catalogPredicate = generatorSource.match(/WHERE p\.oid IS NULL[^\n]+/u)?.[0] ?? '';
const legacyCatalogPredicate = (expected, actual) => expected.returns === actual.returns;
const strictReturnShapePredicate = (expected, actual) => expected.returns === actual.returns
  && expected.returnsSet === actual.returnsSet;
const mutationProof = [
  {
    label: 'canonical TABLE(record) mutated to scalar record',
    signature: 'app.accept_org_invite(text,uuid,text)',
    expected: { returns: 'record', returnsSet: true },
    mutatedCatalog: { returns: 'record', returnsSet: false },
  },
  {
    label: 'canonical scalar boolean mutated to SETOF boolean',
    signature: 'app.abort_patient_program_submission_media(uuid)',
    expected: { returns: 'boolean', returnsSet: false },
    mutatedCatalog: { returns: 'boolean', returnsSet: true },
  },
].map((row) => ({
  ...row,
  currentPredicateAcceptsMutation: legacyCatalogPredicate(row.expected, row.mutatedCatalog),
  predicateIncludingProretsetAcceptsMutation: strictReturnShapePredicate(row.expected, row.mutatedCatalog),
}));
const formCounts = Object.fromEntries(['SCALAR', 'TABLE', 'SETOF', 'OUT', 'EXTENSION'].map((form) => [
  form,
  functions.filter((row) => row.canonical?.form === form).length,
]));
let liveCrossCheck = null;
if (livePath) {
  const liveRows = new Map();
  for (const line of fs.readFileSync(livePath, 'utf8').trim().split('\n')) {
    const [rawSignature, returns, rawReturnsSet, resultDisplay, argumentModes] = line.split('\t');
    if (!rawSignature?.includes('(')) continue;
    liveRows.set(rawSignature.replace(/,\s+/gu, ','), {
      returns,
      returnsSet: rawReturnsSet === 't',
      resultDisplay,
      argumentModes: argumentModes ?? '',
    });
  }
  const expectedPresent = functions.filter((row) => row.databases.includes('bcb_webapp_dev'));
  const missingFromDev = [];
  const mismatches = [];
  for (const row of expectedPresent) {
    const live = liveRows.get(row.signature);
    if (!live) { missingFromDev.push(row.signature); continue; }
    if (live.returns !== row.canonical.returns || live.returnsSet !== row.canonical.returnsSet) {
      mismatches.push({
        signature: row.signature,
        canonical: { returns: row.canonical.returns, returnsSet: row.canonical.returnsSet },
        live,
      });
    }
  }
  const expectedAbsent = functions.filter((row) => !row.databases.includes('bcb_webapp_dev'))
    .map((row) => row.signature);
  liveCrossCheck = {
    database: 'bcb_webapp_dev',
    expectedPresent: expectedPresent.length,
    matched: expectedPresent.length - missingFromDev.length,
    missingFromDev,
    expectedAbsent,
    canonicalShapeMismatches: mismatches,
  };
}
const result = {
  authority: {
    auditedCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    b0Evidence: `${B0_EVIDENCE_COMMIT}:${B0_EVIDENCE_PATH}`,
    overlays: [path.relative(ROOT, MIGRATION_DIR), path.relative(ROOT, PORT_CONTEXT_CONTRACT), path.relative(ROOT, TEST_FIXTURE)],
    note: 'The historical snapshot is read-only evidence and is never executed.',
  },
  counts: {
    declaredFunctions: declared.length,
    uniqueDeclaredNames: new Set(declared.map(([signature]) => signature.slice(0, signature.indexOf('(')))).size,
    reconstructedCanonicalDefinitions: functions.filter((row) => row.canonical && row.canonical.form !== 'EXTENSION').length,
    expectedExternalExtensionDefinitions: functions.filter((row) => row.canonical?.form === 'EXTENSION').length,
    unresolvedDefinitions: functions.filter((row) => !row.canonical).length,
    canonicalScalar: scalarExpected,
    canonicalSetReturning: setExpected,
    canonicalForms: formCounts,
    declaredBaseTypeMismatches: baseTypeMismatches.length,
    canonicalSetReturningWithoutDeclarationField: unexpressedSetReturning.length,
    setReturningBlindSpotWithMatchingBaseType: setBlindSpotWithMatchingBase,
  },
  finding: {
    generatorComparesProrettype: true,
    generatorComparesProretset: /\bp\.proretset\b/u.test(catalogPredicate),
    exactCurrentCatalogPredicate: catalogPredicate,
    scalarToSetDriftCanPassWhenBaseTypeMatches: true,
    setToScalarDriftCanPassWhenBaseTypeMatches: true,
    explanation: 'The catalog predicate compares format_type(p.prorettype,NULL) but never p.proretset; therefore a scalar and SETOF/TABLE function with the same base prorettype are indistinguishable to the census.',
  },
  parserProbe: probe,
  mutationProof,
  liveCrossCheck,
  sourceCounts: loaded.sourceCounts,
  baseTypeMismatches,
  unexpressedSetReturning,
  functions,
};

const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (outputPath) fs.writeFileSync(path.resolve(ROOT, outputPath), serialized);
else process.stdout.write(serialized);
process.exitCode = !probe.pass || result.counts.unresolvedDefinitions > 0
  || (liveCrossCheck && (liveCrossCheck.missingFromDev.length > 0 || liveCrossCheck.canonicalShapeMismatches.length > 0)) ? 1 : 0;
