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
function optionalArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}
function lit(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function values(rows) { return rows.length === 0 ? 'SELECT NULL::text WHERE false' : `VALUES ${rows.join(', ')}`; }

const dbName = arg('db');
const connectDb = optionalArg('connect-db') ?? dbName;
const functionsOnly = process.argv.includes('--functions-only');
const db = declaration.databases[dbName];
if (!db) throw new Error(`undeclared database '${dbName}'`);
const context = declaration.portContext;
if (!context) throw new Error('revision-10 port context is absent');
const dbLoginNames = Object.values(declaration.envMapping).flatMap((records) => Object.keys(records)
  .filter((login) => records[login].connect.includes(dbName)));
// Check every declared login, not merely the three which belong to this DB: a
// cross-environment ACL is a catalog drift, not an invisible principal.
const loginNames = Object.values(declaration.envMapping).flatMap((records) => Object.keys(records));
const principals = [...new Set([...Object.keys(declaration.cluster.roles), ...loginNames, 'PUBLIC'])].sort();
const managedSchemas = ['public', 'app', 'integrator', 'app_ext', 'drizzle'];
const expectedRelations = [...Object.keys(db.tables), ...Object.keys(context.privateRelations)].sort();
const expectedPolicies = Object.entries(db.tables).flatMap(([table, decl]) => (decl.policies ?? [])
  .filter((policy) => !('todo' in policy)).map((policy) => [table, policy.name]));
const expectedFunctions = Object.entries(context.functions)
  .filter(([, fn]) => !fn.databases || fn.databases.includes(dbName))
  .map(([signature, fn]) => {
    const executes = [...new Set([...fn.execute, ...(fn.loginExecute ? dbLoginNames : [])])].sort();
    return [signature, fn.owner, fn.returns, fn.security === 'DEFINER', fn.volatility, fn.parallel,
      fn.proconfig.join('\u001f'), executes.join('\u001f')];
  });
const expectedAcl = Object.entries(db.tables).flatMap(([table, decl]) => Object.entries(decl.grants).flatMap(([role, grant]) =>
  grant.privs.filter((privilege) => typeof privilege === 'string').map((privilege) => [table, role, privilege])));
const expectedSchemaAcl = Object.entries(db.schemas).flatMap(([schema, decl]) => [
  ...decl.usage.map((role) => [schema, role, 'USAGE']),
  ...decl.create.map((role) => [schema, role, 'CREATE']),
]);
const expectedFunctionSql = `expected_function(signature, owner_name, result_type, is_definer, volatility, parallelism, config, execute_roles) AS (${values(expectedFunctions.map((row) => `(${row.slice(0, 3).map(lit).join(', ')}, ${row[3]}, ${lit({ IMMUTABLE: 'i', STABLE: 's', VOLATILE: 'v' }[row[4]])}, ${lit({ SAFE: 's', RESTRICTED: 'r', UNSAFE: 'u' }[row[5]])}, ${lit(row[6])}, ${lit(row[7])})`))})`;
const principalSql = `principal(rolname, grantee_oid) AS (${values(principals.map((value) => `(${lit(value)}, ${value === 'PUBLIC' ? 0 : `(SELECT oid FROM pg_roles WHERE rolname=${lit(value)})`})`))})`;
const functionQ = `
WITH ${expectedFunctionSql}, ${principalSql}
SELECT 'undeclared_definer:' || format('%I.%I(%s)',n.nspname,p.proname,replace(oidvectortypes(p.proargtypes),', ',','))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prosecdef AND n.nspname = ANY(ARRAY[${managedSchemas.map(lit).join(', ')}])
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
   AND NOT EXISTS (SELECT 1 FROM expected_function e WHERE p.oid=to_regprocedure(e.signature))
UNION ALL
SELECT 'missing_or_mismatched_function:' || e.signature FROM expected_function e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 WHERE p.oid IS NULL OR pg_get_userbyid(p.proowner) <> e.owner_name OR format_type(p.prorettype,NULL) <> e.result_type
    OR p.prosecdef <> e.is_definer OR p.provolatile <> e.volatility OR p.proparallel <> e.parallelism
    OR array_to_string(coalesce(p.proconfig, ARRAY[]::text[]), E'\\x1f') <> e.config
UNION ALL
SELECT 'unexpected_function_execute_acl:' || e.signature || ':' || coalesce(granted.rolname,'PUBLIC')
  FROM expected_function e JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
  LEFT JOIN pg_roles granted ON granted.oid=a.grantee
 WHERE a.privilege_type='EXECUTE' AND a.grantee <> p.proowner
   AND (a.grantee=0 OR granted.rolname IS NULL OR NOT granted.rolname=ANY(string_to_array(e.execute_roles,E'\\x1f')))
UNION ALL
SELECT 'missing_function_execute_acl:' || e.signature || ':' || expected_role
  FROM expected_function e JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 CROSS JOIN LATERAL unnest(string_to_array(e.execute_roles,E'\\x1f')) expected_role
 WHERE expected_role <> e.owner_name
   AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a JOIN pg_roles granted ON granted.oid=a.grantee WHERE a.privilege_type='EXECUTE' AND granted.rolname=expected_role)
UNION ALL
SELECT 'unsafe_seam_owner:' || r.rolname FROM pg_roles r
 WHERE (r.rolname LIKE 'app_seam_%_owner' OR r.rolname IN ('saas_telemetry_owner','saas_system_health_owner'))
   AND (r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR r.rolinherit)
UNION ALL
SELECT 'seam_owner_membership:' || owner.rolname || ':' || member.rolname
  FROM pg_auth_members m JOIN pg_roles owner ON owner.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
 WHERE owner.rolname LIKE 'app_seam_%_owner' OR owner.rolname IN ('saas_telemetry_owner','saas_system_health_owner')
    OR member.rolname LIKE 'app_seam_%_owner' OR member.rolname IN ('saas_telemetry_owner','saas_system_health_owner')
ORDER BY 1;`;
const fullQ = `
WITH expected_relation(identity) AS (${values(expectedRelations.map((value) => `(${lit(value)})`))}),
expected_policy(identity, policy_name) AS (${values(expectedPolicies.map(([table, policy]) => `(${lit(table)}, ${lit(policy)})`))}),
${expectedFunctionSql},
expected_acl(identity, grantee, privilege_type) AS (${values(expectedAcl.map((row) => `(${row.map(lit).join(', ')})`))}),
expected_schema_acl(schema_name, grantee, privilege_type) AS (${values(expectedSchemaAcl.map((row) => `(${row.map(lit).join(', ')})`))}),
${principalSql}
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
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname = ANY(ARRAY[${managedSchemas.map(lit).join(', ')}]) AND p.prosecdef
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
   AND NOT EXISTS (SELECT 1 FROM expected_function e WHERE p.oid=to_regprocedure(e.signature))
UNION ALL
SELECT 'missing_or_mismatched_function:' || e.signature FROM expected_function e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 WHERE p.oid IS NULL OR pg_get_userbyid(p.proowner) <> e.owner_name OR format_type(p.prorettype,NULL) <> e.result_type
    OR p.prosecdef <> e.is_definer OR p.provolatile <> e.volatility OR p.proparallel <> e.parallelism
    OR array_to_string(coalesce(p.proconfig, ARRAY[]::text[]), E'\\x1f') <> e.config
UNION ALL
SELECT 'unexpected_function_execute_acl:' || e.signature || ':' || coalesce(granted.rolname,'PUBLIC')
  FROM expected_function e JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
  LEFT JOIN pg_roles granted ON granted.oid=a.grantee
 WHERE a.privilege_type='EXECUTE' AND a.grantee <> p.proowner
   AND (a.grantee=0 OR granted.rolname IS NULL OR NOT granted.rolname=ANY(string_to_array(e.execute_roles,E'\\x1f')))
UNION ALL
SELECT 'missing_function_execute_acl:' || e.signature || ':' || expected_role
  FROM expected_function e JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 CROSS JOIN LATERAL unnest(string_to_array(e.execute_roles,E'\\x1f')) expected_role
 WHERE expected_role <> e.owner_name
   AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a JOIN pg_roles granted ON granted.oid=a.grantee WHERE a.privilege_type='EXECUTE' AND granted.rolname=expected_role)
UNION ALL
SELECT 'table_acl:' || n.nspname || '.' || c.relname || ':' || r.rolname || ':' || privilege_name
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN principal r
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) privilege_name
 WHERE r.rolname <> 'postgres' AND r.rolname <> pg_get_userbyid(c.relowner) AND n.nspname = ANY(ARRAY[${managedSchemas.map(lit).join(', ')}]) AND c.relkind IN ('r','p')
   AND EXISTS (SELECT 1 FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a WHERE a.grantee=r.grantee_oid AND a.privilege_type=privilege_name) <> EXISTS (SELECT 1 FROM expected_acl e WHERE e.identity=n.nspname || '.' || c.relname AND e.grantee=r.rolname AND e.privilege_type=privilege_name)
UNION ALL
SELECT 'schema_acl:' || n.nspname || ':' || r.rolname || ':' || privilege_name
  FROM pg_namespace n CROSS JOIN principal r CROSS JOIN unnest(ARRAY['USAGE','CREATE']) privilege_name
 WHERE n.nspname = ANY(ARRAY[${managedSchemas.map(lit).join(', ')}]) AND r.rolname <> pg_get_userbyid(n.nspowner)
   AND EXISTS (SELECT 1 FROM aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a WHERE a.grantee=r.grantee_oid AND a.privilege_type=privilege_name) <> EXISTS (SELECT 1 FROM expected_schema_acl e WHERE e.schema_name=n.nspname AND e.grantee=r.rolname AND e.privilege_type=privilege_name)
UNION ALL
SELECT 'default_acl:' || d.defaclrole::regrole::text FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a JOIN principal r ON r.rolname=(a.grantee::regrole)::text WHERE a.grantee <> d.defaclrole
UNION ALL
SELECT 'seam_owner_membership:' || owner.rolname || ':' || member.rolname
  FROM pg_auth_members m JOIN pg_roles owner ON owner.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
 WHERE owner.rolname LIKE 'app_seam_%_owner' OR owner.rolname IN ('saas_telemetry_owner','saas_system_health_owner')
    OR member.rolname LIKE 'app_seam_%_owner' OR member.rolname IN ('saas_telemetry_owner','saas_system_health_owner')
UNION ALL
SELECT 'unsafe_role:' || r.rolname FROM pg_roles r JOIN principal p ON p.rolname=r.rolname
 WHERE r.rolname <> 'postgres' AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR r.rolinherit)
ORDER BY 1;`;
const q = functionsOnly ? functionQ : fullQ;
const run = spawnSync('psql', ['-X', '-At', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-d', connectDb, '-c', q], { encoding: 'utf8' });
if (run.status !== 0) {
  process.stderr.write(run.stderr || run.stdout || 'catalog verifier failed to query PostgreSQL\n');
  process.exit(run.status ?? 1);
}
const violations = (run.stdout ?? '').trim();
if (violations) {
  process.stderr.write(`${violations}\n`);
  process.exit(1);
}
console.log(`catalog verifier green: ${dbName}${connectDb === dbName ? '' : ` via ${connectDb}`}`);
