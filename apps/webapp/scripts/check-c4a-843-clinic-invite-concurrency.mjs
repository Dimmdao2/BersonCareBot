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
 * proof must avoid). The create transaction is now a Drizzle application port. This smoke
 * source-gates its decisive transaction/lock/capacity markers, then runs the same SQL semantics in
 * the disposable cluster. Removing the production lock or paid allowance fails before scenarios.
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
  for (const marker of [
    'getDrizzle().transaction',
    'pg_advisory_xact_lock',
    'saasBillingSubscriptions.paidAdditionalSeats',
    "code: 'seat_overage_confirmation_required'",
    '.insert(organizationMemberInvites)',
  ]) {
    if (!slice.includes(marker)) fail(`createReplacingPending lost required Drizzle marker: ${marker}`);
  }
  const lockSql = `SELECT pg_advisory_xact_lock(hashtextextended('clinic_invite_seats:' || $1::text, 0))`;
  const activeMemberSql = `SELECT m.id::text
    FROM platform_users u
    JOIN be_organization_members m ON m.platform_user_id = u.id
      AND m.organization_id = $1 AND m.status = 'active'
    WHERE u.email_normalized = $2 AND u.merged_into_id IS NULL LIMIT 1`;
  const capacitySql = `WITH effective_tariff AS (
      SELECT t.included_seats, t.additional_seat_price_minor, t.currency
      FROM be_organizations o
      LEFT JOIN LATERAL app.saas_billing_effective_tariff(o.id, o.tariff_id) AS t ON true
      WHERE o.id = $1
    ), seat_limit AS (
      SELECT COALESCE(
        (SELECT eo.seat_limit_override FROM saas_org_entitlement_overrides eo
         WHERE eo.organization_id = $1 AND eo.mechanic = 'clinic_team'),
        (SELECT included_seats FROM effective_tariff)
      ) + COALESCE((SELECT s.paid_additional_seats FROM saas_billing_subscriptions s
        WHERE s.organization_id = $1 AND s.source = 'paid_subscription'), 0) AS value
    )
    SELECT (SELECT value FROM seat_limit)::int AS limit_value,
      ${clinicSeatUsageSql} AS used_value,
      (SELECT additional_seat_price_minor FROM effective_tariff) AS overage_price_minor,
      (SELECT currency FROM effective_tariff) AS overage_currency`;
  const revokeSql = `UPDATE organization_member_invites SET status = 'revoked'
    WHERE organization_id = $1 AND invited_email = $2 AND status = 'pending'`;
  const insertSql = `WITH i AS (
      INSERT INTO organization_member_invites (
        organization_id, invited_email, invited_role, token_hash, expires_at,
        created_by_platform_user_id
      ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6)
      RETURNING *
    ) SELECT i.*, o.title AS organization_title FROM i
      LEFT JOIN be_organizations o ON o.id = i.organization_id`;
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

function assertBillingSourceContracts(source) {
  for (const marker of [
    "invoice.invoiceKind === 'seat_overage'",
    'paidAdditionalSeats: sql`${saasBillingSubscriptions.paidAdditionalSeats} +',
    'authority.amountMinor + authority.paidAdditionalSeats *',
    'authority.amountMinor + additionalSeatQuantity *',
    'subscription.currentPeriodEndsAt === null',
    "eq(saasBillingInvoices.invoiceKind, 'tariff_period')",
    'saas_billing_seat_overage_partial_refund_forbidden',
  ]) {
    if (!source.includes(marker)) fail(`billing state machine lost required marker: ${marker}`);
  }
  const captureStart = source.indexOf('async captureSaasBillingPaymentSucceeded');
  const captureEnd = source.indexOf('async findSaasBillingInvoiceByProviderRef', captureStart);
  const capture = source.slice(captureStart, captureEnd);
  const subscriptionLock = capture.indexOf('.from(saasBillingSubscriptions)');
  const invoiceLock = capture.indexOf('.from(saasBillingInvoices)', subscriptionLock);
  if (captureStart < 0 || captureEnd < 0 || subscriptionLock < 0 || invoiceLock < subscriptionLock) {
    fail('capture no longer resolves locks in subscription -> invoice order');
  }
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
        name text NOT NULL DEFAULT 'Tariff',
        mechanics jsonb NOT NULL DEFAULT '{}'::jsonb,
        included_seats integer,
        price_minor integer,
        additional_seat_price_minor integer,
        currency text,
        billing_period text NOT NULL DEFAULT 'month'
      );

      CREATE TABLE public.saas_billing_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        saas_billing_account_id uuid NOT NULL DEFAULT gen_random_uuid(),
        tariff_id uuid NOT NULL,
        pending_tariff_id uuid,
        source text NOT NULL,
        status text NOT NULL DEFAULT 'pending_payment',
        lifecycle_state text NOT NULL DEFAULT 'pending_payment',
        current_period_starts_at timestamptz,
        current_period_ends_at timestamptz,
        tariff_snapshot jsonb,
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id, source)
      );

      CREATE TABLE public.saas_billing_invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        saas_billing_account_id uuid NOT NULL DEFAULT gen_random_uuid(),
        saas_billing_subscription_id uuid NOT NULL,
        tariff_id uuid NOT NULL,
        tariff_name text NOT NULL DEFAULT 'Tariff',
        description text,
        amount_minor integer NOT NULL,
        currency text NOT NULL,
        tariff_billing_period text NOT NULL DEFAULT 'month',
        tariff_snapshot jsonb,
        service_period_starts_at timestamptz NOT NULL,
        service_period_ends_at timestamptz NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        provider_id text NOT NULL,
        provider_invoice_ref text,
        provider_checkout_url text,
        provider_idempotency_key text NOT NULL,
        paid_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT saas_billing_invoices_period_uidx UNIQUE
          (saas_billing_subscription_id, service_period_starts_at, service_period_ends_at),
        UNIQUE (provider_id, provider_idempotency_key)
      );

      CREATE TABLE public.saas_organization_trials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        status text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE public.saas_billing_refunds (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        saas_billing_invoice_id uuid NOT NULL,
        amount_minor integer NOT NULL,
        status text NOT NULL,
        provider_idempotency_key text NOT NULL UNIQUE
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

      INSERT INTO public.saas_tariffs (
        id, included_seats, price_minor, additional_seat_price_minor, currency
      ) VALUES ('50000000-0000-4000-8000-0000000000f1', 1, 10000, 1500, 'RUB');
      INSERT INTO public.be_organizations (id, title, tariff_id)
      VALUES ('20000000-0000-4000-8000-0000000000f1', 'Legacy clinic',
        '50000000-0000-4000-8000-0000000000f1');
      INSERT INTO public.saas_billing_subscriptions (
        id, organization_id, tariff_id, source
      ) VALUES ('60000000-0000-4000-8000-0000000000f1',
        '20000000-0000-4000-8000-0000000000f1',
        '50000000-0000-4000-8000-0000000000f1', 'paid_subscription');
      INSERT INTO public.saas_billing_invoices (
        organization_id, saas_billing_subscription_id, tariff_id, description, amount_minor,
        currency, service_period_starts_at, service_period_ends_at, status, provider_id,
        provider_idempotency_key
      ) VALUES (
        '20000000-0000-4000-8000-0000000000f1',
        '60000000-0000-4000-8000-0000000000f1',
        '50000000-0000-4000-8000-0000000000f1',
        'Дополнительное место специалиста сверх тарифа — legacy', 1500, 'RUB',
        '2026-06-01', '2026-07-01', 'paid', 'legacy', 'legacy-seat'
      );

      CREATE OR REPLACE FUNCTION app.saas_billing_effective_tariff(uuid, uuid)
      RETURNS SETOF public.saas_tariffs
      LANGUAGE sql STABLE
      AS $$ SELECT * FROM public.saas_tariffs WHERE id = $2 $$;
    `);

    const migrationSource = readFileSync(
      path.join(root, 'apps/webapp/db/drizzle-migrations/0308_saas_paid_seat_billing_local.sql'),
      'utf8',
    );
    for (const statement of migrationSource.split('--> statement-breakpoint')) {
      if (statement.trim()) await client.query(statement);
    }
    const migrated = await client.query(`
      SELECT i.invoice_kind, i.additional_seat_quantity, s.paid_additional_seats,
        (SELECT column_default FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'saas_billing_invoices'
           AND column_name = 'invoice_kind') AS invoice_kind_default
      FROM public.saas_billing_invoices i
      JOIN public.saas_billing_subscriptions s ON s.id = i.saas_billing_subscription_id
      WHERE i.provider_idempotency_key = 'legacy-seat'
    `);
    const migratedRow = migrated.rows[0];
    if (
      migratedRow?.invoice_kind !== 'seat_overage' ||
      migratedRow?.additional_seat_quantity !== 1 ||
      migratedRow?.paid_additional_seats !== 1 ||
      migratedRow?.invoice_kind_default !== null
    ) {
      fail('0308 legacy paid-seat backfill/default removal did not match the exact prefix contract');
    }

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
    const limitValue = row?.limit_value ?? null;
    const usedValue = row?.used_value ?? 0;
    if (limitValue === null || usedValue >= limitValue) {
      if (row?.overage_price_minor !== null && row?.overage_currency !== null) {
        return {
          ok: false,
          code: 'seat_overage_confirmation_required',
          priceMinor: row.overage_price_minor,
          currency: row.overage_currency,
        };
      }
      return { ok: false, code: 'seat_limit_reached' };
    }
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

async function captureBillingInvoice(client, invoiceId, paidAt) {
  await client.query('BEGIN');
  try {
    const identity = await client.query(
      `SELECT saas_billing_subscription_id FROM public.saas_billing_invoices WHERE id = $1`,
      [invoiceId],
    );
    const subscriptionId = identity.rows[0]?.saas_billing_subscription_id;
    if (!subscriptionId) fail('capture invoice identity missing');
    const subscriptionResult = await client.query(
      `SELECT * FROM public.saas_billing_subscriptions WHERE id = $1 FOR UPDATE`,
      [subscriptionId],
    );
    const invoiceResult = await client.query(
      `SELECT * FROM public.saas_billing_invoices WHERE id = $1 FOR UPDATE`,
      [invoiceId],
    );
    const subscription = subscriptionResult.rows[0];
    const invoice = invoiceResult.rows[0];
    const wasPaid = invoice.status === 'paid';
    if (!wasPaid) {
      await client.query(
        `UPDATE public.saas_billing_invoices SET status = 'paid', paid_at = $2 WHERE id = $1`,
        [invoiceId, paidAt],
      );
    }
    if (invoice.invoice_kind === 'seat_overage') {
      if (!wasPaid) {
        await client.query(
          `UPDATE public.saas_billing_subscriptions
           SET paid_additional_seats = paid_additional_seats + $2 WHERE id = $1`,
          [subscriptionId, invoice.additional_seat_quantity],
        );
      }
    } else if (
      new Date(invoice.service_period_starts_at) <= new Date(paidAt) &&
      ((subscription.current_period_ends_at === null &&
        invoice.tariff_id === (subscription.pending_tariff_id ?? subscription.tariff_id)) ||
        subscription.current_period_ends_at?.toISOString() ===
          invoice.service_period_starts_at.toISOString())
    ) {
      await client.query(
        `UPDATE public.saas_billing_subscriptions SET
           tariff_id = $2, pending_tariff_id = NULL, status = 'active', lifecycle_state = 'active',
           current_period_starts_at = $3, current_period_ends_at = $4,
           tariff_snapshot = COALESCE($5::jsonb, tariff_snapshot)
         WHERE id = $1`,
        [
          subscriptionId,
          invoice.tariff_id,
          invoice.service_period_starts_at,
          invoice.service_period_ends_at,
          invoice.tariff_snapshot,
        ],
      );
      await client.query(`UPDATE public.be_organizations SET tariff_id = $2 WHERE id = $1`, [
        invoice.organization_id,
        invoice.tariff_id,
      ]);
      if (subscription.current_period_ends_at === null) {
        await client.query(
          `UPDATE public.saas_organization_trials SET status = 'ended'
           WHERE organization_id = $1 AND status = 'active'`,
          [invoice.organization_id],
        );
      }
    }
    await client.query('COMMIT');
    return !wasPaid;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function calculateRenewalQuote(client, subscriptionId) {
  const result = await client.query(
    `SELECT t.price_minor, t.additional_seat_price_minor, s.paid_additional_seats
     FROM public.saas_billing_subscriptions s
     JOIN public.saas_tariffs t ON t.id = COALESCE(s.pending_tariff_id, s.tariff_id)
     WHERE s.id = $1`,
    [subscriptionId],
  );
  const row = result.rows[0];
  if (!row || row.price_minor === null) throw new Error('tariff_not_billable');
  if (row.paid_additional_seats > 0 && row.additional_seat_price_minor === null) {
    throw new Error('saas_billing_additional_seat_price_missing');
  }
  return {
    amountMinor: row.price_minor + row.paid_additional_seats * (row.additional_seat_price_minor ?? 0),
    additionalSeatQuantity: row.paid_additional_seats,
  };
}

async function applySeatRefundSucceeded(client, invoiceId, amountMinor, eventKey) {
  await client.query('BEGIN');
  try {
    const identity = await client.query(
      `SELECT saas_billing_subscription_id FROM public.saas_billing_invoices WHERE id = $1`,
      [invoiceId],
    );
    const subscriptionId = identity.rows[0]?.saas_billing_subscription_id;
    if (!subscriptionId) fail('refund invoice identity missing');
    await client.query(
      `SELECT id FROM public.saas_billing_subscriptions WHERE id = $1 FOR UPDATE`,
      [subscriptionId],
    );
    const invoiceResult = await client.query(
      `SELECT * FROM public.saas_billing_invoices WHERE id = $1 FOR UPDATE`,
      [invoiceId],
    );
    const invoice = invoiceResult.rows[0];
    if (invoice.invoice_kind !== 'seat_overage' || amountMinor !== invoice.amount_minor) {
      throw new Error('saas_billing_seat_overage_partial_refund_forbidden');
    }
    const inserted = await client.query(
      `INSERT INTO public.saas_billing_refunds
       (saas_billing_invoice_id, amount_minor, status, provider_idempotency_key)
       VALUES ($1, $2, 'succeeded', $3)
       ON CONFLICT (provider_idempotency_key) DO NOTHING RETURNING id`,
      [invoiceId, amountMinor, eventKey],
    );
    if (inserted.rows[0]) {
      await client.query(
        `UPDATE public.saas_billing_subscriptions
         SET paid_additional_seats = greatest(paid_additional_seats - $2, 0)
         WHERE id = $1`,
        [subscriptionId, invoice.additional_seat_quantity],
      );
    }
    await client.query('COMMIT');
    return Boolean(inserted.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
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

async function scenarioPaidSeatInviteAndAcceptAuthority() {
  const org = '20000000-0000-4000-8000-0000000000e1';
  const tariff = '50000000-0000-4000-8000-0000000000e1';
  const subscription = '60000000-0000-4000-8000-0000000000e1';
  const platformUser = '30000000-0000-4000-8000-0000000000e1';
  const email = 'legacy-unpaid-overage@example.com';
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO public.saas_tariffs
       (id, included_seats, price_minor, additional_seat_price_minor, currency)
       VALUES ($1, 0, 10000, 1500, 'RUB')`,
      [tariff],
    );
    await client.query(
      `INSERT INTO public.be_organizations (id, title, tariff_id) VALUES ($1, 'Paid seat clinic', $2)`,
      [org, tariff],
    );
    await client.query(
      `INSERT INTO public.saas_billing_subscriptions
       (id, organization_id, tariff_id, source, paid_additional_seats)
       VALUES ($1, $2, $3, 'paid_subscription', 0)`,
      [subscription, org, tariff],
    );
    await client.query(
      `INSERT INTO public.platform_users (id, email, email_normalized) VALUES ($1, $2, $2)`,
      [platformUser, email],
    );
  });

  const beforePayment = await withClient((client) =>
    runInTransaction(client, (transaction) =>
      createReplacingPendingProof(transaction, {
        organizationId: org,
        invitedEmail: 'before-payment@example.com',
        invitedRole: 'doctor',
        tokenHash: 'before-payment-token',
        expiresAt: FAR_FUTURE_EXPIRY,
        createdByPlatformUserId: ACTOR,
      }),
    ),
  );
  if (beforePayment.ok || beforePayment.code !== 'seat_overage_confirmation_required') {
    fail('an over-capacity invite must quote checkout and create nothing before payment');
  }
  if ((await pendingDoctorInviteCount(org)) !== 0) fail('pre-payment quote created an invite');

  await withClient((client) =>
    client.query(
      `UPDATE public.saas_billing_subscriptions SET paid_additional_seats = 1 WHERE id = $1`,
      [subscription],
    ),
  );
  const afterPayment = await withClient((client) =>
    runInTransaction(client, (transaction) =>
      createReplacingPendingProof(transaction, {
        organizationId: org,
        invitedEmail: 'after-payment@example.com',
        invitedRole: 'doctor',
        tokenHash: 'after-payment-token',
        expiresAt: FAR_FUTURE_EXPIRY,
        createdByPlatformUserId: ACTOR,
      }),
    ),
  );
  if (!afterPayment.ok) fail('ordinary invite did not succeed after paid capacity appeared');
  await withClient(async (client) => {
    await client.query(
      `UPDATE public.organization_member_invites SET status = 'revoked'
       WHERE organization_id = $1 AND token_hash = 'after-payment-token'`,
      [org],
    );
    await client.query(
      `UPDATE public.saas_billing_subscriptions SET paid_additional_seats = 0 WHERE id = $1`,
      [subscription],
    );
  });

  await withClient((client) =>
    client.query(
      `INSERT INTO public.organization_member_invites
       (organization_id, invited_email, invited_role, token_hash, expires_at, created_by_platform_user_id)
       VALUES ($1, $2, 'doctor', 'legacy-unpaid-token', $3, $4)`,
      [org, email, FAR_FUTURE_EXPIRY, ACTOR],
    ),
  );
  const unpaidAccept = await withClient((client) =>
    acceptOrgInviteProof(client, 'legacy-unpaid-token', platformUser, email),
  );
  if (unpaidAccept.ok || unpaidAccept.code !== 'seat_limit_reached') {
    fail('legacy unpaid overage was accepted merely because a seat price exists');
  }

  await withClient((client) =>
    client.query(
      `UPDATE public.saas_billing_subscriptions SET paid_additional_seats = 1 WHERE id = $1`,
      [subscription],
    ),
  );
  const paidAccept = await withClient((client) =>
    acceptOrgInviteProof(client, 'legacy-unpaid-token', platformUser, email),
  );
  if (!paidAccept.ok) fail('paid capacity did not allow the same ordinary invite acceptance');
}

async function scenarioBillingCaptureRenewalAndReplay() {
  const org = '20000000-0000-4000-8000-0000000000e2';
  const tariff = '50000000-0000-4000-8000-0000000000e2';
  const subscription = '60000000-0000-4000-8000-0000000000e2';
  const tariffInvoice = '70000000-0000-4000-8000-0000000000e2';
  const seatInvoice = '70000000-0000-4000-8000-0000000000e3';
  const secondSeatInvoice = '70000000-0000-4000-8000-0000000000e4';
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO public.saas_tariffs
       (id, included_seats, price_minor, additional_seat_price_minor, currency)
       VALUES ($1, 1, 10000, 1500, 'RUB')`,
      [tariff],
    );
    await client.query(
      `INSERT INTO public.be_organizations (id, title, tariff_id) VALUES ($1, 'Capture clinic', $2)`,
      [org, tariff],
    );
    await client.query(
      `INSERT INTO public.saas_billing_subscriptions
       (id, organization_id, tariff_id, source, status, lifecycle_state)
       VALUES ($1, $2, $3, 'paid_subscription', 'pending_payment', 'pending_payment')`,
      [subscription, org, tariff],
    );
    await client.query(
      `INSERT INTO public.saas_organization_trials (organization_id, status) VALUES ($1, 'active')`,
      [org],
    );
    await client.query(
      `INSERT INTO public.saas_billing_invoices (
        id, organization_id, saas_billing_subscription_id, tariff_id, invoice_kind,
        additional_seat_quantity, amount_minor, currency, tariff_snapshot,
        service_period_starts_at, service_period_ends_at, status, provider_id,
        provider_invoice_ref, provider_idempotency_key
       ) VALUES ($1, $2, $3, $4, 'tariff_period', 0, 10000, 'RUB',
        '{"included_seats":1}'::jsonb, '2026-08-01', '2026-09-01', 'pending',
        'mock', 'tariff-provider-ref', 'tariff-request')`,
      [tariffInvoice, org, subscription, tariff],
    );
    await captureBillingInvoice(client, tariffInvoice, '2026-08-01T00:00:00.000Z');
    const first = await client.query(
      `SELECT s.status, s.lifecycle_state, s.current_period_starts_at, s.current_period_ends_at,
        s.tariff_snapshot, t.status AS trial_status
       FROM public.saas_billing_subscriptions s
       JOIN public.saas_organization_trials t ON t.organization_id = s.organization_id
       WHERE s.id = $1`,
      [subscription],
    );
    const row = first.rows[0];
    if (
      row?.status !== 'active' || row?.lifecycle_state !== 'active' ||
      row?.current_period_starts_at === null || row?.current_period_ends_at === null ||
      row?.trial_status !== 'ended' || row?.tariff_snapshot?.included_seats !== 1
    ) fail('first tariff capture did not install the NULL-boundary period and end the trial');

    await client.query(
      `INSERT INTO public.saas_billing_invoices (
        id, organization_id, saas_billing_subscription_id, tariff_id, invoice_kind,
        additional_seat_quantity, amount_minor, currency, tariff_snapshot,
        service_period_starts_at, service_period_ends_at, status, provider_id,
        provider_invoice_ref, provider_idempotency_key
       ) VALUES ($1, $2, $3, $4, 'seat_overage', 1, 1500, 'RUB',
        '{"included_seats":1}'::jsonb, '2026-08-01', '2026-09-01', 'pending',
        'mock', 'seat-provider-ref', 'seat-request')`,
      [seatInvoice, org, subscription, tariff],
    );
    const beforeSeat = await client.query(
      `SELECT tariff_id, pending_tariff_id, status, lifecycle_state, current_period_starts_at,
        current_period_ends_at, tariff_snapshot FROM public.saas_billing_subscriptions WHERE id = $1`,
      [subscription],
    );
    await captureBillingInvoice(client, seatInvoice, '2026-08-02T00:00:00.000Z');
    await captureBillingInvoice(client, seatInvoice, '2026-08-03T00:00:00.000Z');
    const afterSeat = await client.query(
      `SELECT tariff_id, pending_tariff_id, status, lifecycle_state, current_period_starts_at,
        current_period_ends_at, tariff_snapshot, paid_additional_seats
       FROM public.saas_billing_subscriptions WHERE id = $1`,
      [subscription],
    );
    const { paid_additional_seats: paidSeats, ...stableAfter } = afterSeat.rows[0];
    if (paidSeats !== 1 || JSON.stringify(stableAfter) !== JSON.stringify(beforeSeat.rows[0])) {
      fail('seat capture/replay changed tariff state or did not add allowance exactly once');
    }
    await client.query(
      `INSERT INTO public.saas_billing_invoices (
        id, organization_id, saas_billing_subscription_id, tariff_id, invoice_kind,
        additional_seat_quantity, amount_minor, currency, tariff_snapshot,
        service_period_starts_at, service_period_ends_at, status, provider_id,
        provider_invoice_ref, provider_idempotency_key
       ) VALUES ($1, $2, $3, $4, 'seat_overage', 1, 1500, 'RUB',
        '{"included_seats":1}'::jsonb, '2026-08-01', '2026-09-01', 'pending',
        'mock', 'seat-provider-ref-2', 'seat-request-2')`,
      [secondSeatInvoice, org, subscription, tariff],
    );
    await captureBillingInvoice(client, secondSeatInvoice, '2026-08-04T00:00:00.000Z');
    const quote = await calculateRenewalQuote(client, subscription);
    if (quote.amountMinor !== 13000 || quote.additionalSeatQuantity !== 2) {
      fail('renewal quote omitted the purchased seat quantity or exact amount');
    }
    await client.query(`UPDATE public.saas_tariffs SET additional_seat_price_minor = NULL WHERE id = $1`, [tariff]);
    let missingPriceRejected = false;
    try {
      await calculateRenewalQuote(client, subscription);
    } catch (error) {
      missingPriceRejected = error instanceof Error &&
        error.message === 'saas_billing_additional_seat_price_missing';
    }
    if (!missingPriceRejected) fail('renewal with paid seats and no unit price did not fail explicitly');
    await client.query(`UPDATE public.saas_tariffs SET additional_seat_price_minor = 1500 WHERE id = $1`, [tariff]);
    const firstRefund = await applySeatRefundSucceeded(client, secondSeatInvoice, 1500, 'refund-event-1');
    const replayRefund = await applySeatRefundSucceeded(client, secondSeatInvoice, 1500, 'refund-event-1');
    if (!firstRefund || replayRefund) fail('full seat refund did not decrement exactly once');
    let partialRejected = false;
    try {
      await applySeatRefundSucceeded(client, seatInvoice, 1, 'refund-event-partial');
    } catch (error) {
      partialRejected = error instanceof Error &&
        error.message === 'saas_billing_seat_overage_partial_refund_forbidden';
    }
    const allowanceAfterRefund = await client.query(
      `SELECT paid_additional_seats FROM public.saas_billing_subscriptions WHERE id = $1`,
      [subscription],
    );
    if (!partialRejected || allowanceAfterRefund.rows[0]?.paid_additional_seats !== 1) {
      fail('seat refund replay/partial-refund invariant failed');
    }
  });
}

async function scenarioTwoConcurrentInvitesForOnePaidExtraSeat() {
  const org = '20000000-0000-4000-8000-0000000000e5';
  const tariff = '50000000-0000-4000-8000-0000000000e5';
  const subscription = '60000000-0000-4000-8000-0000000000e5';
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO public.saas_tariffs
       (id, included_seats, price_minor, additional_seat_price_minor, currency)
       VALUES ($1, 1, 10000, 1500, 'RUB')`,
      [tariff],
    );
    await client.query(
      `INSERT INTO public.be_organizations (id, title, tariff_id) VALUES ($1, 'Race clinic', $2)`,
      [org, tariff],
    );
    await client.query(
      `INSERT INTO public.saas_billing_subscriptions
       (id, organization_id, tariff_id, source, paid_additional_seats)
       VALUES ($1, $2, $3, 'paid_subscription', 1)`,
      [subscription, org, tariff],
    );
    await client.query(
      `INSERT INTO public.be_organization_members
       (organization_id, platform_user_id, role, specialist_id, status)
       VALUES ($1, $2, 'doctor', '40000000-0000-4000-8000-0000000000e5', 'active')`,
      [org, ACTOR],
    );
  });
  const clientA = newClient();
  const clientB = newClient();
  await clientA.connect();
  await clientB.connect();
  try {
    const [a, b] = await Promise.all([
      runInTransaction(clientA, (client) => createReplacingPendingProof(client, {
        organizationId: org, invitedEmail: 'paid-race-a@example.com', invitedRole: 'doctor',
        tokenHash: 'paid-race-a', expiresAt: FAR_FUTURE_EXPIRY,
        createdByPlatformUserId: ACTOR,
      })),
      runInTransaction(clientB, (client) => createReplacingPendingProof(client, {
        organizationId: org, invitedEmail: 'paid-race-b@example.com', invitedRole: 'doctor',
        tokenHash: 'paid-race-b', expiresAt: FAR_FUTURE_EXPIRY,
        createdByPlatformUserId: ACTOR,
      })),
    ]);
    if ([a, b].filter((result) => result.ok).length !== 1 ||
      [a, b].filter((result) => !result.ok).length !== 1) {
      fail('two concurrent invites for one paid extra seat did not yield exactly one success');
    }
  } finally {
    await clientA.end();
    await clientB.end();
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
  assertBillingSourceContracts(
    readFileSync(path.join(root, 'apps/webapp/src/infra/repos/pgSaasBilling.ts'), 'utf8'),
  );

  await installMinimalSyntheticSchema();
  await scenarioTwoConcurrentDifferentEmailCreatesAtFinalSeat();
  await scenarioSameEmailReplacementAtExactLimitUnderContention();
  await scenarioConcurrentCreateVsAcceptNoOversubscriptionAndReservationUntilBinding();
  await scenarioTariffSeatsAllowAcceptWithoutOverride();
  await scenarioPaidSeatInviteAndAcceptAuthority();
  await scenarioBillingCaptureRenewalAndReplay();
  await scenarioTwoConcurrentInvitesForOnePaidExtraSeat();

  console.log(
    'C4A #843 clinic invite concurrency proof: OK (aggregate-only) — different-email race, ' +
      'same-email replacement under contention, create-vs-accept for the last seat, and ' +
      'reservation-until-binding, paid-seat invite/accept authority, first tariff capture, ' +
      'seat replay isolation, migration backfill and renewal arithmetic all verified against ' +
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
