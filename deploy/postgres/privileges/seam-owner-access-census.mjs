#!/usr/bin/env node
/**
 * Repeatable catalog census for SECURITY DEFINER seam owners.
 *
 * The expected relation/operation set comes from declaration.ts. Its relation operations are
 * independently checked against the active function bodies by function-census.test.mjs. Catalog
 * ACLs come from the named database and are classified as owned, direct-table, direct-columns,
 * inherited, partial, or missing. role_table_grants alone is intentionally insufficient because
 * PostgreSQL keeps column ACLs in pg_attribute.attacl.
 *
 * Run on DEV:
 *   node deploy/postgres/privileges/seam-owner-access-census.mjs --db bcb_webapp_dev
 */
import { execFileSync } from 'node:child_process';

import { declaration } from './declaration.ts';

const args = process.argv.slice(2);
const dbIndex = args.indexOf('--db');
const database = dbIndex >= 0 ? args[dbIndex + 1] : 'bcb_webapp_dev';
if (!database || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(database)) {
  throw new Error(`unsafe database identifier '${database ?? ''}'`);
}
if (args.some((arg, index) => arg !== '--db' && index !== dbIndex + 1)) {
  throw new Error('usage: seam-owner-access-census.mjs [--db <named DEV/TEST database>]');
}

const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sqlArray = (values) => `ARRAY[${values.map(sqlLiteral).join(',')}]::text[]`;

const expected = [];
for (const [signature, fn] of Object.entries(declaration.portContext.functions)) {
  if (fn.security !== 'DEFINER') continue;
  const owner = declaration.cluster.roles[fn.owner];
  if (!owner || owner.kind !== 'owner' || !fn.owner.startsWith('app_seam_')) continue;
  for (const surface of fn.relationSurfaces ?? []) {
    for (const operation of surface.operations) {
      expected.push({
        owner: fn.owner,
        signature,
        relation: surface.relation,
        operation,
        columns: surface.operationColumns?.[operation] ?? surface.columns,
        requiresTable: surface.tableOperations?.includes(operation) ?? operation === 'DELETE',
      });
    }
  }
}

const values = expected.map((row) => `(${[
  sqlLiteral(row.owner), sqlLiteral(row.signature), sqlLiteral(row.relation),
  sqlLiteral(row.operation), sqlArray(row.columns), row.requiresTable ? 'true' : 'false',
].join(',')})`).join(',\n');

const sql = String.raw`
BEGIN READ ONLY;
WITH RECURSIVE
expected(owner_name, function_identity, relation_name, operation, columns, requires_table) AS (
  VALUES ${values}
),
membership(member_oid, role_oid, path, all_inherit) AS (
  SELECT member.oid, edge.roleid, ARRAY[target.rolname]::text[], edge.inherit_option
    FROM pg_catalog.pg_roles AS member
    JOIN pg_catalog.pg_auth_members AS edge ON edge.member = member.oid
    JOIN pg_catalog.pg_roles AS target ON target.oid = edge.roleid
   WHERE member.rolname IN (SELECT DISTINCT owner_name FROM expected)
  UNION ALL
  SELECT membership.member_oid, edge.roleid, membership.path || target.rolname,
         membership.all_inherit AND edge.inherit_option
    FROM membership
    JOIN pg_catalog.pg_auth_members AS edge ON edge.member = membership.role_oid
    JOIN pg_catalog.pg_roles AS target ON target.oid = edge.roleid
   WHERE NOT target.rolname = ANY(membership.path)
),
membership_summary AS (
  SELECT member.rolname AS owner_name,
         COALESCE(string_agg(array_to_string(path, ' -> ') ||
           CASE WHEN all_inherit THEN ' [inherit]' ELSE ' [set-only]' END, '; ' ORDER BY path), 'none') AS paths
    FROM pg_catalog.pg_roles AS member
    LEFT JOIN membership ON membership.member_oid = member.oid
   WHERE member.rolname IN (SELECT DISTINCT owner_name FROM expected)
   GROUP BY member.rolname
),
catalog AS (
  SELECT expected.*, relation.oid AS relation_oid, relation.relowner,
         owner_role.oid AS owner_oid,
         EXISTS (
           SELECT 1 FROM pg_catalog.aclexplode(COALESCE(relation.relacl,
             pg_catalog.acldefault('r', relation.relowner))) AS acl
            WHERE acl.grantee = owner_role.oid AND acl.privilege_type = expected.operation
         ) AS direct_table,
         COALESCE((
           SELECT bool_and(EXISTS (
             SELECT 1 FROM pg_catalog.aclexplode(COALESCE(attribute.attacl, '{}'::aclitem[])) AS acl
              WHERE acl.grantee = owner_role.oid AND acl.privilege_type = expected.operation
           ))
             FROM unnest(expected.columns) AS named(column_name)
             JOIN pg_catalog.pg_attribute AS attribute
               ON attribute.attrelid = relation.oid AND attribute.attname = named.column_name
              AND attribute.attnum > 0 AND NOT attribute.attisdropped
         ), false) AS direct_columns,
         pg_catalog.has_table_privilege(expected.owner_name, relation.oid, expected.operation) AS effective_table,
         COALESCE((
           SELECT bool_and(pg_catalog.has_column_privilege(
             expected.owner_name, relation.oid, attribute.attnum, expected.operation))
             FROM unnest(expected.columns) AS named(column_name)
             JOIN pg_catalog.pg_attribute AS attribute
               ON attribute.attrelid = relation.oid AND attribute.attname = named.column_name
              AND attribute.attnum > 0 AND NOT attribute.attisdropped
         ), false) AS effective_columns
    FROM expected
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.rolname = expected.owner_name
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = pg_catalog.to_regclass(expected.relation_name)
),
classified AS (
  SELECT catalog.*,
         CASE
           WHEN relowner = owner_oid THEN 'owned'
           WHEN direct_table THEN 'direct-table'
           WHEN NOT requires_table AND direct_columns THEN 'direct-columns'
           WHEN effective_table OR (NOT requires_table AND effective_columns) THEN 'inherited'
           WHEN direct_columns OR effective_columns THEN 'partial'
           ELSE 'missing'
         END AS access_status
    FROM catalog
),
requirements AS (
  SELECT owner_name, function_identity, relation_name, operation, columns, requires_table,
         access_status
    FROM classified
),
root_counts AS (
  SELECT owner_name, count(DISTINCT function_identity) AS root_count
    FROM expected
   GROUP BY owner_name
)
SELECT jsonb_build_object(
  'database', current_database(),
  'owners', (
    SELECT jsonb_agg(jsonb_build_object(
      'owner', owners.owner_name,
      'memberships', memberships.paths,
      'roots', owners.root_count,
      'reads', owners.reads,
      'writes', owners.writes,
      'missing', owners.missing
    ) ORDER BY owners.owner_name)
    FROM (
      SELECT owner_name,
             root_counts.root_count,
             COALESCE(string_agg(DISTINCT relation_name || '[' || access_status || ']', ', '
               ORDER BY relation_name || '[' || access_status || ']') FILTER (WHERE operation = 'SELECT'), '') AS reads,
             COALESCE(string_agg(DISTINCT relation_name || ':' || operation || '[' || access_status || ']', ', '
               ORDER BY relation_name || ':' || operation || '[' || access_status || ']')
               FILTER (WHERE operation <> 'SELECT'), '') AS writes,
             count(*) FILTER (WHERE access_status IN ('missing', 'partial')) AS missing
        FROM requirements
        JOIN root_counts USING (owner_name)
       GROUP BY owner_name, root_counts.root_count
    ) AS owners
    JOIN membership_summary AS memberships USING (owner_name)
  ),
  'requirements', (
    SELECT jsonb_agg(to_jsonb(requirements)
      ORDER BY owner_name, function_identity, relation_name, operation)
      FROM requirements
  )
)::text;
ROLLBACK;
`;

const output = execFileSync('sudo', [
  '-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
  '-h', '/var/run/postgresql', '-p', '5432', '-d', database,
  '-v', 'ON_ERROR_STOP=1', '-f', '-',
], { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const census = JSON.parse(output);

console.log(`# seam-owner access census: ${census.database}`);
console.log('| owner | roots | memberships | reads | writes | missing/partial |');
console.log('|---|---:|---|---|---|---:|');
for (const row of census.owners) {
  const escape = (value) => String(value || '—').replaceAll('|', '\\|');
  console.log(`| ${escape(row.owner)} | ${row.roots} | ${escape(row.memberships)} | ${escape(row.reads)} | ${escape(row.writes)} | ${row.missing} |`);
}
const gaps = census.requirements.filter((row) => ['missing', 'partial'].includes(row.access_status));
if (gaps.length > 0) {
  console.log('\n## root-level gaps');
  console.log('| owner | root | relation | operation | status |');
  console.log('|---|---|---|---|---|');
  for (const row of gaps) {
    console.log(`| ${row.owner_name} | ${row.function_identity} | ${row.relation_name} | ${row.operation} | ${row.access_status} |`);
  }
}
console.log(`\nowners=${census.owners.length}`);
console.log(`requirements=${census.requirements.length}`);
console.log(`missing_or_partial=${gaps.length}`);
