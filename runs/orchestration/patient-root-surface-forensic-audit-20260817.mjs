#!/usr/bin/env node

// One-shot forensic diagnostic for the 47 current-patient roots installed by
// migrations 0016/0017. This intentionally does not participate in CI: it is
// an independent bidirectional audit of SQL bodies against relationSurfaces.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { declaration } from '../../deploy/postgres/privileges/declaration.ts';

const MIGRATIONS = [
  'apps/webapp/db/drizzle-migrations/0016_patient_self_action_capabilities.sql',
  'apps/webapp/db/drizzle-migrations/0017_patient_shared_core_capabilities.sql',
];

function extractFunctions(sql, migration) {
  const functions = [];
  const pattern = /CREATE OR REPLACE FUNCTION\s+(app\.[a-z0-9_]+)\s*\(([\s\S]*?)\)\s*\nRETURNS[\s\S]*?AS \$function\$\n([\s\S]*?)\n\$function\$;/gi;
  for (const match of sql.matchAll(pattern)) {
    const line = sql.slice(0, match.index).split('\n').length;
    functions.push({ migration, line, name: match[1].toLowerCase(), args: match[2], body: match[3] });
  }
  return functions;
}

function add(map, relation, operation, reason) {
  const item = map.get(relation) ?? { operations: new Set(), reasons: new Map() };
  item.operations.add(operation);
  const reasons = item.reasons.get(operation) ?? new Set();
  reasons.add(reason);
  item.reasons.set(operation, reasons);
  map.set(relation, item);
}

function relationNames(fragment) {
  return [...fragment.matchAll(/\b(public\.[a-z][a-z0-9_]*)\b/gi)].map((match) => match[1].toLowerCase());
}

function bodyRequirements(body) {
  const source = body
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  const requirements = new Map();

  // Direct SELECT relation reads, including SELECT subqueries embedded in mutations.
  for (const match of source.matchAll(/(?:\bfrom\b|\bjoin\b|,)\s+(public\.[a-z][a-z0-9_]*)\b/g)) {
    const prefix = source.slice(Math.max(0, match.index - 120), match.index);
    // DELETE FROM and INSERT INTO are classified below, not as SELECT merely because
    // the target follows FROM/INTO. A SELECT ... FROM or mutation source FROM remains a read.
    if (/\bdelete\s*$/.test(prefix)) continue;
    add(requirements, match[1], 'SELECT', 'FROM/JOIN reads the relation');
  }
  for (const match of source.matchAll(/\busing\s+(public\.[a-z][a-z0-9_]*)\b/g)) {
    add(requirements, match[1], 'SELECT', 'DELETE USING reads the relation');
  }

  for (const match of source.matchAll(/\binsert\s+into\s+(public\.[a-z][a-z0-9_]*)\b([^;]*);/g)) {
    const relation = match[1];
    const statement = match[0];
    add(requirements, relation, 'INSERT', 'INSERT target');
    if (/\bon\s+conflict\b[^;]*\bdo\s+update\b/.test(statement)) {
      add(requirements, relation, 'UPDATE', 'ON CONFLICT DO UPDATE target');
      add(requirements, relation, 'SELECT', 'ON CONFLICT DO UPDATE conflict/update row');
    }
    if (/\bon\s+conflict\s+(?:\(|on\s+constraint\b)[^;]*\bdo\s+nothing\b/.test(statement)) {
      add(requirements, relation, 'SELECT', 'targeted ON CONFLICT DO NOTHING conflict row');
    }
    if (/\breturning\b/.test(statement)) {
      add(requirements, relation, 'SELECT', 'INSERT RETURNING reads returned columns');
    }
  }

  for (const match of source.matchAll(/\bupdate\s+(?:only\s+)?(public\.[a-z][a-z0-9_]*)\b([^;]*);/g)) {
    const relation = match[1];
    const statement = match[0];
    add(requirements, relation, 'UPDATE', 'UPDATE target');
    if (/\bwhere\b|\breturning\b/.test(statement)) {
      add(requirements, relation, 'SELECT', 'UPDATE predicate/RETURNING reads target columns');
    }
  }

  for (const match of source.matchAll(/\bdelete\s+from\s+(public\.[a-z][a-z0-9_]*)\b([^;]*);/g)) {
    const relation = match[1];
    const statement = match[0];
    add(requirements, relation, 'DELETE', 'DELETE target');
    if (/\bwhere\b|\breturning\b/.test(statement)) {
      add(requirements, relation, 'SELECT', 'DELETE predicate/RETURNING reads target columns');
    }
  }

  // Any body-qualified relation not classified above is a parser escape that must be
  // inspected rather than silently treated as absent.
  const mentioned = new Set(relationNames(source));
  const unresolved = [...mentioned].filter((relation) => !requirements.has(relation));
  return { requirements, unresolved };
}

function declaredSignatureFor(fn, declaredFunctions) {
  const candidates = [...declaredFunctions.keys()].filter((signature) => signature.startsWith(`${fn.name}(`));
  assert.equal(candidates.length, 1, `${fn.migration}:${fn.line}: expected one declaration for ${fn.name}, got ${candidates.length}`);
  return candidates[0];
}

const sqlFunctions = [];
for (const migration of MIGRATIONS) {
  sqlFunctions.push(...extractFunctions(await readFile(migration, 'utf8'), migration));
}
assert.equal(sqlFunctions.length, 47, 'the 0016/0017 current-patient root census changed');

const declaredFunctions = new Map(Object.entries(declaration.portContext.functions));
const audit = [];
const requiredBySignature = new Map();
const declaredBySignature = new Map();
for (const fn of sqlFunctions) {
  const signature = declaredSignatureFor(fn, declaredFunctions);
  const declared = declaredFunctions.get(signature);
  const declaredSurfaces = new Map((declared.relationSurfaces ?? []).map((surface) => [surface.relation, surface]));
  const { requirements, unresolved } = bodyRequirements(fn.body);
  requiredBySignature.set(signature, requirements);
  declaredBySignature.set(signature, declaredSurfaces);
  const absentRelations = [...requirements.keys()].filter((relation) => !declaredSurfaces.has(relation)).sort();
  const missingOperations = [];
  const overdeclaredOperations = [];
  for (const [relation, required] of requirements) {
    const surface = declaredSurfaces.get(relation);
    if (!surface) continue;
    for (const operation of required.operations) {
      if (!surface.operations.includes(operation)) {
        missingOperations.push({ relation, operation, reasons: [...required.reasons.get(operation)] });
      }
    }
  }
  for (const [relation, surface] of declaredSurfaces) {
    const required = requirements.get(relation);
    for (const operation of surface.operations) {
      if (!required?.operations.has(operation)) overdeclaredOperations.push({ relation, operation });
    }
  }
  const overdeclaredRelations = [...declaredSurfaces.keys()].filter((relation) => !requirements.has(relation)).sort();
  audit.push({
    signature,
    migration: fn.migration,
    line: fn.line,
    bodyRelations: requirements.size,
    declaredRelations: declaredSurfaces.size,
    absentRelations,
    missingOperations,
    overdeclaredRelations,
    overdeclaredOperations,
    unresolved,
  });
}

function operationPairs(surfaceMaps) {
  const pairs = new Set();
  for (const surfaces of surfaceMaps) {
    for (const [relation, surface] of surfaces) {
      for (const operation of surface.operations) pairs.add(`${relation}:${operation}`);
    }
  }
  return pairs;
}

const requiredPairs = operationPairs(requiredBySignature.values());
const selectedDeclaredPairs = operationPairs(declaredBySignature.values());
const ownerRole = 'app_seam_patient_self_actions_owner';
const allOwnerDeclaredMaps = Object.values(declaration.portContext.functions)
  .filter((fn) => fn.owner === ownerRole)
  .map((fn) => new Map((fn.relationSurfaces ?? []).map((surface) => [surface.relation, surface])));
const ownerDeclaredPairs = operationPairs(allOwnerDeclaredMaps);
const difference = (left, right) => [...left].filter((item) => !right.has(item)).sort();
const ownerRoleAggregate = {
  ownerRole,
  declaredFunctionsForOwner: allOwnerDeclaredMaps.length,
  selectedRequiredRelations: new Set([...requiredPairs].map((pair) => pair.slice(0, pair.lastIndexOf(':')))).size,
  selectedRequiredPairs: requiredPairs.size,
  selectedDeclaredPairs: selectedDeclaredPairs.size,
  allOwnerDeclaredPairs: ownerDeclaredPairs.size,
  missingFromSelectedDeclaration: difference(requiredPairs, selectedDeclaredPairs),
  missingFromOwnerRoleAggregate: difference(requiredPairs, ownerDeclaredPairs),
  selectedDeclarationBeyondSelectedBodies: difference(selectedDeclaredPairs, requiredPairs),
};

const summary = {
  functions: audit.length,
  functionsWithAbsentRelations: audit.filter((item) => item.absentRelations.length > 0).length,
  absentRelationPairs: audit.reduce((sum, item) => sum + item.absentRelations.length, 0),
  functionsWithMissingOperations: audit.filter((item) => item.missingOperations.length > 0).length,
  missingOperationTriples: audit.reduce((sum, item) => sum + item.missingOperations.length, 0),
  functionsWithOverdeclaredRelations: audit.filter((item) => item.overdeclaredRelations.length > 0).length,
  functionsWithOverdeclaredOperations: audit.filter((item) => item.overdeclaredOperations.length > 0).length,
  functionsWithAnyOverbreadth: audit.filter((item) => item.overdeclaredRelations.length > 0
    || item.overdeclaredOperations.length > 0).length,
  overdeclaredRelationPairs: audit.reduce((sum, item) => sum + item.overdeclaredRelations.length, 0),
  overdeclaredOperationTriples: audit.reduce((sum, item) => sum + item.overdeclaredOperations.length, 0),
  unresolvedMentions: audit.reduce((sum, item) => sum + item.unresolved.length, 0),
};

const underDeclaration = {
  absentRelationGaps: audit.flatMap((item) => item.absentRelations.map((relation) => ({
    signature: item.signature, migration: item.migration, line: item.line, relation, requiredOperation: 'SELECT',
  }))),
  missingOperationGaps: audit.flatMap((item) => item.missingOperations.map((gap) => ({
    signature: item.signature, migration: item.migration, line: item.line, ...gap,
  }))),
};

const selectedSurfaces = [...declaredBySignature.values()].flatMap((surfaces) => [...surfaces.values()]);
const operationColumnInspection = {
  declaredSurfaceRows: selectedSurfaces.length,
  multiOperationSurfaceRows: selectedSurfaces.filter((surface) => surface.operations.length > 1).length,
  rowsWithOperationColumns: selectedSurfaces.filter((surface) => surface.operationColumns).length,
  multiOperationRowsWithoutOperationColumns: selectedSurfaces.filter((surface) => surface.operations.length > 1
    && !surface.operationColumns).length,
  note: 'absence of operationColumns is an inspection signal, not by itself a gap; exact per-function relation/operation overbreadth is in audit',
};

console.log(JSON.stringify({ summary, underDeclaration, ownerRoleAggregate, operationColumnInspection, audit }, null, 2));
if (summary.absentRelationPairs > 0 || summary.missingOperationTriples > 0 || summary.unresolvedMentions > 0) {
  process.exitCode = 1;
}
