#!/usr/bin/env node
// Catalog-side revision-10 verifier. It deliberately reads the real PostgreSQL catalog before
// reapply; a generator that merely replays SQL cannot claim a repaired catalog by itself.
import { spawnSync } from 'node:child_process';
import { declaration } from '../declaration.ts';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`--${name} is required`);
  return process.argv[index + 1];
}
function lit(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function values(rows) { return rows.length === 0 ? 'SELECT NULL::text WHERE false' : `VALUES ${rows.join(', ')}`; }

const dbName = arg('db');
const db = declaration.databases[dbName];
if (!db) throw new Error(`undeclared database '${dbName}'`);
const context = declaration.portContext;
if (!context) throw new Error('revision-10 port context is absent');
const loginNames = Object.values(declaration.envMapping).flatMap((records) => Object.keys(records)
  .filter((login) => records[login].connect.includes(dbName)));
const principals = [...new Set([...Object.keys(declaration.cluster.roles), ...loginNames])].sort();
const managedSchemas = ['public', 'app', 'integrator', 'app_ext', 'drizzle'];
const expectedRelations = [...Object.keys(db.tables), ...Object.keys(context.privateRelations)].sort();
const expectedPolicies = Object.entries(db.tables).flatMap(([table, decl]) => (decl.policies ?? [])
  .filter((policy) => !('todo' in policy)).map((policy) => [table, policy.name]));
const expectedFunctions = Object.entries(context.functions).map(([signature, fn]) => {
  const executes = [...new Set([...fn.execute, ...(fn.loginExecute ? loginNames : [])])].sort();
  return [signature, fn.owner, fn.returns, fn.security === 'DEFINER', fn.volatility, fn.parallel,
    fn.proconfig.join('\u001f'), executes.join('\u001f')];
});
const expectedAcl = Object.entries(db.tables).flatMap(([table, decl]) => Object.entries(decl.grants).flatMap(([role, grant]) =>
  grant.privs.filter((privilege) => typeof privilege === 'string').map((privilege) => [table, role, privilege])));
const q = `
WITH expected_relation(identity) AS (${values(expectedRelations.map((value) => `(${lit(value)})`))}),
expected_policy(identity, policy_name) AS (${values(expectedPolicies.map(([table, policy]) => `(${lit(table)}, ${lit(policy)})`))}),
expected_function(signature, owner_name, result_type, is_definer, volatility, parallelism, config, execute_roles) AS (${values(expectedFunctions.map((row) => `(${row.slice(0, 3).map(lit).join(', ')}, ${row[3]}, ${lit({ IMMUTABLE: 'i', STABLE: 's', VOLATILE: 'v' }[row[4]])}, ${lit({ SAFE: 's', RESTRICTED: 'r', UNSAFE: 'u' }[row[5]])}, ${lit(row[6])}, ${lit(row[7])})`))}),
expected_acl(identity, grantee, privilege_type) AS (${values(expectedAcl.map((row) => `(${row.map(lit).join(', ')})`))}),
principal(rolname) AS (${values(principals.map((value) => `(${lit(value)})`))})
SELECT 'undeclared_relation:' || n.nspname || '.' || c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname = ANY(ARRAY[${managedSchemas.map(lit).join(', ')}]) AND c.relkind IN ('r','p')
   AND NOT EXISTS (SELECT 1 FROM expected_relation e WHERE e.identity=n.nspname || '.' || c.relname)
UNION ALL
SELECT 'missing_relation:' || e.identity FROM expected_relation e WHERE to_regclass(e.identity) IS NULL
UNION ALL
SELECT 'undeclared_policy:' || p.schemaname || '.' || p.tablename || ':' || p.policyname FROM pg_policies p
 WHERE p.schemaname = ANY(ARRAY[${managedSchemas.map(lit).join(', ')}])
   AND NOT EXISTS (SELECT 1 FROM expected_policy e WHERE e.identity=p.schemaname || '.' || p.tablename AND e.policy_name=p.policyname)
UNION ALL
SELECT 'missing_policy:' || e.identity || ':' || e.policy_name FROM expected_policy e
 WHERE NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname=split_part(e.identity,'.',1) AND p.tablename=split_part(e.identity,'.',2) AND p.policyname=e.policy_name)
UNION ALL
SELECT 'permissive_using_true:' || p.schemaname || '.' || p.tablename || ':' || p.policyname
  FROM pg_policies p WHERE p.permissive='PERMISSIVE' AND (coalesce(p.qual,'') ~ '^\\(?true\\)?$' OR coalesce(p.with_check,'') ~ '^\\(?true\\)?$')
UNION ALL
SELECT 'undeclared_function:' || n.nspname || '.' || p.proname || '(' || replace(pg_get_function_identity_arguments(p.oid), ', ', ',') || ')'
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('app','app_ext')
   AND NOT EXISTS (SELECT 1 FROM expected_function e WHERE p.oid=to_regprocedure(e.signature))
UNION ALL
SELECT 'missing_or_mismatched_function:' || e.signature FROM expected_function e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 WHERE p.oid IS NULL OR pg_get_userbyid(p.proowner) <> e.owner_name OR format_type(p.prorettype,NULL) <> e.result_type
    OR p.prosecdef <> e.is_definer OR p.provolatile <> e.volatility OR p.proparallel <> e.parallelism
    OR array_to_string(coalesce(p.proconfig, ARRAY[]::text[]), E'\\x1f') <> e.config
UNION ALL
SELECT 'function_execute_acl:' || e.signature || ':' || r.rolname FROM expected_function e CROSS JOIN principal r
 WHERE r.rolname <> 'postgres' AND r.rolname <> e.owner_name
   AND (e.signature NOT IN ('app.clear_port_context()', 'app.install_port_context(uuid,app.port_context_claims)') OR r.rolname = ANY(string_to_array(e.execute_roles, E'\\x1f')))
   AND EXISTS (SELECT 1 FROM aclexplode(coalesce((SELECT p.proacl FROM pg_proc p WHERE p.oid=to_regprocedure(e.signature)), acldefault('f', (SELECT p.proowner FROM pg_proc p WHERE p.oid=to_regprocedure(e.signature))))) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=r.rolname) AND a.privilege_type='EXECUTE') <> (r.rolname = ANY(string_to_array(e.execute_roles, E'\\x1f')))
UNION ALL
SELECT 'table_acl:' || n.nspname || '.' || c.relname || ':' || r.rolname || ':' || privilege_name
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN principal r
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) privilege_name
 WHERE r.rolname <> 'postgres' AND r.rolname <> pg_get_userbyid(c.relowner) AND n.nspname = ANY(ARRAY[${managedSchemas.map(lit).join(', ')}]) AND c.relkind IN ('r','p')
   AND EXISTS (SELECT 1 FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=r.rolname) AND a.privilege_type=privilege_name) <> EXISTS (SELECT 1 FROM expected_acl e WHERE e.identity=n.nspname || '.' || c.relname AND e.grantee=r.rolname AND e.privilege_type=privilege_name)
UNION ALL
SELECT 'default_acl:' || d.defaclrole::regrole::text FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a JOIN principal r ON r.rolname=(a.grantee::regrole)::text WHERE a.grantee <> d.defaclrole
UNION ALL
SELECT 'unsafe_role:' || r.rolname FROM pg_roles r JOIN principal p ON p.rolname=r.rolname
 WHERE r.rolname <> 'postgres' AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR r.rolinherit)
ORDER BY 1;`;
const run = spawnSync('psql', ['-X', '-At', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-d', dbName, '-c', q], { encoding: 'utf8' });
if (run.status !== 0) {
  process.stderr.write(run.stderr || run.stdout || 'catalog verifier failed to query PostgreSQL\n');
  process.exit(run.status ?? 1);
}
const violations = (run.stdout ?? '').trim();
if (violations) {
  process.stderr.write(`${violations}\n`);
  process.exit(1);
}
console.log(`catalog verifier green: ${dbName}`);
