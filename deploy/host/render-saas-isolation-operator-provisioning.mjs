#!/usr/bin/env node

const EXPECTED_DATABASE = 'bersoncarebot_test';
const URL_KEY = 'SAAS_ISOLATION_OPERATOR_DATABASE_URL';
const FORBIDDEN_ROLES = new Set([
  'app_owner',
  'app_staff',
  'app_patient',
  'app_worker',
  'saas_telemetry_owner',
  'saas_telemetry_operator',
]);

function fail(message) {
  throw new Error(message);
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function readContract() {
  const rawUrl = process.env[URL_KEY]?.trim();
  if (!rawUrl) fail(`${URL_KEY} is required`);

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail(`${URL_KEY} must be a valid PostgreSQL URL`);
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    fail(`${URL_KEY} must use postgres:// or postgresql://`);
  }

  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const role = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (database !== EXPECTED_DATABASE) fail(`${URL_KEY} must target exact ${EXPECTED_DATABASE}`);
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(role))
    fail(`${URL_KEY} contains an invalid PostgreSQL login`);
  if (FORBIDDEN_ROLES.has(role)) fail(`${URL_KEY} must use a distinct diagnostic login`);
  if (Buffer.byteLength(password, 'utf8') < 32)
    fail(`${URL_KEY} password must be at least 32 bytes`);
  return { role, password };
}

function render({ role, password }) {
  const roleIdentifier = quoteIdentifier(role);
  return `\\set ON_ERROR_STOP on
DO $operator_login$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteLiteral(role)}) THEN
    CREATE ROLE ${roleIdentifier} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE ${roleIdentifier} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$operator_login$;
ALTER ROLE ${roleIdentifier} PASSWORD ${quoteLiteral(password)};
DO $revoke_stale_memberships$
DECLARE
  granted_role text;
BEGIN
  FOR granted_role IN
    SELECT granted.rolname
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE member.rolname = ${quoteLiteral(role)}
  LOOP
    EXECUTE format('REVOKE %I FROM %I', granted_role, ${quoteLiteral(role)});
  END LOOP;
END
$revoke_stale_memberships$;
`;
}

try {
  if (process.stdout.isTTY) fail('refusing to render credential-bearing SQL to a terminal');
  process.stdout.write(render(readContract()));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
