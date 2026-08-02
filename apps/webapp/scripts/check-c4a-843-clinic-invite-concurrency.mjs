#!/usr/bin/env node
/**
 * C4A #843 / #1057 / #1069 — disposable PostgreSQL proof for clinic-seat billing.
 *
 * The parent process owns a private PostgreSQL 16 cluster under /tmp and installs only the
 * relations needed by this proof. It then re-executes this same file through the repository's
 * TypeScript loader. The child imports and calls the real Drizzle ports; no capture, renewal,
 * refund, capacity, or invite-create SQL is copied into this smoke.
 *
 * The only extracted SQL is app.accept_org_invite itself: that stored function is copied verbatim
 * from its production overlay and executed as the product accept boundary. Neither process reads
 * application env files or connects to DEV/TEST/PROD.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { userInfo } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import pg from 'pg';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const webappRoot = path.join(root, 'apps', 'webapp');
const pgBin = '/usr/lib/postgresql/16/bin';
const ACTOR = '10000000-0000-4000-8000-000000000001';
const FAR_FUTURE_EXPIRY = '2030-01-01T00:00:00.000Z';
const OS_USER = userInfo().username;
const IS_PRODUCT_CHILD = process.env.C4A_843_PRODUCT_CHILD === '1';

function fail(label) {
  throw new Error(`C4A #843 clinic invite concurrency proof failed: ${label}`);
}

function assert(condition, label) {
  if (!condition) fail(label);
}

function extractAcceptOrgInviteFunctionSql(overlaySource) {
  const start = overlaySource.indexOf('CREATE OR REPLACE FUNCTION app.accept_org_invite');
  const end = overlaySource.indexOf('COMMENT ON FUNCTION app.accept_org_invite', start);
  if (start < 0 || end < 0) fail('could not locate app.accept_org_invite in the overlay source');
  return overlaySource.slice(start, end);
}

async function runProductProof() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail('product child did not receive its private DATABASE_URL');

  const [{ createPgOrganizationInvitesPort }, { createPgSaasBillingRepository }, { getPool }] =
    await Promise.all([
      import('../src/infra/repos/pgOrganizationInvites.ts'),
      import('../src/infra/repos/pgSaasBilling.ts'),
      import('../src/infra/db/client.ts'),
    ]);
  const invites = createPgOrganizationInvitesPort();
  const billing = createPgSaasBillingRepository();
  const client = new pg.Client({ connectionString: databaseUrl, ssl: false });
  await client.connect();

  const query = (text, values = []) => client.query(text, values);
  const inviteInput = (organizationId, email, tokenHash) => ({
    organizationId,
    invitedEmail: email,
    invitedRole: 'doctor',
    tokenHash,
    expiresAt: FAR_FUTURE_EXPIRY,
    createdByPlatformUserId: ACTOR,
  });
  const providerEvent = (providerEventId, type = 'payment.succeeded') => ({
    providerId: 'mock',
    providerEventId,
    type,
  });

  async function seedTariffSubscription({
    organizationId,
    tariffId,
    subscriptionId,
    includedSeats,
    paidAdditionalSeats = 0,
    additionalSeatPriceMinor = 1500,
    status = 'active',
    lifecycleState = 'active',
    currentPeriodStartsAt = null,
    currentPeriodEndsAt = null,
  }) {
    await query(
      `INSERT INTO public.saas_tariffs (
         id, name, price_minor, currency, billing_period, included_seats,
         additional_seat_price_minor, is_active
       ) VALUES ($1, 'Proof tariff', 10000, 'RUB', 'month', $2, $3, true)`,
      [tariffId, includedSeats, additionalSeatPriceMinor],
    );
    await query(
      `INSERT INTO public.be_organizations (id, title, tariff_id)
       VALUES ($1, 'Proof clinic', $2)`,
      [organizationId, tariffId],
    );
    await query(
      `INSERT INTO public.saas_billing_subscriptions (
         id, organization_id, saas_billing_account_id, tariff_id, source, status,
         lifecycle_state, current_period_starts_at, current_period_ends_at,
         paid_additional_seats
       ) VALUES ($1, $2, gen_random_uuid(), $3, 'paid_subscription', $4, $5, $6, $7, $8)`,
      [
        subscriptionId,
        organizationId,
        tariffId,
        status,
        lifecycleState,
        currentPeriodStartsAt,
        currentPeriodEndsAt,
        paidAdditionalSeats,
      ],
    );
  }

  async function insertInvoice({
    id,
    organizationId,
    subscriptionId,
    tariffId,
    invoiceKind,
    additionalSeatQuantity,
    amountMinor,
    periodStart,
    periodEnd,
    status = 'pending',
    providerRef,
    requestKey,
    tariffSnapshot = { included_seats: 1 },
  }) {
    await query(
      `INSERT INTO public.saas_billing_invoices (
         id, organization_id, saas_billing_account_id, saas_billing_subscription_id,
         tariff_id, tariff_name, invoice_kind, additional_seat_quantity, amount_minor,
         currency, tariff_billing_period, tariff_snapshot, service_period_starts_at,
         service_period_ends_at, status, provider_id, provider_invoice_ref,
         provider_idempotency_key
       ) SELECT $1, $2, s.saas_billing_account_id, $3, $4, 'Proof tariff', $5, $6,
         $7, 'RUB', 'month', $8::jsonb, $9, $10, $11, 'mock', $12, $13
       FROM public.saas_billing_subscriptions s WHERE s.id = $3`,
      [
        id,
        organizationId,
        subscriptionId,
        tariffId,
        invoiceKind,
        additionalSeatQuantity,
        amountMinor,
        JSON.stringify(tariffSnapshot),
        periodStart,
        periodEnd,
        status,
        providerRef,
        requestKey,
      ],
    );
  }

  try {
    // Real createReplacingPending: the trigger widens the post-capacity/pre-commit window. With
    // the organization advisory lock, exactly one insert wins. Removing that lock lets both pass
    // the capacity read before either insert becomes visible.
    await query(`
      CREATE OR REPLACE FUNCTION public.c4a_843_slow_invite_insert()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.35); RETURN NEW; END $$;
      CREATE TRIGGER c4a_843_slow_invite_insert
      BEFORE INSERT ON public.organization_member_invites
      FOR EACH ROW EXECUTE FUNCTION public.c4a_843_slow_invite_insert();
    `);
    await seedTariffSubscription({
      organizationId: '20000000-0000-4000-8000-0000000000a1',
      tariffId: '50000000-0000-4000-8000-0000000000a1',
      subscriptionId: '60000000-0000-4000-8000-0000000000a1',
      includedSeats: 1,
      additionalSeatPriceMinor: null,
    });
    const lockRace = await Promise.all([
      invites.createReplacingPending(
        inviteInput('20000000-0000-4000-8000-0000000000a1', 'lock-a@example.com', 'lock-a'),
      ),
      invites.createReplacingPending(
        inviteInput('20000000-0000-4000-8000-0000000000a1', 'lock-b@example.com', 'lock-b'),
      ),
    ]);
    assert(lockRace.filter((result) => result.ok).length === 1, 'real invite lock race did not yield one success');
    assert(
      lockRace.filter((result) => !result.ok && result.code === 'seat_limit_reached').length === 1,
      'real invite lock race did not yield one hard-limit denial',
    );

    // Pending reservations are part of used capacity. If that contribution is omitted, both
    // concurrent calls below fit behind a pre-existing invite and oversubscribe capacity 2.
    await seedTariffSubscription({
      organizationId: '20000000-0000-4000-8000-0000000000a2',
      tariffId: '50000000-0000-4000-8000-0000000000a2',
      subscriptionId: '60000000-0000-4000-8000-0000000000a2',
      includedSeats: 2,
      additionalSeatPriceMinor: null,
    });
    const seededInvite = await invites.createReplacingPending(
      inviteInput('20000000-0000-4000-8000-0000000000a2', 'pending-seed@example.com', 'pending-seed'),
    );
    assert(seededInvite.ok, 'could not seed pending reservation through the product port');
    const pendingRace = await Promise.all([
      invites.createReplacingPending(
        inviteInput('20000000-0000-4000-8000-0000000000a2', 'pending-a@example.com', 'pending-a'),
      ),
      invites.createReplacingPending(
        inviteInput('20000000-0000-4000-8000-0000000000a2', 'pending-b@example.com', 'pending-b'),
      ),
    ]);
    assert(pendingRace.filter((result) => result.ok).length === 1, 'pending invite was omitted from real capacity');
    assert(pendingRace.filter((result) => !result.ok).length === 1, 'pending capacity race did not deny one invite');

    // A pending seat invoice changes nothing. Capture through the real state machine adds the
    // allowance; the ordinary create path then succeeds. Its own pending invite is revoked before
    // the paid-seat race so exactly one of two new invites can consume the purchased place.
    const paidOrg = '20000000-0000-4000-8000-0000000000b1';
    const paidTariff = '50000000-0000-4000-8000-0000000000b1';
    const paidSubscription = '60000000-0000-4000-8000-0000000000b1';
    const pendingSeatInvoice = '70000000-0000-4000-8000-0000000000b1';
    await seedTariffSubscription({
      organizationId: paidOrg,
      tariffId: paidTariff,
      subscriptionId: paidSubscription,
      includedSeats: 0,
      paidAdditionalSeats: 0,
    });
    await insertInvoice({
      id: pendingSeatInvoice,
      organizationId: paidOrg,
      subscriptionId: paidSubscription,
      tariffId: paidTariff,
      invoiceKind: 'seat_overage',
      additionalSeatQuantity: 1,
      amountMinor: 1500,
      periodStart: '2026-08-01T00:00:00.000Z',
      periodEnd: '2026-09-01T00:00:00.000Z',
      providerRef: 'paid-seat-ref',
      requestKey: 'paid-seat-request',
    });
    const beforeCapture = await invites.createReplacingPending(
      inviteInput(paidOrg, 'before-capture@example.com', 'before-capture'),
    );
    assert(
      !beforeCapture.ok && beforeCapture.code === 'seat_overage_confirmation_required',
      'pending seat invoice expanded real invite capacity',
    );
    const beforeCount = await query(
      `SELECT count(*)::int AS count FROM public.organization_member_invites
       WHERE organization_id = $1 AND status = 'pending'`,
      [paidOrg],
    );
    assert(beforeCount.rows[0]?.count === 0, 'pre-payment product invite created a row');
    await billing.captureSaasBillingPaymentSucceeded({
      organizationId: paidOrg,
      saasBillingInvoiceId: pendingSeatInvoice,
      paidAt: '2026-08-02T00:00:00.000Z',
      event: providerEvent('paid-seat-capture'),
      savedPaymentMethodId: null,
    });
    const afterCapture = await invites.createReplacingPending(
      inviteInput(paidOrg, 'after-capture@example.com', 'after-capture'),
    );
    assert(afterCapture.ok, 'paid allowance was omitted from real invite capacity');
    await query(
      `UPDATE public.organization_member_invites SET status = 'revoked'
       WHERE organization_id = $1 AND token_hash = 'after-capture'`,
      [paidOrg],
    );
    const paidRace = await Promise.all([
      invites.createReplacingPending(inviteInput(paidOrg, 'paid-a@example.com', 'paid-a')),
      invites.createReplacingPending(inviteInput(paidOrg, 'paid-b@example.com', 'paid-b')),
    ]);
    assert(paidRace.filter((result) => result.ok).length === 1, 'one paid place admitted more or fewer than one invite');
    assert(paidRace.filter((result) => !result.ok).length === 1, 'one paid place did not freeze the second invite');

    // The exact production accept function is called through the real port. A configured price is
    // not payment; only persisted paid allowance changes its answer.
    const acceptOrg = '20000000-0000-4000-8000-0000000000b2';
    const acceptTariff = '50000000-0000-4000-8000-0000000000b2';
    const acceptSubscription = '60000000-0000-4000-8000-0000000000b2';
    const acceptUser = '30000000-0000-4000-8000-0000000000b2';
    await seedTariffSubscription({
      organizationId: acceptOrg,
      tariffId: acceptTariff,
      subscriptionId: acceptSubscription,
      includedSeats: 0,
      paidAdditionalSeats: 0,
    });
    await query(
      `INSERT INTO public.platform_users (id, email, email_normalized) VALUES ($1, $2, $2)`,
      [acceptUser, 'accept-seat@example.com'],
    );
    await query(
      `INSERT INTO public.organization_member_invites (
         organization_id, invited_email, invited_role, token_hash, expires_at,
         created_by_platform_user_id
       ) VALUES ($1, $2, 'doctor', 'accept-seat-token', $3, $4)`,
      [acceptOrg, 'accept-seat@example.com', FAR_FUTURE_EXPIRY, ACTOR],
    );
    const unpaidAccept = await invites.acceptPendingByTokenHash({
      tokenHash: 'accept-seat-token',
      platformUserId: acceptUser,
      expectedEmail: 'accept-seat@example.com',
    });
    assert(!unpaidAccept.ok && unpaidAccept.code === 'seat_limit_reached', 'accept treated a seat price as payment');
    await query(
      `UPDATE public.saas_billing_subscriptions SET paid_additional_seats = 1 WHERE id = $1`,
      [acceptSubscription],
    );
    const paidAccept = await invites.acceptPendingByTokenHash({
      tokenHash: 'accept-seat-token',
      platformUserId: acceptUser,
      expectedEmail: 'accept-seat@example.com',
    });
    assert(paidAccept.ok, 'accept omitted persisted paid allowance');

    // First tariff capture, early renewal boundary, seat isolation/replay, renewal arithmetic and
    // refund replay all go through the real billing repository.
    const billingOrg = '20000000-0000-4000-8000-0000000000c1';
    const billingTariff = '50000000-0000-4000-8000-0000000000c1';
    const billingSubscription = '60000000-0000-4000-8000-0000000000c1';
    const firstInvoice = '70000000-0000-4000-8000-0000000000c1';
    const futureInvoice = '70000000-0000-4000-8000-0000000000c2';
    const seatInvoiceOne = '70000000-0000-4000-8000-0000000000c3';
    const seatInvoiceTwo = '70000000-0000-4000-8000-0000000000c4';
    await seedTariffSubscription({
      organizationId: billingOrg,
      tariffId: billingTariff,
      subscriptionId: billingSubscription,
      includedSeats: 1,
      status: 'pending_payment',
      lifecycleState: 'active',
    });
    await query(
      `INSERT INTO public.saas_organization_trials (
         organization_id, tariff_id, started_at, ends_at, grace_ends_at,
         post_trial_behavior, status
       ) VALUES ($1, $2, '2026-07-01', '2026-08-01', '2026-08-08', 'blocked', 'active')`,
      [billingOrg, billingTariff],
    );
    await insertInvoice({
      id: firstInvoice,
      organizationId: billingOrg,
      subscriptionId: billingSubscription,
      tariffId: billingTariff,
      invoiceKind: 'tariff_period',
      additionalSeatQuantity: 0,
      amountMinor: 10000,
      periodStart: '2026-08-01T00:00:00.000Z',
      periodEnd: '2026-09-01T00:00:00.000Z',
      providerRef: 'first-tariff-ref',
      requestKey: 'first-tariff-request',
    });
    await billing.captureSaasBillingPaymentSucceeded({
      organizationId: billingOrg,
      saasBillingInvoiceId: firstInvoice,
      paidAt: '2026-08-01T00:00:00.000Z',
      event: providerEvent('first-tariff-event'),
      savedPaymentMethodId: 'saved-method',
    });
    const firstState = await query(
      `SELECT s.status, s.lifecycle_state, s.current_period_starts_at, s.current_period_ends_at,
         s.tariff_snapshot, t.status AS trial_status
       FROM public.saas_billing_subscriptions s
       JOIN public.saas_organization_trials t ON t.organization_id = s.organization_id
       WHERE s.id = $1`,
      [billingSubscription],
    );
    const firstRow = firstState.rows[0];
    assert(
      firstRow?.status === 'active' && firstRow?.lifecycle_state === 'active' &&
        firstRow?.current_period_starts_at && firstRow?.current_period_ends_at &&
        firstRow?.trial_status === 'ended' && firstRow?.tariff_snapshot?.included_seats === 1,
      'first real tariff capture rejected the NULL boundary or did not end the trial',
    );

    await insertInvoice({
      id: futureInvoice,
      organizationId: billingOrg,
      subscriptionId: billingSubscription,
      tariffId: billingTariff,
      invoiceKind: 'tariff_period',
      additionalSeatQuantity: 0,
      amountMinor: 10000,
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: '2026-10-01T00:00:00.000Z',
      providerRef: 'future-tariff-ref',
      requestKey: 'future-tariff-request',
    });
    await billing.captureSaasBillingPaymentSucceeded({
      organizationId: billingOrg,
      saasBillingInvoiceId: futureInvoice,
      paidAt: '2026-08-15T00:00:00.000Z',
      event: providerEvent('future-tariff-event'),
      savedPaymentMethodId: null,
    });
    const beforeBoundary = await query(
      `SELECT current_period_ends_at FROM public.saas_billing_subscriptions WHERE id = $1`,
      [billingSubscription],
    );
    assert(
      new Date(beforeBoundary.rows[0]?.current_period_ends_at).toISOString() === '2026-09-01T00:00:00.000Z',
      'early-paid future invoice moved the tariff boundary early',
    );
    const promoted = await billing.promoteDueSaasBillingPaidInvoice({
      organizationId: billingOrg,
      saasBillingSubscriptionId: billingSubscription,
      asOf: '2026-09-01T00:00:00.000Z',
    });
    assert(promoted, 'paid renewal was not promoted at its exact boundary');

    const stableBeforeSeat = await query(
      `SELECT tariff_id, pending_tariff_id, status, lifecycle_state, current_period_starts_at,
         current_period_ends_at, tariff_snapshot, saved_payment_method_id
       FROM public.saas_billing_subscriptions WHERE id = $1`,
      [billingSubscription],
    );
    await insertInvoice({
      id: seatInvoiceOne,
      organizationId: billingOrg,
      subscriptionId: billingSubscription,
      tariffId: billingTariff,
      invoiceKind: 'seat_overage',
      additionalSeatQuantity: 1,
      amountMinor: 1500,
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: '2026-10-01T00:00:00.000Z',
      providerRef: 'seat-one-ref',
      requestKey: 'seat-one-request',
    });
    await billing.captureSaasBillingPaymentSucceeded({
      organizationId: billingOrg,
      saasBillingInvoiceId: seatInvoiceOne,
      paidAt: '2026-09-02T00:00:00.000Z',
      event: providerEvent('seat-one-event'),
      savedPaymentMethodId: 'must-not-overwrite',
    });
    await billing.captureSaasBillingPaymentSucceeded({
      organizationId: billingOrg,
      saasBillingInvoiceId: seatInvoiceOne,
      paidAt: '2026-09-03T00:00:00.000Z',
      event: providerEvent('seat-one-replay-different-event'),
      savedPaymentMethodId: 'must-not-overwrite',
    });
    const afterSeatOne = await query(
      `SELECT tariff_id, pending_tariff_id, status, lifecycle_state, current_period_starts_at,
         current_period_ends_at, tariff_snapshot, saved_payment_method_id, paid_additional_seats
       FROM public.saas_billing_subscriptions WHERE id = $1`,
      [billingSubscription],
    );
    const { paid_additional_seats: paidAfterOne, ...stableAfterSeat } = afterSeatOne.rows[0];
    assert(paidAfterOne === 1, 'real seat capture/replay did not add allowance exactly once');
    assert(
      JSON.stringify(stableAfterSeat) === JSON.stringify(stableBeforeSeat.rows[0]),
      'seat capture promoted or rewrote tariff subscription state',
    );

    await insertInvoice({
      id: seatInvoiceTwo,
      organizationId: billingOrg,
      subscriptionId: billingSubscription,
      tariffId: billingTariff,
      invoiceKind: 'seat_overage',
      additionalSeatQuantity: 1,
      amountMinor: 1500,
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: '2026-10-01T00:00:00.000Z',
      providerRef: 'seat-two-ref',
      requestKey: 'seat-two-request',
    });
    await billing.captureSaasBillingPaymentSucceeded({
      organizationId: billingOrg,
      saasBillingInvoiceId: seatInvoiceTwo,
      paidAt: '2026-09-04T00:00:00.000Z',
      event: providerEvent('seat-two-event'),
      savedPaymentMethodId: null,
    });
    const renewal = await billing.createSaasBillingRenewalInvoiceIfAbsent({
      organizationId: billingOrg,
      saasBillingSubscriptionId: billingSubscription,
      providerId: 'mock',
      providerIdempotencyKey: 'renewal-with-seats',
      servicePeriodStartsAt: '2026-10-01T00:00:00.000Z',
      servicePeriodEndsAt: '2026-11-01T00:00:00.000Z',
    });
    assert(
      renewal.invoice.amountMinor === 13000 && renewal.invoice.additionalSeatQuantity === 2,
      'real renewal omitted base + quantity times unit price or its quantity snapshot',
    );
    await query(`UPDATE public.saas_tariffs SET additional_seat_price_minor = NULL WHERE id = $1`, [billingTariff]);
    let missingPriceRejected = false;
    try {
      await billing.createSaasBillingRenewalInvoiceIfAbsent({
        organizationId: billingOrg,
        saasBillingSubscriptionId: billingSubscription,
        providerId: 'mock',
        providerIdempotencyKey: 'renewal-missing-price',
        servicePeriodStartsAt: '2026-11-01T00:00:00.000Z',
        servicePeriodEndsAt: '2026-12-01T00:00:00.000Z',
      });
    } catch (error) {
      missingPriceRejected = error instanceof Error && error.message === 'saas_billing_additional_seat_price_missing';
    }
    assert(missingPriceRejected, 'real renewal did not fail before insert when the seat unit price was missing');
    await query(`UPDATE public.saas_tariffs SET additional_seat_price_minor = 1500 WHERE id = $1`, [billingTariff]);

    await query(
      `INSERT INTO public.saas_billing_refunds (
         id, organization_id, saas_billing_invoice_id, amount_minor, currency, status,
         provider_id, provider_refund_ref, provider_idempotency_key
       ) VALUES ('80000000-0000-4000-8000-0000000000c1', $1, $2, 1500, 'RUB',
         'pending', 'mock', 'refund-full-ref', 'refund-full-request')`,
      [billingOrg, seatInvoiceTwo],
    );
    await billing.confirmSaasBillingRefund({
      saasBillingRefundId: '80000000-0000-4000-8000-0000000000c1',
      organizationId: billingOrg,
      status: 'succeeded',
      confirmedAt: '2026-09-05T00:00:00.000Z',
    });
    await billing.confirmSaasBillingRefund({
      saasBillingRefundId: '80000000-0000-4000-8000-0000000000c1',
      organizationId: billingOrg,
      status: 'succeeded',
      confirmedAt: '2026-09-06T00:00:00.000Z',
    });
    const afterRefund = await query(
      `SELECT paid_additional_seats FROM public.saas_billing_subscriptions WHERE id = $1`,
      [billingSubscription],
    );
    assert(afterRefund.rows[0]?.paid_additional_seats === 1, 'full refund replay decremented allowance more than once');
    await query(
      `INSERT INTO public.saas_billing_refunds (
         id, organization_id, saas_billing_invoice_id, amount_minor, currency, status,
         provider_id, provider_refund_ref, provider_idempotency_key
       ) VALUES ('80000000-0000-4000-8000-0000000000c2', $1, $2, 1, 'RUB',
         'pending', 'mock', 'refund-partial-ref', 'refund-partial-request')`,
      [billingOrg, seatInvoiceOne],
    );
    let partialRejected = false;
    try {
      await billing.confirmSaasBillingRefund({
        saasBillingRefundId: '80000000-0000-4000-8000-0000000000c2',
        organizationId: billingOrg,
        status: 'succeeded',
        confirmedAt: '2026-09-06T00:00:00.000Z',
      });
    } catch (error) {
      partialRejected = error instanceof Error && error.message === 'saas_billing_seat_overage_partial_refund_forbidden';
    }
    assert(partialRejected, 'partial seat refund was not rejected by the real refund state machine');

    console.log(
      'product paths: create/accept/capture/boundary/renewal/refund verified through real Drizzle ports',
    );
  } finally {
    await client.end();
    await getPool().end();
  }
}

async function runParentProof() {
  if (!existsSync(path.join(pgBin, 'initdb'))) fail('PostgreSQL 16 binaries are unavailable');
  const stamp = `${process.pid}_${Date.now()}`;
  const dir = mkdtempSync(`/tmp/bcb_c4a_843_invite_concurrency_scratch_${stamp}_`);
  const data = path.join(dir, 'data');
  const socket = path.join(dir, 'socket');
  const log = path.join(dir, 'postgres.log');
  const db = `bcb_c4a_843_invite_concurrency_scratch_${stamp}`;
  const safeEnv = { LANG: 'C', LC_ALL: 'C', PATH: `${pgBin}:/usr/bin:/bin` };
  let serverStarted = false;

  const run = (command, args, label, options = {}) => {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      env: safeEnv,
      ...options,
    });
    if (result.error || result.status !== 0) {
      fail(`${label}: ${result.stderr || result.stdout || result.error}`);
    }
    return result.stdout;
  };
  const reservePrivatePort = async () => {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') fail('could not reserve a private PostgreSQL port');
    const reservedPort = address.port;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    return String(reservedPort);
  };

  let port;
  try {
    port = await reservePrivatePort();
    mkdirSync(socket, { recursive: true });
    run(path.join(pgBin, 'initdb'), ['-D', data, '-A', 'trust', '--no-locale'], 'private initdb');
    run(
      path.join(pgBin, 'pg_ctl'),
      ['-D', data, '-l', log, '-o', `-k ${socket} -p ${port} -c listen_addresses=127.0.0.1`, '-w', 'start'],
      'private PostgreSQL startup',
    );
    serverStarted = true;
    run(path.join(pgBin, 'createdb'), ['-h', socket, '-p', port, db], 'private scratch database creation');

    const client = new pg.Client({ host: socket, port: Number(port), database: db, user: OS_USER, ssl: false });
    await client.connect();
    try {
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
        CREATE SCHEMA IF NOT EXISTS app;

        CREATE TABLE public.be_organizations (
          id uuid PRIMARY KEY, title text NOT NULL DEFAULT '', is_active boolean NOT NULL DEFAULT true,
          sort_order integer NOT NULL DEFAULT 0, tariff_id uuid,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE public.saas_tariffs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL DEFAULT 'Tariff',
          description text NOT NULL DEFAULT '', price_minor integer, currency text,
          billing_period text NOT NULL DEFAULT 'month', mechanics jsonb NOT NULL DEFAULT '{}'::jsonb,
          quotas jsonb NOT NULL DEFAULT '{}'::jsonb, system_access_policy jsonb,
          mechanic_access_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
          downgrade_policies jsonb NOT NULL DEFAULT '{}'::jsonb, included_seats integer,
          additional_seat_price_minor integer, is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE public.saas_billing_subscriptions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
          saas_billing_account_id uuid NOT NULL DEFAULT gen_random_uuid(), tariff_id uuid NOT NULL,
          pending_tariff_id uuid, source text NOT NULL, status text NOT NULL DEFAULT 'pending_payment',
          lifecycle_state text NOT NULL DEFAULT 'active', provider_id text, saved_payment_method_id text,
          autopay_consented_at timestamptz, autopay_consent_text text, autopay_revoked_at timestamptz,
          current_period_starts_at timestamptz, current_period_ends_at timestamptz,
          grace_ends_at timestamptz, read_only_ends_at timestamptz, tariff_snapshot jsonb,
          cancelled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id, source)
        );
        CREATE TABLE public.saas_billing_invoices (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
          saas_billing_account_id uuid NOT NULL DEFAULT gen_random_uuid(),
          saas_billing_subscription_id uuid NOT NULL, tariff_id uuid NOT NULL,
          tariff_name text NOT NULL DEFAULT 'Tariff', description text, amount_minor integer NOT NULL,
          currency text NOT NULL, tariff_billing_period text NOT NULL DEFAULT 'month', tariff_snapshot jsonb,
          service_period_starts_at timestamptz NOT NULL, service_period_ends_at timestamptz NOT NULL,
          expires_at timestamptz, status text NOT NULL DEFAULT 'draft', provider_id text NOT NULL,
          provider_invoice_ref text, provider_checkout_url text, provider_idempotency_key text NOT NULL,
          paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT saas_billing_invoices_period_uidx UNIQUE
            (saas_billing_subscription_id, service_period_starts_at, service_period_ends_at),
          UNIQUE (provider_id, provider_idempotency_key)
        );
        CREATE TABLE public.saas_organization_trials (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL UNIQUE,
          tariff_id uuid NOT NULL, started_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
          grace_ends_at timestamptz NOT NULL, post_trial_behavior text NOT NULL,
          post_trial_tariff_id uuid, status text NOT NULL DEFAULT 'active', extension_count integer NOT NULL DEFAULT 0,
          created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE public.saas_billing_refunds (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
          saas_billing_invoice_id uuid NOT NULL, amount_minor integer NOT NULL, currency text NOT NULL,
          status text NOT NULL DEFAULT 'pending', provider_id text NOT NULL, provider_refund_ref text,
          provider_idempotency_key text NOT NULL, confirmed_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (provider_id, provider_idempotency_key)
        );
        CREATE TABLE public.saas_billing_provider_events (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
          saas_billing_invoice_id uuid, provider_id text NOT NULL, provider_event_id text NOT NULL,
          event_type text NOT NULL, raw_payload jsonb NOT NULL, processed_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (provider_id, provider_event_id)
        );
        CREATE TABLE public.saas_org_entitlement_overrides (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
          mechanic text NOT NULL, enabled boolean NOT NULL, quota jsonb, expires_at timestamptz,
          seat_limit_override integer, created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id, mechanic)
        );
        CREATE TABLE public.platform_users (
          id uuid PRIMARY KEY, display_name text NOT NULL DEFAULT '', role text NOT NULL DEFAULT 'client',
          email text, email_normalized text, email_verified_at timestamptz, merged_into_id uuid,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE public.be_organization_members (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
          platform_user_id uuid NOT NULL, role text NOT NULL, specialist_id uuid,
          status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id, platform_user_id)
        );
        CREATE TABLE public.organization_member_invites (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
          invited_email text NOT NULL, invited_role text NOT NULL, token_hash text NOT NULL UNIQUE,
          status text NOT NULL DEFAULT 'pending', expires_at timestamptz NOT NULL,
          created_by_platform_user_id uuid NOT NULL, accepted_by_platform_user_id uuid,
          accepted_membership_id uuid, created_at timestamptz NOT NULL DEFAULT now(), accepted_at timestamptz
        );
        CREATE UNIQUE INDEX uq_organization_member_invites_org_email_pending
          ON public.organization_member_invites (organization_id, invited_email) WHERE status = 'pending';
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
        RETURNS SETOF public.saas_tariffs LANGUAGE sql STABLE
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
      assert(
        migratedRow?.invoice_kind === 'seat_overage' &&
          migratedRow?.additional_seat_quantity === 1 &&
          migratedRow?.paid_additional_seats === 1 &&
          migratedRow?.invoice_kind_default === null,
        '0308 legacy paid-seat backfill/default removal did not match the exact prefix contract',
      );

      const overlaySource = readFileSync(
        path.join(root, 'deploy/postgres/organization-member-invites-rls.sql'),
        'utf8',
      );
      await client.query(extractAcceptOrgInviteFunctionSql(overlaySource));
    } finally {
      await client.end();
    }

    const databaseUrl = `postgresql://${encodeURIComponent(OS_USER)}@127.0.0.1:${port}/${db}`;
    const childEnv = {
      LANG: 'C',
      LC_ALL: 'C',
      PATH: process.env.PATH || `${pgBin}:/usr/bin:/bin`,
      NODE_ENV: 'development',
      NODE_OPTIONS: '--throw-deprecation',
      ENV_FILE: '/dev/null',
      DATABASE_URL: databaseUrl,
      SESSION_COOKIE_SECRET: 'c4a-843-session-secret',
      INTEGRATOR_WEBAPP_ENTRY_SECRET: 'c4a-843-entry-secret',
      INTEGRATOR_WEBHOOK_SECRET: 'c4a-843-webhook-secret',
      C4A_843_PRODUCT_CHILD: '1',
    };
    const child = spawnSync(
      process.execPath,
      ['--import', 'tsx', path.join(webappRoot, 'scripts', 'check-c4a-843-clinic-invite-concurrency.mjs')],
      { cwd: webappRoot, encoding: 'utf8', env: childEnv },
    );
    if (child.error || child.status !== 0) {
      fail(`real Drizzle product-path child: ${child.stderr || child.stdout || child.error}`);
    }
    process.stdout.write(child.stdout);
    console.log(
      'C4A #843 clinic invite concurrency proof: OK (aggregate-only) — migration backfill, ' +
        'real create/accept capacity, first tariff capture, paid-seat replay isolation, renewal ' +
        'arithmetic and refund replay verified against a private PostgreSQL 16 server',
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
}

if (IS_PRODUCT_CHILD) {
  await runProductProof();
} else {
  await runParentProof();
}
