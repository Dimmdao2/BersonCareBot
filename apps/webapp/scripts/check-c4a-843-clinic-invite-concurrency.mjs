#!/usr/bin/env node
/**
 * C4A #843 — executable disposable PostgreSQL concurrency proof for the clinic-team seat policy.
 *
 * Replaces the prior static/source-string-only concurrency claim
 * (apps/webapp/src/infra/repos/pgOrganizationInvites.test.ts still keeps the static SQL-shape
 * contract; THIS script actually runs real concurrent transactions against a real PostgreSQL 16
 * server). It owns a private cluster under /tmp (own data dir, unix socket, database) and never
 * reads application env or connects to DEV/TEST/PROD — see
 * apps/webapp/scripts/smoke-s5-1-runtime-settings-contract.mjs for the established pattern this
 * follows. Output is aggregate-only (booleans/counts), no PII.
 *
 * Design note: `app.accept_org_invite` is a real stored PostgreSQL function, so its EXACT text is
 * extracted verbatim from deploy/postgres/organization-member-invites-rls.sql and CREATEd as-is —
 * zero reimplementation. `createReplacingPending` has no equivalent stored procedure (its
 * transaction lives in apps/webapp/src/infra/repos/pgOrganizationInvites.ts, gated behind the
 * webapp's `@/config/env` bootstrap, which loads dotenv application env files as a side effect of
 * import — importing it here would risk exactly the "never read application env" violation this
 * proof must avoid). Instead, this script extracts the literal SQL text of each statement
 * `createReplacingPending` issues (verbatim, via string-slicing — not retyped) and replays them in
 * the same order/parameters through a private `pg` client. The control-flow glue (if/else between
 * statements) is hand-written but mirrors the source function 1:1 and is checked by --self-test.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { userInfo } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import pg from 'pg';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const pgBin = '/usr/lib/postgresql/16/bin';
const ACTOR = '10000000-0000-4000-8000-000000000001';
const FAR_FUTURE_EXPIRY = '2030-01-01T00:00:00.000Z';
const OS_USER = userInfo().username;

function fail(label) {
  throw new Error(`C4A #843 clinic invite concurrency proof failed: ${label}`);
}

function stripLineComments(source) {
  return source.replace(/\/\/[^\n]*/g, '');
}

// ---------------------------------------------------------------------------
// Extraction: pull the exact SQL text this proof exercises out of the real
// production sources, without retyping it by hand.
// ---------------------------------------------------------------------------

export function extractAcceptOrgInviteFunctionSql(overlaySource) {
  const start = overlaySource.indexOf('CREATE OR REPLACE FUNCTION app.accept_org_invite');
  const end = overlaySource.indexOf('COMMENT ON FUNCTION app.accept_org_invite', start);
  if (start < 0 || end < 0) fail('could not locate app.accept_org_invite in the overlay source');
  return overlaySource.slice(start, end);
}

export function extractClinicSeatUsageSql(seatUsageSource) {
  const match = seatUsageSource.match(/export const CLINIC_SEAT_USAGE_SQL\s*=\s*`([\s\S]*?)`;/);
  if (!match) fail('could not locate CLINIC_SEAT_USAGE_SQL in seatUsageSql.ts');
  return match[1];
}

export function extractCreateReplacingPendingSqlFragments(repoSource, clinicSeatUsageSql) {
  const start = repoSource.indexOf('async createReplacingPending');
  const end = repoSource.indexOf('async listPendingByOrganization');
  if (start < 0 || end < 0)
    fail('could not locate createReplacingPending in pgOrganizationInvites.ts');
  const slice = stripLineComments(repoSource.slice(start, end));
  const fragments = [...slice.matchAll(/`([^`]*)`/gs)].map((m) => m[1]);
  if (fragments.length !== 5) {
    fail(
      `expected exactly 5 extracted SQL fragments in createReplacingPending, found ${fragments.length}`,
    );
  }
  const [lockSql, activeMemberSql, capacityTemplate, revokeSql, insertSql] = fragments;
  const capacitySql = capacityTemplate.replace('${CLINIC_SEAT_USAGE_SQL}', clinicSeatUsageSql);
  return { lockSql, activeMemberSql, capacitySql, revokeSql, insertSql };
}

export function extractCountSeatReservationsSql(repoSource) {
  const start = repoSource.indexOf('async countSeatReservationsByOrganization');
  const end = repoSource.indexOf('async getByTokenHash');
  if (start < 0 || end < 0)
    fail('could not locate countSeatReservationsByOrganization in pgOrganizationInvites.ts');
  const slice = stripLineComments(repoSource.slice(start, end));
  const fragments = [...slice.matchAll(/`([^`]*)`/gs)].map((m) => m[1]);
  if (fragments.length !== 1) {
    fail(
      `expected exactly 1 extracted SQL fragment in countSeatReservationsByOrganization, found ${fragments.length}`,
    );
  }
  return fragments[0];
}

// ---------------------------------------------------------------------------
// Private disposable PostgreSQL 16 cluster (own /tmp data dir/socket/db; never touches
// DEV/TEST/PROD; never reads application env files).
// ---------------------------------------------------------------------------

const stamp = `${process.pid}_${Date.now()}`;
const dir = mkdtempSync(`/tmp/bcb_c4a_843_invite_concurrency_scratch_${stamp}_`);
const data = path.join(dir, 'data');
const socket = path.join(dir, 'socket');
const log = path.join(dir, 'postgres.log');
const db = `bcb_c4a_843_invite_concurrency_scratch_${stamp}`;
const safeEnv = { LANG: 'C', LC_ALL: 'C', PATH: `${pgBin}:/usr/bin:/bin` };
let serverStarted = false;

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env: safeEnv });
  if (result.error || result.status !== 0) fail(`${label}: ${result.stderr ?? result.error}`);
  return result.stdout;
}

async function reservePrivatePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') fail('could not reserve a private PostgreSQL port');
  const { port: reservedPort } = address;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return String(reservedPort);
}

let port;

function newClient() {
  // Explicit config only — never falls back to PG*/DATABASE_URL ambient env vars.
  return new pg.Client({
    host: socket,
    port: Number(port),
    database: db,
    user: OS_USER,
    ssl: false,
  });
}

async function withClient(fn) {
  const client = newClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function installMinimalSyntheticSchema() {
  await withClient(async (client) => {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE SCHEMA IF NOT EXISTS app;

      CREATE TABLE public.be_organizations (
        id uuid PRIMARY KEY,
        title text NOT NULL DEFAULT '',
        tariff_id uuid
      );

      CREATE TABLE public.saas_tariffs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        mechanics jsonb NOT NULL DEFAULT '{}'::jsonb,
        included_seats integer
      );

      CREATE TABLE public.saas_org_entitlement_overrides (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        mechanic text NOT NULL,
        enabled boolean NOT NULL,
        seat_limit_override integer,
        UNIQUE (organization_id, mechanic)
      );

      CREATE TABLE public.platform_users (
        id uuid PRIMARY KEY,
        display_name text NOT NULL DEFAULT '',
        role text NOT NULL DEFAULT 'client',
        email text,
        email_normalized text,
        email_verified_at timestamptz,
        merged_into_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE public.be_organization_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        platform_user_id uuid NOT NULL,
        role text NOT NULL,
        specialist_id uuid,
        status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id, platform_user_id)
      );

      CREATE TABLE public.organization_member_invites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        invited_email text NOT NULL,
        invited_role text NOT NULL,
        token_hash text NOT NULL UNIQUE,
        status text NOT NULL DEFAULT 'pending',
        expires_at timestamptz NOT NULL,
        created_by_platform_user_id uuid,
        accepted_by_platform_user_id uuid,
        accepted_membership_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        accepted_at timestamptz
      );

      INSERT INTO public.platform_users (id, display_name) VALUES ('${ACTOR}', 'Actor');
    `);

    const overlaySource = readFileSync(
      path.join(root, 'deploy/postgres/organization-member-invites-rls.sql'),
      'utf8',
    );
    const acceptFunctionSql = extractAcceptOrgInviteFunctionSql(overlaySource);
    await client.query(acceptFunctionSql);
  });
}

async function seedOrgWithClinicTeamEntitlement(organizationId, seatLimit) {
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO public.be_organizations (id, title, tariff_id) VALUES ($1, 'Clinic', NULL)`,
      [organizationId],
    );
    await client.query(
      `INSERT INTO public.saas_org_entitlement_overrides (organization_id, mechanic, enabled, seat_limit_override)
       VALUES ($1, 'clinic_team', true, $2)`,
      [organizationId, seatLimit],
    );
  });
}

async function seedOrgWithTariffSeats(organizationId, seatLimit) {
  await withClient(async (client) => {
    const tariffId = `${organizationId.slice(0, -1)}f`;
    await client.query(`INSERT INTO public.saas_tariffs (id, included_seats) VALUES ($1, $2)`, [
      tariffId,
      seatLimit,
    ]);
    await client.query(
      `INSERT INTO public.be_organizations (id, title, tariff_id) VALUES ($1, 'Clinic', $2)`,
      [organizationId, tariffId],
    );
  });
}

async function insertPlatformUser(id, emailNormalized) {
  await withClient((client) =>
    client.query(
      `INSERT INTO public.platform_users (id, email, email_normalized) VALUES ($1, $2, $2)`,
      [id, emailNormalized],
    ),
  );
}

// ---------------------------------------------------------------------------
// Faithful replay of createReplacingPending's control flow using the VERBATIM
// extracted SQL fragments (not hand-duplicated business logic).
// ---------------------------------------------------------------------------

let CREATE_SQL;
let RESERVATION_SQL;

async function createReplacingPendingProof(client, input) {
  await client.query(CREATE_SQL.lockSql, [input.organizationId]);
  const activeMember = await client.query(CREATE_SQL.activeMemberSql, [
    input.organizationId,
    input.invitedEmail,
  ]);
  if (activeMember.rows[0]) return { ok: false, code: 'already_member' };

  if (input.invitedRole === 'doctor') {
    const capacity = await client.query(CREATE_SQL.capacitySql, [
      input.organizationId,
      input.invitedEmail,
    ]);
    const row = capacity.rows[0];
    const limitValue = row?.limit_value ?? 0;
    const usedValue = row?.used_value ?? 0;
    if (usedValue >= limitValue) return { ok: false, code: 'seat_limit_reached' };
  }

  await client.query(CREATE_SQL.revokeSql, [input.organizationId, input.invitedEmail]);
  const inserted = await client.query(CREATE_SQL.insertSql, [
    input.organizationId,
    input.invitedEmail,
    input.invitedRole,
    input.tokenHash,
    input.expiresAt,
    input.createdByPlatformUserId,
  ]);
  const invite = inserted.rows[0];
  if (!invite) fail('organization_invite_insert_failed');
  return { ok: true, invite };
}

/**
 * Runs `fn` inside an explicit BEGIN/COMMIT on `client` and commits the instant `fn` resolves —
 * NOT after sibling concurrent transactions also resolve. Committing late (e.g. only after
 * `Promise.all` settles every concurrent branch) would keep the org-wide advisory lock held past
 * the point this branch's real work is done, deadlocking against a sibling that is genuinely
 * blocked waiting for that same lock to release.
 */
async function runInTransaction(client, fn) {
  await client.query('BEGIN');
  const result = await fn(client);
  await client.query('COMMIT');
  return result;
}

async function acceptOrgInviteProof(client, tokenHash, platformUserId, expectedEmail) {
  const result = await client.query(
    `SELECT ok, code, organization_id::text, membership_id::text, platform_user_id::text, specialist_id::text, role
     FROM app.accept_org_invite($1, $2::uuid, $3)`,
    [tokenHash, platformUserId, expectedEmail],
  );
  return result.rows[0];
}

async function countSeatReservations(organizationId) {
  return withClient(async (client) => {
    const result = await client.query(RESERVATION_SQL, [organizationId]);
    return result.rows[0]?.reservation_count ?? 0;
  });
}

async function pendingDoctorInviteCount(organizationId) {
  return withClient(async (client) => {
    const result = await client.query(
      `SELECT COUNT(*)::int AS c FROM public.organization_member_invites
       WHERE organization_id = $1 AND status = 'pending' AND invited_role = 'doctor'`,
      [organizationId],
    );
    return result.rows[0]?.c ?? 0;
  });
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function scenarioTwoConcurrentDifferentEmailCreatesAtFinalSeat() {
  const org = '20000000-0000-4000-8000-0000000000a1';
  await seedOrgWithClinicTeamEntitlement(org, 1);

  const clientA = newClient();
  const clientB = newClient();
  await clientA.connect();
  await clientB.connect();
  try {
    const [resultA, resultB] = await Promise.all([
      runInTransaction(clientA, (client) =>
        createReplacingPendingProof(client, {
          organizationId: org,
          invitedEmail: 'doctor-a-843@example.com',
          invitedRole: 'doctor',
          tokenHash: 'token-a-843',
          expiresAt: FAR_FUTURE_EXPIRY,
          createdByPlatformUserId: ACTOR,
        }),
      ),
      runInTransaction(clientB, (client) =>
        createReplacingPendingProof(client, {
          organizationId: org,
          invitedEmail: 'doctor-b-843@example.com',
          invitedRole: 'doctor',
          tokenHash: 'token-b-843',
          expiresAt: FAR_FUTURE_EXPIRY,
          createdByPlatformUserId: ACTOR,
        }),
      ),
    ]);

    const outcomes = [resultA, resultB];
    const succeeded = outcomes.filter((r) => r.ok).length;
    const denied = outcomes.filter((r) => !r.ok && r.code === 'seat_limit_reached').length;
    if (succeeded !== 1 || denied !== 1) {
      fail(
        'two concurrent different-email doctor creates at the final seat did not resolve to exactly one success and one seat_limit_reached denial',
      );
    }
    const finalPending = await pendingDoctorInviteCount(org);
    if (finalPending !== 1)
      fail('expected exactly one pending doctor invite after the concurrent create race');
  } finally {
    await clientA.end();
    await clientB.end();
  }
}

async function scenarioSameEmailReplacementAtExactLimitUnderContention() {
  const org = '20000000-0000-4000-8000-0000000000b1';
  await seedOrgWithClinicTeamEntitlement(org, 1);

  await withClient(async (client) => {
    const seeded = await runInTransaction(client, (c) =>
      createReplacingPendingProof(c, {
        organizationId: org,
        invitedEmail: 'same-email-843@example.com',
        invitedRole: 'doctor',
        tokenHash: 'token-same-email-843-v0',
        expiresAt: FAR_FUTURE_EXPIRY,
        createdByPlatformUserId: ACTOR,
      }),
    );
    if (!seeded.ok) fail('seed pending invite at the limit must succeed');
  });

  const clientReplace = newClient();
  const clientOther = newClient();
  await clientReplace.connect();
  await clientOther.connect();
  try {
    const [replaceResult, otherResult] = await Promise.all([
      runInTransaction(clientReplace, (client) =>
        createReplacingPendingProof(client, {
          organizationId: org,
          invitedEmail: 'same-email-843@example.com',
          invitedRole: 'doctor',
          tokenHash: 'token-same-email-843-v1',
          expiresAt: FAR_FUTURE_EXPIRY,
          createdByPlatformUserId: ACTOR,
        }),
      ),
      runInTransaction(clientOther, (client) =>
        createReplacingPendingProof(client, {
          organizationId: org,
          invitedEmail: 'different-email-843@example.com',
          invitedRole: 'doctor',
          tokenHash: 'token-different-email-843',
          expiresAt: FAR_FUTURE_EXPIRY,
          createdByPlatformUserId: ACTOR,
        }),
      ),
    ]);

    if (!replaceResult.ok)
      fail('same-email replacement at the exact limit must succeed under contention');
    if (otherResult.ok || otherResult.code !== 'seat_limit_reached') {
      fail(
        'a different-email create contending for the same slot must be denied seat_limit_reached',
      );
    }
    const finalPending = await pendingDoctorInviteCount(org);
    if (finalPending !== 1)
      fail('exactly one pending reservation must remain after the same-email replacement');
  } finally {
    await clientReplace.end();
    await clientOther.end();
  }
}

async function scenarioConcurrentCreateVsAcceptNoOversubscriptionAndReservationUntilBinding() {
  const org = '20000000-0000-4000-8000-0000000000c1';
  const platformUserZ = '30000000-0000-4000-8000-0000000000c1';
  await seedOrgWithClinicTeamEntitlement(org, 1);
  await insertPlatformUser(platformUserZ, 'doctor-z-843@example.com');

  const tokenHashZ = 'token-z-843';
  await withClient(async (client) => {
    const seeded = await runInTransaction(client, (c) =>
      createReplacingPendingProof(c, {
        organizationId: org,
        invitedEmail: 'doctor-z-843@example.com',
        invitedRole: 'doctor',
        tokenHash: tokenHashZ,
        expiresAt: FAR_FUTURE_EXPIRY,
        createdByPlatformUserId: ACTOR,
      }),
    );
    if (!seeded.ok) fail('seed pending invite Z at the limit must succeed');
  });

  const clientAccept = newClient();
  const clientCreateW = newClient();
  await clientAccept.connect();
  await clientCreateW.connect();
  let acceptRow;
  try {
    // clientAccept issues a single statement with no explicit BEGIN, so PostgreSQL autocommits it
    // (and releases the org advisory lock) the instant it completes — it never waits on
    // clientCreateW. clientCreateW's own explicit transaction commits inside runInTransaction the
    // instant ITS promise resolves, for the same reason: committing only after Promise.all settles
    // both branches would deadlock a losing (lock-blocked) branch against a winning one that's
    // done but held open awaiting its sibling.
    const [acceptResult, createWResult] = await Promise.all([
      acceptOrgInviteProof(clientAccept, tokenHashZ, platformUserZ, 'doctor-z-843@example.com'),
      runInTransaction(clientCreateW, (client) =>
        createReplacingPendingProof(client, {
          organizationId: org,
          invitedEmail: 'doctor-w-843@example.com',
          invitedRole: 'doctor',
          tokenHash: 'token-w-843',
          expiresAt: FAR_FUTURE_EXPIRY,
          createdByPlatformUserId: ACTOR,
        }),
      ),
    ]);
    acceptRow = acceptResult;

    if (!acceptResult.ok)
      fail('accepting invite Z for the last seat must succeed (its own reservation is excluded)');
    if (createWResult.ok || createWResult.code !== 'seat_limit_reached') {
      fail(
        'a concurrent different-email create for the same last seat must be denied regardless of lock winner',
      );
    }
  } finally {
    await clientAccept.end();
    await clientCreateW.end();
  }

  const reservationsAfterAccept = await countSeatReservations(org);
  if (reservationsAfterAccept !== 1) {
    fail(
      'exactly one reservation must remain after accept transitions it from pending to accepted-unbound',
    );
  }

  // Bullet 4: the accepted membership has no specialist binding yet, and still counts as the
  // reservation until a specialist binding replaces it.
  await withClient((client) =>
    client
      .query(`SELECT status, specialist_id FROM public.be_organization_members WHERE id = $1`, [
        acceptRow.membership_id,
      ])
      .then((r) => {
        const row = r.rows[0];
        if (!row || row.status !== 'active' || row.specialist_id !== null) {
          fail('accepted membership must be active with no specialist binding before provisioning');
        }
      }),
  );

  const newSpecialistId = '40000000-0000-4000-8000-0000000000c1';
  await withClient((client) =>
    client.query(`UPDATE public.be_organization_members SET specialist_id = $1 WHERE id = $2`, [
      newSpecialistId,
      acceptRow.membership_id,
    ]),
  );

  // countSeatReservationsByOrganization only tracks pending/accepted-UNBOUND invites (see
  // pgOrganizationInvites.ts) — once specialist provisioning binds the membership, this count
  // correctly drops to 0 because the seat is now consumed via the OTHER clause (active member with
  // a non-null specialist_id, checked by isSeatConsumingMember in clinic-seats/service.ts and by
  // the same clause inside the capacity SQL below). It must NOT go back up to re-add a phantom
  // reservation, and the real capacity check below is the authoritative proof that total usage
  // (bound member + reservations) is still exactly at the limit, not freed.
  const reservationsAfterBinding = await countSeatReservations(org);
  if (reservationsAfterBinding !== 0) {
    fail(
      'the reservation-only count must drop to 0 once the membership is specialist-bound (no double count)',
    );
  }
  const boundMemberCount = await withClient(async (client) => {
    const r = await client.query(
      `SELECT COUNT(*)::int AS c FROM public.be_organization_members
       WHERE organization_id = $1 AND status = 'active' AND specialist_id IS NOT NULL`,
      [org],
    );
    return r.rows[0]?.c ?? 0;
  });
  if (boundMemberCount !== 1)
    fail('expected exactly one active specialist-bound member after binding');

  await withClient(async (client) => {
    await client.query('BEGIN');
    const stillBlocked = await createReplacingPendingProof(client, {
      organizationId: org,
      invitedEmail: 'doctor-v-843@example.com',
      invitedRole: 'doctor',
      tokenHash: 'token-v-843',
      expiresAt: FAR_FUTURE_EXPIRY,
      createdByPlatformUserId: ACTOR,
    });
    await client.query('COMMIT');
    if (stillBlocked.ok || stillBlocked.code !== 'seat_limit_reached') {
      fail(
        'a new different-email create must still be denied after specialist binding — no oversubscription',
      );
    }
  });
}

async function scenarioTariffSeatsAllowAcceptWithoutOverride() {
  const org = '20000000-0000-4000-8000-0000000000d1';
  const platformUser = '30000000-0000-4000-8000-0000000000d1';
  const email = 'tariff-seat-843@example.com';
  await seedOrgWithTariffSeats(org, 1);
  await insertPlatformUser(platformUser, email);

  const created = await withClient((client) =>
    runInTransaction(client, (transaction) =>
      createReplacingPendingProof(transaction, {
        organizationId: org,
        invitedEmail: email,
        invitedRole: 'doctor',
        tokenHash: 'token-tariff-seat-843',
        expiresAt: FAR_FUTURE_EXPIRY,
        createdByPlatformUserId: ACTOR,
      }),
    ),
  );
  if (!created.ok) {
    fail('a tariff included_seats value without an override must allow invite creation');
  }

  const accepted = await withClient((client) =>
    acceptOrgInviteProof(client, 'token-tariff-seat-843', platformUser, email),
  );
  if (!accepted.ok) {
    fail(
      `a tariff included_seats value without an override must allow invite acceptance, got ${accepted.code}`,
    );
  }
}

try {
  if (!existsSync(path.join(pgBin, 'initdb'))) fail('PostgreSQL 16 binaries are unavailable');
  port = await reservePrivatePort();
  mkdirSync(socket, { recursive: true });
  run(path.join(pgBin, 'initdb'), ['-D', data, '-A', 'trust', '--no-locale'], 'private initdb');
  run(
    path.join(pgBin, 'pg_ctl'),
    ['-D', data, '-l', log, '-o', `-k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start'],
    'private PostgreSQL startup',
  );
  serverStarted = true;
  run(
    path.join(pgBin, 'createdb'),
    ['-h', socket, '-p', port, db],
    'private scratch database creation',
  );

  const repoSource = readFileSync(
    path.join(root, 'apps/webapp/src/infra/repos/pgOrganizationInvites.ts'),
    'utf8',
  );
  const seatUsageSource = readFileSync(
    path.join(root, 'apps/webapp/src/infra/repos/seatUsageSql.ts'),
    'utf8',
  );
  CREATE_SQL = extractCreateReplacingPendingSqlFragments(
    repoSource,
    extractClinicSeatUsageSql(seatUsageSource),
  );
  RESERVATION_SQL = extractCountSeatReservationsSql(repoSource);

  await installMinimalSyntheticSchema();
  await scenarioTwoConcurrentDifferentEmailCreatesAtFinalSeat();
  await scenarioSameEmailReplacementAtExactLimitUnderContention();
  await scenarioConcurrentCreateVsAcceptNoOversubscriptionAndReservationUntilBinding();
  await scenarioTariffSeatsAllowAcceptWithoutOverride();

  console.log(
    'C4A #843 clinic invite concurrency proof: OK (aggregate-only) — different-email race, ' +
      'same-email replacement under contention, create-vs-accept for the last seat, and ' +
      'reservation-until-binding plus tariff-only included_seats acceptance all verified against ' +
      'a real private PostgreSQL 16 server',
  );
} finally {
  if (serverStarted) {
    spawnSync(path.join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], {
      encoding: 'utf8',
      env: safeEnv,
    });
  }
  rmSync(dir, { recursive: true, force: true });
}
