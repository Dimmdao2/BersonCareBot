/**
 * The staff membership sale, exercised end to end over the real memberships service and the real
 * in-memory patient-payments port. The mocked layer stops at the DB rows, so what is under test is
 * exactly what the independent audit of `c86e6a4c1` found missing: who decides the paid amount, and
 * what a retry does.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createMembershipsService } from '@/modules/memberships/service';
import type { MembershipsPort } from '@/modules/memberships/ports';
import type { PatientPackageRecord } from '@/modules/memberships/types';
import {
  inMemoryPatientPaymentsPort,
  __resetInMemoryPatientPaymentsForTest,
} from '@/infra/repos/inMemoryPatientPayments';
import { createPatientPaymentsService } from '@/modules/patient-payments/service';
import { createStaffMembershipSale } from './staffMembershipSale';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';
const PATIENT_ID = '0194c2c5-1d75-7a42-8b64-a9b49aa52ba3';
const SERVICE_ID = '33333333-3333-4333-8333-333333333333';
const DOCTOR_ID = '55555555-5555-4555-8555-555555555555';

const CATALOG = {
  paid: { id: '44444444-4444-4444-8444-444444444444', priceMinor: 250000 },
  free: { id: '66666666-6666-4666-8666-666666666666', priceMinor: 0 },
};

/**
 * Stands in for `be_patient_packages`, including the one thing the migration adds: the partial
 * unique index on (organization_id, sale_idempotency_key). Without it modelled here the test would
 * "prove" convergence that the database does not actually enforce.
 */
function buildPackageStore() {
  const rows = new Map<string, PatientPackageRecord>();
  let seq = 0;

  function add(row: Omit<PatientPackageRecord, 'id'> & { saleIdempotencyKey?: string | null }) {
    const key = row.saleIdempotencyKey ?? null;
    if (key) {
      for (const existing of rows.values()) {
        if (existing.organizationId === row.organizationId && keys.get(existing.id) === key) {
          throw new Error('23505');
        }
      }
    }
    seq += 1;
    const id = `pkg-${seq}`;
    const record = { ...row, id } as PatientPackageRecord;
    rows.set(id, record);
    if (key) keys.set(id, key);
    return record;
  }

  const keys = new Map<string, string>();
  return { rows, keys, add, count: () => rows.size };
}

function buildDeps(options?: { catalogPriceMinor?: number }) {
  const store = buildPackageStore();

  const catalogFor = (id: string) => ({
    id,
    organizationId: ORG_ID,
    title: 'Каталожный',
    priceMinor:
      options?.catalogPriceMinor ??
      (id === CATALOG.free.id ? CATALOG.free.priceMinor : CATALOG.paid.priceMinor),
    currency: 'RUB',
  });

  const port = {
    listCatalogPackages: async () => [],
    getCatalogPackage: async (id: string) => catalogFor(id),
    getPatientPackage: async (id: string, organizationId: string) => {
      const row = store.rows.get(id);
      return row && row.organizationId === organizationId ? row : null;
    },
    listPatientPackagesForUser: async () => [],
    findPatientPackageBySaleIdempotencyKey: async (
      organizationId: string,
      saleIdempotencyKey: string,
    ) => {
      for (const row of store.rows.values()) {
        if (
          row.organizationId === organizationId &&
          store.keys.get(row.id) === saleIdempotencyKey
        ) {
          return row;
        }
      }
      return null;
    },
    createManualPatientPackage: async (input: Record<string, unknown>) =>
      store.add({
        organizationId: input.organizationId as string,
        platformUserId: input.platformUserId as string,
        subscriptionPackageId: null,
        status: 'offered',
        title: (input.title as string) ?? 'Индивидуальный',
        priceMinor: input.priceMinor as number,
        currency: 'RUB',
        validityDays: null,
        validFrom: null,
        validUntil: null,
        deductionMode: 'auto_on_visit_confirmed',
        paymentIntentId: null,
        paymentRef: null,
        soldAt: null,
        paidAmountMinor: null,
        paidCurrency: null,
        notes: null,
        items: [],
        saleIdempotencyKey: input.saleIdempotencyKey as string | null,
      } as never),
    offerCatalogPackageToPatient: async (input: Record<string, unknown>) => {
      const catalog = catalogFor(input.subscriptionPackageId as string);
      return store.add({
        organizationId: input.organizationId as string,
        platformUserId: input.platformUserId as string,
        subscriptionPackageId: catalog.id,
        status: 'offered',
        title: catalog.title,
        priceMinor: catalog.priceMinor,
        currency: 'RUB',
        validityDays: null,
        validFrom: null,
        validUntil: null,
        deductionMode: 'auto_on_visit_confirmed',
        paymentIntentId: null,
        paymentRef: null,
        soldAt: null,
        paidAmountMinor: null,
        paidCurrency: null,
        notes: null,
        items: [],
        saleIdempotencyKey: input.saleIdempotencyKey as string | null,
      } as never);
    },
    setPatientPackageStatus: async (
      id: string,
      organizationId: string,
      status: string,
      patch?: Record<string, unknown>,
    ) => {
      const row = store.rows.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      const updated = { ...row, status, ...(patch ?? {}) } as PatientPackageRecord;
      store.rows.set(id, updated);
      return updated;
    },
    appendHistoryEvent: async () => undefined,
    listUsagesForPackage: async () => [],
    listHistoryForPackage: async () => [],
    appendUsage: async () => undefined,
    listUsagesForAppointment: async () => [],
    runWithPackageLock: async (_id: string, _org: string, fn: () => Promise<unknown>) => fn(),
    updatePatientPackageNotes: async () => null,
  } as unknown as MembershipsPort;

  const memberships = createMembershipsService({ port, payments: null, bookingEngine: null });
  const patientPayments = createPatientPaymentsService({
    patientPaymentsPort: inMemoryPatientPaymentsPort,
  });
  const sale = createStaffMembershipSale({
    memberships,
    patientPayments,
  } as unknown as Parameters<typeof createStaffMembershipSale>[0]);
  return { sale, store, memberships };
}

const runners = {
  runMembershipWrite: <T>(fn: () => Promise<T>) => fn(),
  runCashWrite: <T>(fn: () => Promise<T>) => fn(),
};

function manualSale(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'manual' as const,
    organizationId: ORG_ID,
    platformUserId: PATIENT_ID,
    assignedByPlatformUserId: DOCTOR_ID,
    createdBy: DOCTOR_ID,
    method: 'cash' as const,
    saleIdempotencyKey: 'sale-attempt-0001',
    soldAt: null,
    notes: null,
    cashLedgerAvailable: true,
    priceMinor: 1200000,
    currency: 'RUB',
    validityDays: null,
    items: [{ serviceId: SERVICE_ID, quantity: 10 }],
    ...overrides,
  };
}

describe('staff membership sale — server owns the money', () => {
  beforeEach(() => {
    __resetInMemoryPatientPaymentsForTest();
  });

  it('records a cash sale in the canonical payment ledger with the price snapshot', async () => {
    const { sale } = buildDeps();

    const result = await sale.sell(manualSale(), runners);

    const ledger = await inMemoryPatientPaymentsPort.listPayments(PATIENT_ID);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      organizationId: ORG_ID,
      patientUserId: PATIENT_ID,
      patientPackageId: result.package.id,
      amountMinor: 1200000,
      kind: 'cash',
      status: 'paid',
    });
    expect(result.cashLedgerRecorded).toBe(true);
    expect(result.package.status).toBe('active');
    expect(result.package.paidAmountMinor).toBe(1200000);
  });

  it('sums a cash membership sale into the same cash total the finances KPI reads', async () => {
    const { sale } = buildDeps();
    await sale.sell(manualSale(), runners);

    const payments = await inMemoryPatientPaymentsPort.listPayments(PATIENT_ID);
    const totalCashMinor = payments
      .filter((p) => p.kind === 'cash' && p.status === 'paid')
      .reduce((sum, p) => sum + p.amountMinor, 0);

    expect(totalCashMinor).toBe(1200000);
  });

  it('converges on one package and one payment when the same sale attempt is retried', async () => {
    const { sale, store } = buildDeps();

    const first = await sale.sell(manualSale(), runners);
    const second = await sale.sell(manualSale(), runners);

    expect(second.package.id).toBe(first.package.id);
    expect(store.count()).toBe(1);
    expect(await inMemoryPatientPaymentsPort.listPayments(PATIENT_ID)).toHaveLength(1);
  });

  it('converges when two concurrent requests race past the key lookup to the index', async () => {
    const { sale, store } = buildDeps();

    // Both reads miss, both insert; the index rejects the loser, which must read back the winner.
    const [first, second] = await Promise.all([
      sale.sell(manualSale(), runners),
      sale.sell(manualSale(), runners),
    ]);

    expect(second.package.id).toBe(first.package.id);
    expect(store.count()).toBe(1);
    expect(await inMemoryPatientPaymentsPort.listPayments(PATIENT_ID)).toHaveLength(1);
  });

  it('treats a genuinely new sale attempt as a second sale', async () => {
    const { sale, store } = buildDeps();

    await sale.sell(manualSale(), runners);
    await sale.sell(manualSale({ saleIdempotencyKey: 'sale-attempt-0002' }), runners);

    expect(store.count()).toBe(2);
    expect(await inMemoryPatientPaymentsPort.listPayments(PATIENT_ID)).toHaveLength(2);
  });

  it('scopes the sale key to the clinic, so another org reusing it sells its own package', async () => {
    const { sale, store } = buildDeps();

    await sale.sell(manualSale(), runners);
    await sale.sell(manualSale({ organizationId: OTHER_ORG_ID }), runners);

    expect(store.count()).toBe(2);
  });

  it('leaves the package unsettled when the cash write fails, so the retry can finish it', async () => {
    const { sale, store } = buildDeps();

    await expect(
      sale.sell(manualSale(), {
        runMembershipWrite: runners.runMembershipWrite,
        runCashWrite: async () => {
          throw new Error('ledger_unavailable');
        },
      }),
    ).rejects.toThrow('ledger_unavailable');

    const created = [...store.rows.values()][0];
    expect(created?.status).toBe('offered');
    expect(created?.paidAmountMinor).toBeNull();
    expect(await inMemoryPatientPaymentsPort.listPayments(PATIENT_ID)).toHaveLength(0);

    const retried = await sale.sell(manualSale(), runners);
    expect(retried.package.id).toBe(created?.id);
    expect(retried.package.status).toBe('active');
    expect(store.count()).toBe(1);
  });

  it('still records an offline sale for a clinic whose tariff has no cash journal', async () => {
    const { sale } = buildDeps();

    const result = await sale.sell(manualSale({ cashLedgerAvailable: false }), runners);

    expect(result.cashLedgerRecorded).toBe(false);
    expect(result.package.status).toBe('active');
    expect(await inMemoryPatientPaymentsPort.listPayments(PATIENT_ID)).toHaveLength(0);
  });

  it('refuses a cash sale with no price instead of writing a zero-rouble ledger row', async () => {
    const { sale } = buildDeps();

    await expect(sale.sell(manualSale({ priceMinor: 0 }), runners)).rejects.toThrow(
      'sale_cash_requires_price',
    );
    expect(await inMemoryPatientPaymentsPort.listPayments(PATIENT_ID)).toHaveLength(0);
  });

  it('refuses a pay-link sale on a zero-price catalog template', async () => {
    const { sale, store } = buildDeps();

    await expect(
      sale.sell(
        {
          kind: 'catalog',
          organizationId: ORG_ID,
          platformUserId: PATIENT_ID,
          assignedByPlatformUserId: DOCTOR_ID,
          createdBy: DOCTOR_ID,
          method: 'link',
          saleIdempotencyKey: 'sale-attempt-0003',
          soldAt: null,
          notes: null,
          cashLedgerAvailable: false,
          subscriptionPackageId: CATALOG.free.id,
        },
        runners,
      ),
    ).rejects.toThrow('sale_link_requires_price');

    // The refusal must not leave behind the contradiction it exists to prevent: a package that is
    // already active while the card calls it «ждёт оплаты».
    expect([...store.rows.values()].every((row) => row.status === 'offered')).toBe(true);
  });

  it('activates a free issue at a paid amount of zero, not at the price', async () => {
    const { sale } = buildDeps();

    const result = await sale.sell(
      manualSale({ method: 'free', priceMinor: 0, saleIdempotencyKey: 'sale-attempt-0004' }),
      runners,
    );

    expect(result.package.status).toBe('active');
    expect(result.package.paidAmountMinor).toBe(0);
    expect(await inMemoryPatientPaymentsPort.listPayments(PATIENT_ID)).toHaveLength(0);
  });
});
