#!/usr/bin/env node
// Disposable catalog only: it materializes the existing revision-10 declaration so the real
// production artifact can be applied without touching DEV/TEST.  It does not grant policy/ACL.
import { declaration } from '../declaration.ts';
import {
  getPhase4LockedPolicyTargets,
  renderPhase4StrictPredicate,
} from '../../../../docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs';

const dbName = process.argv[2] ?? 'bcb_webapp_dev';
const db = declaration.databases[dbName];
if (!db) throw new Error(`undeclared database '${dbName}'`);
const context = declaration.portContext;
const q = (name) => `"${name.replaceAll('"', '""')}"`;
const split = (identity) => identity.split('.').map(q).join('.');
const schemas = new Set([
  ...Object.keys(db.schemas),
  ...Object.keys(db.tables).map((key) => key.split('.')[0]),
  ...Object.keys(context.privateRelations).map((key) => key.split('.')[0]),
]);
const lockedColumns = new Map();
function addColumn(table, column) {
  const columns = lockedColumns.get(table) ?? new Set(['id']);
  columns.add(column);
  lockedColumns.set(table, columns);
}
for (const { descriptor } of getPhase4LockedPolicyTargets()) {
  const predicate = renderPhase4StrictPredicate(descriptor);
  const aliases = new Map([...predicate.matchAll(/FROM\s+"([^"]+)"\."([^"]+)"\s+AS\s+"([^"]+)"|JOIN\s+"([^"]+)"\."([^"]+)"\s+AS\s+"([^"]+)"/g)]
    .map((match) => [match[3] ?? match[6], `${match[1] ?? match[4]}.${match[2] ?? match[5]}`]));
  let outerPredicate = predicate;
  for (const [alias, table] of aliases) {
    for (const match of predicate.matchAll(new RegExp(`"${alias}"\\."([^"]+)"`, 'g'))) {
      addColumn(table, match[1]);
    }
    outerPredicate = outerPredicate.replaceAll(new RegExp(`"${alias}"\\."[^"]+"`, 'g'), '');
  }
  for (const match of outerPredicate.matchAll(/"([^"]+)"/g)) addColumn(descriptor.table, match[1]);
}
function columnType(identity, column) {
  if (['audience', 'target_type', 'usage_purpose'].includes(column)) return 'text';
  if (['integrator_user_id', 'integrator_rule_id'].includes(column)
    || (identity.startsWith('integrator.') && column !== 'organization_id')) return 'bigint';
  return 'uuid';
}
const lines = ['\\set ON_ERROR_STOP on'];
for (const [role] of Object.entries(declaration.cluster.roles).sort(([a], [b]) => a.localeCompare(b))) {
  if (role === 'postgres') continue;
  lines.push(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${q(role)} NOLOGIN NOINHERIT NOBYPASSRLS; END IF; END $$;`);
}
for (const login of Object.keys(declaration.envMapping).flatMap((env) => Object.keys(declaration.envMapping[env])).sort()) {
  lines.push(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${login}') THEN CREATE ROLE ${q(login)} NOLOGIN NOINHERIT NOBYPASSRLS; END IF; END $$;`);
}
for (const schema of [...schemas].sort()) lines.push(`CREATE SCHEMA IF NOT EXISTS ${q(schema)};`);
lines.push(
  'CREATE DOMAIN app.port_context_class AS text;',
  'CREATE TYPE app.port_context_claims AS (payload text);',
  'CREATE TYPE app.port_typed_arg AS (payload text);',
);
for (const identity of Object.keys(context.privateRelations).sort()) {
  lines.push(`CREATE TABLE ${split(identity)} (id integer);`);
}
for (const identity of Object.keys(db.tables).sort()) {
  const columns = new Set(['id', ...(lockedColumns.get(identity) ?? [])]);
  for (const grant of Object.values(db.tables[identity].grants ?? {})) {
    for (const privilege of grant.privs ?? []) {
      if (typeof privilege === 'object' && privilege.kind === 'columns') {
        for (const column of privilege.columns) columns.add(column);
      }
    }
  }
  lines.push(`CREATE TABLE ${split(identity)} (${[...columns].sort().map((column) => `${q(column)} ${columnType(identity, column)}`).join(', ')});`);
}
for (const [signature, functionDecl] of Object.entries(context.functions)
  .filter(([, entry]) => !entry.databases || entry.databases.includes(dbName))
  .sort(([a], [b]) => a.localeCompare(b))) {
  const returns = functionDecl.returns;
  if (returns === 'trigger') {
    lines.push(`CREATE FUNCTION ${signature} RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;`);
    continue;
  }
  const body = signature === 'app.current_org_id()'
    ? "SELECT nullif(current_setting('app.org_id', true), '')::uuid"
    : signature === 'app.current_patient_user_id()'
      ? "SELECT nullif(current_setting('app.patient_id', true), '')::uuid"
      : signature === 'app.is_staff()'
        ? "SELECT current_user = 'app_staff'"
        : returns === 'uuid' ? 'SELECT NULL::uuid' : returns === 'bigint' ? 'SELECT NULL::bigint'
          : returns === 'integer' ? 'SELECT NULL::integer' : returns === 'text' ? 'SELECT NULL::text'
            : returns === 'timestamp with time zone' ? 'SELECT NULL::timestamptz'
              : returns === 'jsonb' ? 'SELECT NULL::jsonb' : returns === 'record' ? 'SELECT ROW(NULL)'
                : returns === 'saas_tariffs' ? 'SELECT NULL::public.saas_tariffs'
                  : returns === 'bytea' ? "SELECT ''::bytea" : returns === 'boolean' ? 'SELECT true' : 'SELECT NULL::void';
  lines.push(`CREATE FUNCTION ${signature} RETURNS ${returns} LANGUAGE sql AS $$ ${body} $$;`);
}
process.stdout.write(`${lines.join('\n')}\n`);
