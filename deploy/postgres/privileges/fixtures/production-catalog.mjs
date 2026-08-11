#!/usr/bin/env node
// Disposable catalog only: it materializes the existing revision-10 declaration so the real
// production artifact can be applied without touching DEV/TEST.  It does not grant policy/ACL.
import { declaration } from '../declaration.ts';

const db = declaration.databases.bcb_webapp_dev;
const context = declaration.portContext;
const q = (name) => `"${name.replaceAll('"', '""')}"`;
const split = (identity) => identity.split('.').map(q).join('.');
const schemas = new Set([...Object.keys(db.schemas), ...Object.keys(db.tables).map((key) => key.split('.')[0])]);
const lines = ['\\set ON_ERROR_STOP on'];
for (const login of Object.keys(declaration.envMapping).flatMap((env) => Object.keys(declaration.envMapping[env])).sort()) {
  lines.push(`CREATE ROLE ${q(login)} NOLOGIN;`);
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
  const columns = new Set(['id']);
  for (const grant of Object.values(db.tables[identity].grants ?? {})) {
    for (const privilege of grant.privs ?? []) {
      if (typeof privilege === 'object' && privilege.kind === 'columns') {
        for (const column of privilege.columns) columns.add(column);
      }
    }
  }
  lines.push(`CREATE TABLE ${split(identity)} (${[...columns].sort().map((column) => `${q(column)} text`).join(', ')});`);
}
for (const signature of Object.keys(context.functions).sort()) {
  const returns = signature === 'app.current_org_id()' || signature === 'app_ext.resolve_variant_a_identity(uuid)' ? 'uuid' : 'void';
  const body = returns === 'uuid' ? 'SELECT NULL::uuid' : 'SELECT NULL::void';
  lines.push(`CREATE FUNCTION ${signature} RETURNS ${returns} LANGUAGE sql AS $$ ${body} $$;`);
}
process.stdout.write(`${lines.join('\n')}\n`);
