/**
 * Every `public.patient_payment` write must be reachable by the principal its caller installed.
 *
 * Live defect (DEV, 2026-09-05): «Оплачено наличными» on a 7 000 ₽ appointment answered «Не удалось
 * выполнить действие.» — the repository re-entered an ORGANIZATION principal over the staff one the
 * cabinet door had installed, and the webapp port grants the tenant-service class no through-door
 * for relation access (`deploy/postgres/privileges/declaration.ts`: «сквозной `purpose: 'relation'`
 * этому классу не выдают (SCHEME §3)»). The port-context resolver looked up an undeclared
 * `tenant_service` capability and threw before a single statement reached PostgreSQL, so no cash a
 * specialist collected could ever be recorded. The declared writer of `public.patient_payment` is
 * `app_staff` (`deploy/postgres/privileges/relation-access.ts`).
 *
 * Every route-level test of this door fakes `addCashPayment`, so none of them can see which DB role
 * the money is written as — that is what this file holds. The real `@bersoncare/db-principal` is
 * used deliberately: the assertion is about the principal actually in force at write time.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
  runWithDbOrganizationPrincipal,
  runWithDbStaffPrincipal,
} from '@bersoncare/db-principal';
import {
  runWithWebappPortOperation,
  webappPortContextPrincipal,
  type PortCapabilityDescriptor,
} from '@/infra/db/portContextRuntime';

const fakes = vi.hoisted(() => ({
  withTransaction: vi.fn(),
  getWebappSqlFromPgClient: vi.fn(),
  runWebappNamedRoot: vi.fn(),
}));

vi.mock('@/infra/db/withClient', () => ({ withTransaction: fakes.withTransaction }));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(),
  getWebappSqlFromPgClient: fakes.getWebappSqlFromPgClient,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: vi.fn() }));
vi.mock('@/infra/db/client', () => ({ getPool: vi.fn() }));

import { createPgPatientPaymentsPort } from '@/infra/repos/pgPatientPayments';

const ORGANIZATION_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_ORGANIZATION_ID = '55555555-5555-4555-8555-555555555555';
const PATIENT_ID = '66666666-6666-4666-8666-666666666666';
const STAFF_ID = '77777777-7777-4777-8777-777777777777';
const APPOINTMENT_ID = '88888888-8888-4888-8888-888888888888';

const insertedRow = {
  id: '99999999-9999-4999-8999-999999999999',
  organizationId: ORGANIZATION_ID,
  patientUserId: PATIENT_ID,
  amountMinor: 700_000,
  currency: 'RUB',
  kind: 'cash',
  status: 'paid',
  comment: 'Оплачено наличными в карточке записи',
  service: null,
  visitId: null,
  appointmentId: APPOINTMENT_ID,
  patientPackageId: null,
  idempotencyKey: `staff-appointment-cash:${APPOINTMENT_ID}:700000`,
  provider: null,
  providerPaymentId: null,
  createdBy: STAFF_ID,
  createdAt: '2026-09-05T00:00:00.000Z',
};

/** Minimal stand-in for the drizzle insert chain the cash write uses. */
function fakeTx() {
  return {
    insert: () => ({
      values: () => ({ onConflictDoNothing: () => ({ returning: async () => [insertedRow] }) }),
    }),
  };
}

function cashInput(organizationId = ORGANIZATION_ID) {
  return {
    organizationId,
    patientUserId: PATIENT_ID,
    appointmentId: APPOINTMENT_ID,
    amountMinor: 700_000,
    currency: 'RUB',
    service: null,
    comment: 'Оплачено наличными в карточке записи',
    idempotencyKey: `staff-appointment-cash:${APPOINTMENT_ID}:700000`,
    createdBy: STAFF_ID,
  };
}

function runAsCabinetStaff<T>(fn: () => Promise<T>): Promise<T> {
  return runWithDbStaffPrincipal(
    {
      organizationId: ORGANIZATION_ID,
      platformUserId: STAFF_ID,
      source: 'doctor.booking.appointment-payment.cash',
    },
    fn,
  );
}

describe('patient payment cash write principal', () => {
  let principalAtWriteTime: { kind: string | undefined; organizationId: string | undefined };

  beforeEach(() => {
    vi.clearAllMocks();
    principalAtWriteTime = { kind: undefined, organizationId: undefined };
    fakes.getWebappSqlFromPgClient.mockImplementation(() => fakeTx());
    fakes.withTransaction.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      principalAtWriteTime = {
        kind: getCurrentDbPrincipal()?.kind,
        organizationId: getCurrentDbPrincipalOrganizationId(),
      };
      return fn({});
    });
  });

  it('writes the collected cash under the staff principal the cabinet door installed', async () => {
    const payment = await runAsCabinetStaff(() =>
      createPgPatientPaymentsPort().addCashPayment(cashInput()),
    );

    expect(payment.amountMinor).toBe(700_000);
    expect(payment.status).toBe('paid');
    // `staff` is the only principal class the webapp port declares a relation door for and the only
    // role granted INSERT on `public.patient_payment`; anything else cannot reach the ledger at all.
    expect(principalAtWriteTime.kind).toBe('staff');
    expect(principalAtWriteTime.organizationId).toBe(ORGANIZATION_ID);
  });

  it('refuses to write a clinic other than the one the installed principal carries', async () => {
    await expect(
      runAsCabinetStaff(() =>
        createPgPatientPaymentsPort().addCashPayment(cashInput(OTHER_ORGANIZATION_ID)),
      ),
    ).rejects.toThrow('patient_payment_organization_principal_mismatch');
    expect(fakes.withTransaction).not.toHaveBeenCalled();
  });

  it('refuses a cash write with no principal installed at all', async () => {
    await expect(createPgPatientPaymentsPort().addCashPayment(cashInput())).rejects.toThrow(
      'organization_principal_required',
    );
    expect(fakes.withTransaction).not.toHaveBeenCalled();
  });
});

/**
 * The declared capability catalog exactly as the deploy renders it into the runtime env.
 *
 * Read from the committed generated artifact rather than restated here: the identity string the
 * repository passes is only meaningful if the DECLARATION carries a capability for it, and a typo on
 * either side is a runtime 500 that no fake catalog would ever show.
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

describe('acquiring webhook settlement principal', () => {
  const PROVIDER_ID = 'alfabank';
  const PROVIDER_PAYMENT_ID = 'provider-payment-1074';

  beforeEach(() => {
    vi.clearAllMocks();
    fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ outcome: 'settled' }] });
  });

  function settleAsWebhook() {
    return runWithDbOrganizationPrincipal(ORGANIZATION_ID, () =>
      createPgPatientPaymentsPort().settleAcquiringWebhookPayment({
        providerId: PROVIDER_ID,
        providerPaymentId: PROVIDER_PAYMENT_ID,
        status: 'paid',
      }),
    );
  }

  it('settles through a named root instead of relation access, and names no organization', async () => {
    await expect(settleAsWebhook()).resolves.toBe('settled');

    // No `withTransaction`: relation access is exactly what the organization principal cannot do,
    // and the arguments carry the provider reference only — the clinic is the installed principal.
    expect(fakes.withTransaction).not.toHaveBeenCalled();
    const [, functionIdentity, functionArgs] = fakes.runWebappNamedRoot.mock.calls[0]!;
    expect(functionIdentity).toBe('app.settle_patient_acquiring_webhook_payment(text,text,text)');
    expect(functionArgs).toEqual([PROVIDER_ID, PROVIDER_PAYMENT_ID, 'paid']);
    expect(functionArgs).not.toContain(ORGANIZATION_ID);
  });

  it('names a root the declaration really opens to the organization principal', async () => {
    await settleAsWebhook();
    const [, functionIdentity] = fakes.runWebappNamedRoot.mock.calls[0]!;

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

  it('still has no relation door for the organization principal to fall back to', () => {
    // The defect this fix answers, stated as a standing invariant: `tenant_service` reaches data only
    // through named roots. If this ever starts passing, the class was widened instead of given a door.
    expect(() =>
      webappPortContextPrincipal(
        { kind: 'organization', organizationId: ORGANIZATION_ID },
        declaredWebappCapabilities(),
      ),
    ).toThrow(/tenant_service/u);
  });
});
