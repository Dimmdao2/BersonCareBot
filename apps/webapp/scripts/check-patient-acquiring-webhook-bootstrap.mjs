#!/usr/bin/env node
/**
 * Disposable PostgreSQL acceptance for the pre-principal patient acquiring resolver.
 * It reads only the forward migration, starts a socket-only private cluster in /tmp, and never
 * reads application database configuration or contacts DEV/TEST/PROD.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { userInfo } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import pg from 'pg';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const pgBin = '/usr/lib/postgresql/16/bin';
const osUser = userInfo().username;
const migrationPath = path.join(
  root,
  'apps/webapp/db/drizzle-migrations/0449_patient_acquiring_webhook_bootstrap_resolver_local.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');
const stamp = `${process.pid}_${Date.now()}`;
const dir = mkdtempSync(`/tmp/bcb_patient_acquiring_bootstrap_${stamp}_`);
const data = path.join(dir, 'data');
const socket = path.join(dir, 'socket');
const log = path.join(dir, 'postgres.log');
const database = `bcb_patient_acquiring_bootstrap_${stamp}`;
const safeEnv = { LANG: 'C', LC_ALL: 'C', PATH: `${pgBin}:/usr/bin:/bin` };
let port;
let started = false;

const ORG = '10000000-0000-4000-8000-000000000001';
const OTHER_ORG = '10000000-0000-4000-8000-000000000002';

function fail(message) {
  throw new Error(`patient acquiring webhook bootstrap acceptance failed: ${message}`);
}

function shell(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env: safeEnv });
  if (result.error || result.status !== 0) fail(`${label}: ${result.stderr || result.error}`);
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') fail('private port reservation failed');
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

function client() {
  return new pg.Client({ host: socket, port, database, user: osUser, ssl: false });
}

async function withClient(fn) {
  const connection = client();
  await connection.connect();
  try {
    return await fn(connection);
  } finally {
    await connection.end();
  }
}

async function withAttestedBootstrap(connection, providerId, providerPaymentId, fn) {
  await connection.query('BEGIN');
  try {
    await connection.query(
      `INSERT INTO app_ext.accepted_port_contexts (
         database_oid, backend_pid, transaction_id, session_login, target_role, context_class,
         purpose, function_identity, typed_args_hash
       ) VALUES (
         (SELECT oid FROM pg_database WHERE datname = current_database()),
         pg_backend_pid(), pg_current_xact_id(), session_user, 'app_pre_session', 'pre_session',
         'patient-payment.webhook.resolve',
         'app.resolve_patient_acquiring_webhook_organization(text,text)'::regprocedure,
         app.hash_port_typed_args(ARRAY[
           ROW('text@1', pg_catalog.textsend($1::text))::app.port_typed_arg,
           ROW('text@1', pg_catalog.textsend($2::text))::app.port_typed_arg
         ])
       )`,
      [providerId, providerPaymentId],
    );
    await connection.query('SET ROLE app_pre_session');
    const result = await fn();
    await connection.query('RESET ROLE');
    await connection.query('ROLLBACK');
    return result;
  } catch (error) {
    await connection.query('RESET ROLE').catch(() => undefined);
    await connection.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function install() {
  await withClient(async (connection) => {
    await connection.query(`
      CREATE ROLE app_seam_context_owner NOLOGIN NOINHERIT NOBYPASSRLS;
      CREATE ROLE app_seam_payment_webhook_owner NOLOGIN NOINHERIT NOBYPASSRLS;
      CREATE ROLE app_pre_session NOLOGIN NOINHERIT NOBYPASSRLS;
      GRANT app_pre_session TO ${osUser};
      CREATE SCHEMA app;
      CREATE SCHEMA app_ext;
      CREATE TYPE app.port_context_class AS ENUM ('pre_session');
      CREATE TYPE app.port_typed_arg AS (type_tag text, value bytea);
      CREATE TABLE app_ext.accepted_port_contexts (
        database_oid oid NOT NULL,
        backend_pid integer NOT NULL,
        transaction_id xid8 NOT NULL,
        session_login name NOT NULL,
        target_role name NOT NULL,
        context_class app.port_context_class NOT NULL,
        purpose text NOT NULL,
        function_identity regprocedure NOT NULL,
        typed_args_hash bytea NOT NULL
      );
      CREATE TABLE public.patient_payment (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid,
        patient_user_id uuid NOT NULL,
        amount_minor integer NOT NULL,
        kind text NOT NULL,
        status text NOT NULL,
        provider text,
        provider_payment_id text,
        payload_json jsonb NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE FUNCTION app.hash_port_typed_args(p_args app.port_typed_arg[])
      RETURNS bytea LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
      AS $$ SELECT pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.array_to_string(p_args::text[], '|'), 'UTF8')) $$;
      CREATE FUNCTION app.require_accepted_context(
        p_effective_role name,
        p_target_role name,
        p_context_class app.port_context_class,
        p_purpose text,
        p_typed_args_hash bytea,
        p_function_identity regprocedure
      ) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app, app_ext AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM app_ext.accepted_port_contexts context
          WHERE context.database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
            AND context.backend_pid = pg_backend_pid()
            AND context.transaction_id = pg_current_xact_id()
            AND context.session_login = session_user
            AND context.target_role = p_target_role
            AND context.context_class = p_context_class
            AND context.purpose = p_purpose
            AND context.function_identity = p_function_identity
            AND context.typed_args_hash = p_typed_args_hash
            AND pg_catalog.pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = p_function_identity)) = p_effective_role
        ) THEN
          RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required';
        END IF;
        RETURN true;
      END $$;
      ALTER FUNCTION app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure)
        OWNER TO app_seam_context_owner;
      GRANT USAGE ON SCHEMA app, app_ext TO app_seam_context_owner, app_seam_payment_webhook_owner, app_pre_session;
      GRANT SELECT ON app_ext.accepted_port_contexts TO app_seam_context_owner;
      GRANT EXECUTE ON FUNCTION app.hash_port_typed_args(app.port_typed_arg[]) TO app_seam_payment_webhook_owner;
      GRANT EXECUTE ON FUNCTION app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure)
        TO app_seam_payment_webhook_owner;
      ALTER TABLE public.patient_payment ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.patient_payment FORCE ROW LEVEL SECURITY;
      CREATE POLICY patient_payment_bootstrap_seam ON public.patient_payment
        FOR SELECT TO app_seam_payment_webhook_owner USING (true);
    `);
    await connection.query(migrationSql);
    await connection.query(`
      INSERT INTO public.patient_payment (
        organization_id, patient_user_id, amount_minor, kind, status, provider, provider_payment_id, payload_json
      ) VALUES
        ('${ORG}', '20000000-0000-4000-8000-000000000001', 199900, 'acquiring', 'pending', 'provider-a', 'exact-ref',
         '{"amountMinor":199900,"patientUserId":"20000000-0000-4000-8000-000000000001"}'),
        ('${ORG}', '20000000-0000-4000-8000-000000000006', 199900, 'acquiring', 'paid', 'provider-a', 'replay-ref', '{}'),
        ('${OTHER_ORG}', '20000000-0000-4000-8000-000000000002', 9900, 'acquiring', 'pending', 'provider-b', 'foreign-ref', '{}'),
        ('${ORG}', '20000000-0000-4000-8000-000000000003', 100, 'cash', 'paid', 'provider-a', 'cash-ref', '{}'),
        ('${ORG}', '20000000-0000-4000-8000-000000000004', 100, 'acquiring', 'pending', 'provider-a', 'ambiguous-ref', '{}'),
        ('${OTHER_ORG}', '20000000-0000-4000-8000-000000000005', 100, 'acquiring', 'paid', 'provider-a', 'ambiguous-ref', '{}')
    `);
  });
}

async function prove() {
  await withClient(async (connection) => {
    await connection.query('SET ROLE app_pre_session');
    await connection.query(
      `SELECT app.resolve_patient_acquiring_webhook_organization('provider-a', 'exact-ref')`,
    ).then(
      () => fail('unattested bootstrap call was accepted'),
      (error) => {
        if (!String(error.message).includes('accepted port context required')) throw error;
      },
    );
    await connection.query('RESET ROLE');

    const exact = await withAttestedBootstrap(connection, 'provider-a', 'exact-ref', () =>
      connection.query(
        `SELECT app.resolve_patient_acquiring_webhook_organization($1::text, $2::text)::text AS organization_id`,
        ['provider-a', 'exact-ref'],
      ),
    );
    if (exact.rows[0]?.organization_id !== ORG || Object.keys(exact.rows[0] ?? {}).join(',') !== 'organization_id') {
      fail('exact bootstrap resolver did not return only the owning organization UUID');
    }

    const replay = await withAttestedBootstrap(connection, 'provider-a', 'replay-ref', () =>
      connection.query(
        `SELECT app.resolve_patient_acquiring_webhook_organization($1::text, $2::text)::text AS organization_id`,
        ['provider-a', 'replay-ref'],
      ),
    );
    if (replay.rows[0]?.organization_id !== ORG) fail('terminal acquiring replay cannot resolve its owning organization');

    for (const [providerId, providerPaymentId, label] of [
      ['provider-a', 'foreign-ref', 'foreign provider reference'],
      ['provider-b', 'exact-ref', 'wrong provider'],
      ['provider-a', 'cash-ref', 'non-acquiring payment'],
      ['provider-a', 'ambiguous-ref', 'ambiguous payment authority'],
    ]) {
      const result = await withAttestedBootstrap(connection, providerId, providerPaymentId, () =>
        connection.query(
          `SELECT app.resolve_patient_acquiring_webhook_organization($1::text, $2::text)::text AS organization_id`,
          [providerId, providerPaymentId],
        ),
      );
      if (result.rows[0]?.organization_id !== null) fail(`${label} did not fail closed`);
    }

    await connection.query('SET ROLE app_pre_session');
    let directReadDenied = false;
    try {
      await connection.query('SELECT amount_minor, patient_user_id, payload_json FROM public.patient_payment');
    } catch (error) {
      directReadDenied = String(error.message).includes('permission denied');
    } finally {
      await connection.query('RESET ROLE');
    }
    if (!directReadDenied) fail('bootstrap role can directly read patient payment payload or amount data');
  });
}

try {
  if (!existsSync(path.join(pgBin, 'initdb'))) fail('PostgreSQL 16 binaries are unavailable');
  port = await reservePort();
  mkdirSync(socket, { recursive: true });
  shell(path.join(pgBin, 'initdb'), ['-D', data, '-A', 'trust', '--no-locale'], 'private initdb');
  shell(
    path.join(pgBin, 'pg_ctl'),
    ['-D', data, '-l', log, '-o', `-k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start'],
    'private PostgreSQL startup',
  );
  started = true;
  shell(path.join(pgBin, 'createdb'), ['-h', socket, '-p', String(port), database], 'private database creation');
  await install();
  await prove();
  console.log('patient acquiring webhook bootstrap acceptance: OK');
} finally {
  if (started) {
    spawnSync(path.join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], {
      cwd: root,
      encoding: 'utf8',
      env: safeEnv,
    });
  }
  rmSync(dir, { recursive: true, force: true });
}
