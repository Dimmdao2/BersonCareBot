/**
 * The booking acquiring callback must be reachable by the principals its route actually installs.
 *
 * Live defect (TEST, 2026-09-05): a YooKassa test payment of 7 000 ₽ for appointment
 * `f92ec4bb-…` succeeded at the provider, the provider delivered
 * `POST /api/payments/webhook/yookassa` three times, nginx recorded HTTP 400 on all three, and the
 * appointment payment view stayed `pending` forever. Neither half of that route could reach the
 * database:
 *
 * 1. The clinic resolver ran under the BOOTSTRAP principal (the tenant is exactly what it is trying
 *    to learn) through plain relation access. The port maps that principal to a capability named
 *    `pre_session`; the runtime catalog has no such key, so `webappPortContextPrincipal` threw
 *    before a single statement was issued and the route's catch answered 400 `webhook_failed`.
 * 2. Everything after it ran under the ORGANIZATION principal — the port's `tenant_service` class,
 *    which is granted no through-relation door at all (`deploy/postgres/privileges/declaration.ts`:
 *    «сквозной `purpose: 'relation'` этому классу не выдают (SCHEME §3)»).
 *
 * Route-level tests of this webhook fake the payments service, so none of them can see which door
 * the money is written through — that is what this file holds. The real `@bersoncare/db-principal`
 * and the real port-context runtime are used deliberately.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runWithWebappPortOperation,
  webappPortContextPrincipal,
  type PortCapabilityDescriptor,
} from '@/infra/db/portContextRuntime';

const fakes = vi.hoisted(() => ({
  runWebappNamedRoot: vi.fn(),
  runDrizzleMutationTransaction: vi.fn(),
  getDrizzleOrMutationTx: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(),
  getWebappSqlFromPgClient: vi.fn(),
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappSql: vi.fn(),
}));
vi.mock('@/infra/db/drizzleMutationTx', () => ({
  getDrizzleOrMutationTx: fakes.getDrizzleOrMutationTx,
  runDrizzleMutationTransaction: fakes.runDrizzleMutationTransaction,
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: vi.fn() }));

import { createPgPaymentsPort } from '@/infra/repos/pgPayments';

const ORGANIZATION_ID = '44444444-4444-4444-8444-444444444444';
const PROVIDER_ID = 'yookassa';
const IDEMPOTENCY_KEY = 'appointment-prepayment:f92ec4bb-2913-470a-a522-7851bb14ec2d';
const EVENT_TYPE = 'payment.succeeded';
const PROVIDER_INTENT_REF = '2f4b9c1a-000f-5000-a000-1d0f0a0b0c0d';
const PAYMENT_ID = '99999999-9999-4999-8999-999999999999';
const APPOINTMENT_ID = 'f92ec4bb-2913-470a-a522-7851bb14ec2d';

/**
 * The declared capability catalog exactly as the deploy renders it into the runtime env.
 *
 * Read from the committed generated artifact rather than restated here: the identity string the
 * repository passes is only meaningful if the DECLARATION carries a capability for it, and a typo on
 * either side is a runtime 400 that no fake catalog would ever show.
 */
function declaredWebappCapabilities(): Record<string, PortCapabilityDescriptor> {
  const seed = readFileSync(
    new URL(
      '../../../../../deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const rows = [
    ...seed.matchAll(
      /\('([0-9a-f-]{36})'::uuid, '(\w+)'::app\.port_name, '\w+'::name, '(\w+)'::name, '(\w+)'::app\.port_context_class, '([^']+)', (?:'([^']+)'::regprocedure|NULL::regprocedure)\)/gu,
    ),
  ];
  expect(rows.length).toBeGreaterThan(100);
  const capabilities: Record<string, PortCapabilityDescriptor> = {};
  for (const [, capabilityId, port, targetRole, contextClass, purpose, functionIdentity] of rows) {
    if (port !== 'webapp') continue;
    capabilities[functionIdentity ?? `${contextClass}:${purpose}`] = {
      capabilityId,
      targetRole,
      contextClass: contextClass as PortCapabilityDescriptor['contextClass'],
      purpose,
      ...(functionIdentity ? { functionIdentity } : {}),
    };
  }
  return capabilities;
}

describe('booking payment provider webhook doors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the clinic through a named root the bootstrap principal really has', async () => {
    fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ organization_id: ORGANIZATION_ID }] });

    await expect(
      createPgPaymentsPort().resolveProviderWebhookOrganization(
        PROVIDER_ID,
        IDEMPOTENCY_KEY,
        EVENT_TYPE,
      ),
    ).resolves.toBe(ORGANIZATION_ID);

    const [, functionIdentity, functionArgs] = fakes.runWebappNamedRoot.mock.calls[0]!;
    expect(functionIdentity).toBe('app.resolve_payment_webhook_organization(text,text,text)');
    expect(functionArgs).toEqual([PROVIDER_ID, IDEMPOTENCY_KEY, EVENT_TYPE]);

    // The route installs a bootstrap principal here — the clinic is the answer, not an input — so
    // the declaration has to open this root to the pre-session class or the callback cannot run.
    const selected = runWithWebappPortOperation(
      { functionIdentity: functionIdentity as string, typedArgs: [] },
      () =>
        webappPortContextPrincipal(
          { kind: 'bootstrap', source: 'api/payments/webhook:POST:pre-routing' },
          declaredWebappCapabilities(),
        ),
    );
    expect(selected).toMatchObject({
      pool: 'patient',
      principal: { targetRole: 'app_pre_session', contextClass: 'pre_session' },
    });
  });

  it('settles through a named root instead of relation access, and names no organization', async () => {
    fakes.runWebappNamedRoot.mockResolvedValue({
      rows: [
        {
          settlement: {
            outcome: 'captured',
            duplicate: false,
            paymentId: PAYMENT_ID,
            platformUserId: null,
            productRef: null,
            confirmedAppointmentIds: [APPOINTMENT_ID],
          },
        },
      ],
    });

    const settled = await createPgPaymentsPort().settleProviderWebhookEvent({
      organizationId: ORGANIZATION_ID,
      providerId: PROVIDER_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      eventType: EVENT_TYPE,
      intentRef: PROVIDER_INTENT_REF,
      payloadJson: { event: EVENT_TYPE },
    });

    expect(settled.outcome).toBe('captured');
    expect(settled.paymentId).toBe(PAYMENT_ID);
    expect(settled.confirmedAppointmentIds).toEqual([APPOINTMENT_ID]);

    // No relation transaction: relation access is exactly what the organization principal cannot
    // do, and the arguments carry the provider reference only — the clinic is the installed
    // principal, so a callback verified for clinic A cannot name clinic B.
    expect(fakes.runDrizzleMutationTransaction).not.toHaveBeenCalled();
    const [, functionIdentity, functionArgs] = fakes.runWebappNamedRoot.mock.calls[0]!;
    expect(functionIdentity).toBe(
      'app.settle_booking_payment_webhook_event(text,text,text,text,text)',
    );
    expect(functionArgs).not.toContain(ORGANIZATION_ID);

    const selected = runWithWebappPortOperation(
      { functionIdentity: functionIdentity as string, typedArgs: [] },
      () =>
        webappPortContextPrincipal(
          { kind: 'organization', organizationId: ORGANIZATION_ID },
          declaredWebappCapabilities(),
        ),
    );
    expect(selected).toMatchObject({
      pool: 'staff',
      principal: { targetRole: 'app_tenant_service', organizationId: ORGANIZATION_ID },
    });
  });

  it('refuses an unrecognised settlement answer instead of reporting nothing captured', async () => {
    fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ settlement: { outcome: 'maybe' } }] });

    await expect(
      createPgPaymentsPort().settleProviderWebhookEvent({
        organizationId: ORGANIZATION_ID,
        providerId: PROVIDER_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        eventType: EVENT_TYPE,
        intentRef: PROVIDER_INTENT_REF,
        payloadJson: {},
      }),
    ).rejects.toThrow('booking_payment_webhook_settlement_outcome_unrecognised');
  });

  it('still has no relation door for either principal to fall back to', () => {
    // The defect this fix answers, stated as a standing invariant: both classes reach data only
    // through named roots, so a future rewrite back to `db.select()` fails here instead of in
    // production with a charged payer.
    const capabilities = declaredWebappCapabilities();
    expect(() =>
      webappPortContextPrincipal(
        { kind: 'organization', organizationId: ORGANIZATION_ID },
        capabilities,
      ),
    ).toThrow(/Missing declared webapp port capability: tenant_service/);
    expect(() =>
      webappPortContextPrincipal(
        { kind: 'bootstrap', source: 'api/payments/webhook:POST:pre-routing' },
        capabilities,
      ),
    ).toThrow(/Missing declared webapp port capability: pre_session/);
  });
});
