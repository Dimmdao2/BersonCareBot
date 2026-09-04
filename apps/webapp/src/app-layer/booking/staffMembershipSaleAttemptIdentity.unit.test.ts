/**
 * Independent audit oracle for the sale-attempt key introduced by `b10a50e74` (owner checklist
 * `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §K — MONEY-05, MONEY-10, MONEY-11).
 *
 * `saleIdempotencyKey` is a NEW persistent boundary: the worker's own suite proves that a repeat of
 * the SAME attempt converges. It does not cover what the converged answer says, nor what happens
 * when the retained key is carried into a DIFFERENT sale. Both breakages are money-visible and
 * silent, which is why they are tested here and not read off the diff:
 *
 *  1. A pay-link sale that is retried hands the doctor «Платёжный провайдер не настроен» and no
 *     link — while the package sits in `awaiting_payment` against an invoice the provider really
 *     issued. The doctor is told to take cash for something the patient can already pay online.
 *  2. A key retained from a failed attempt and reused for a different sale converges onto the
 *     earlier package: the doctor gets «Абонемент создан» for a package and a price they did not
 *     ask for, and the cash row is written at the earlier package's price.
 *
 * The seam is the cheapest public layer that sees both: the route only forwards what this returns,
 * and the panel only renders it.
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
const PATIENT_ID = '0194c2c5-1d75-7a42-8b64-a9b49aa52ba3';
const SERVICE_ID = '33333333-3333-4333-8333-333333333333';
const DOCTOR_ID = '55555555-5555-4555-8555-555555555555';
const CATALOG_ID = '44444444-4444-4444-8444-444444444444';
const CATALOG_PRICE_MINOR = 250000;
const MANUAL_PRICE_MINOR = 1200000;

/** `be_patient_packages` plus the partial unique index the candidate migration adds. */
function buildDeps() {
  const rows = new Map<string, PatientPackageRecord>();
  const keys = new Map<string, string>();
  let seq = 0;

  function insert(row: Omit<PatientPackageRecord, 'id'> & { saleIdempotencyKey?: string | null }) {
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

  const blank = {
    organizationId: ORG_ID,
    platformUserId: PATIENT_ID,
    subscriptionPackageId: null,
    status: 'offered',
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
  };

  const port = {
    getCatalogPackage: async (id: string) => ({
      id,
      organizationId: ORG_ID,
      title: 'Каталожный',
      priceMinor: CATALOG_PRICE_MINOR,
      currency: 'RUB',
    }),
    getPatientPackage: async (id: string, organizationId: string) => {
      const row = rows.get(id);
      return row && row.organizationId === organizationId ? row : null;
    },
    listPatientPackagesForUser: async () => [],
    findPatientPackageBySaleIdempotencyKey: async (organizationId: string, key: string) => {
      for (const row of rows.values()) {
        if (row.organizationId === organizationId && keys.get(row.id) === key) return row;
      }
      return null;
    },
    createManualPatientPackage: async (input: Record<string, unknown>) =>
      insert({
        ...blank,
        title: (input.title as string) ?? 'Индивидуальный',
        priceMinor: input.priceMinor as number,
        saleIdempotencyKey: input.saleIdempotencyKey as string | null,
      } as never),
    offerCatalogPackageToPatient: async (input: Record<string, unknown>) =>
      insert({
        ...blank,
        subscriptionPackageId: input.subscriptionPackageId as string,
        title: 'Каталожный',
        priceMinor: CATALOG_PRICE_MINOR,
        saleIdempotencyKey: input.saleIdempotencyKey as string | null,
      } as never),
    setPatientPackageStatus: async (
      id: string,
      organizationId: string,
      status: string,
      patch?: Record<string, unknown>,
    ) => {
      const row = rows.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      const updated = { ...row, status, ...(patch ?? {}) } as PatientPackageRecord;
      rows.set(id, updated);
      return updated;
    },
    appendHistoryEvent: async () => undefined,
    listUsagesForPackage: async () => [],
    runWithPackageLock: async (_id: string, _org: string, fn: () => Promise<unknown>) => fn(),
  } as unknown as MembershipsPort;

  // A configured, working provider: the point of test 1 is that the retry lies about it.
  let intentSeq = 0;
  const payments = {
    createPackagePaymentIntent: async () => {
      intentSeq += 1;
      return { id: `intent-${intentSeq}`, checkoutUrl: `https://pay.example/${intentSeq}` };
    },
  };

  const memberships = createMembershipsService({
    port,
    payments: payments as unknown as Parameters<typeof createMembershipsService>[0]['payments'],
    bookingEngine: null,
  });
  const patientPayments = createPatientPaymentsService({
    patientPaymentsPort: inMemoryPatientPaymentsPort,
  });
  const sale = createStaffMembershipSale({ memberships, patientPayments } as unknown as Parameters<
    typeof createStaffMembershipSale
  >[0]);
  return { sale, rows };
}

const runners = {
  runMembershipWrite: <T>(fn: () => Promise<T>) => fn(),
  runCashWrite: <T>(fn: () => Promise<T>) => fn(),
};

const common = {
  organizationId: ORG_ID,
  platformUserId: PATIENT_ID,
  assignedByPlatformUserId: DOCTOR_ID,
  createdBy: DOCTOR_ID,
  soldAt: null,
  notes: null,
  cashLedgerAvailable: true,
};

function catalogSale(overrides: Record<string, unknown> = {}) {
  return {
    ...common,
    kind: 'catalog' as const,
    method: 'link' as const,
    saleIdempotencyKey: 'sale-attempt-0101',
    subscriptionPackageId: CATALOG_ID,
    ...overrides,
  };
}

function manualSale(overrides: Record<string, unknown> = {}) {
  return {
    ...common,
    kind: 'manual' as const,
    method: 'cash' as const,
    saleIdempotencyKey: 'sale-attempt-0101',
    priceMinor: MANUAL_PRICE_MINOR,
    currency: 'RUB',
    validityDays: null,
    items: [{ serviceId: SERVICE_ID, quantity: 10 }],
    ...overrides,
  };
}

describe('staff membership sale — what one attempt key is allowed to answer', () => {
  beforeEach(() => {
    __resetInMemoryPatientPaymentsForTest();
  });

  it('hands back the issued checkout link when the same pay-link attempt is retried', async () => {
    const { sale } = buildDeps();

    const first = await sale.sell(
      catalogSale() as unknown as Parameters<typeof sale.sell>[0],
      runners,
    );
    const retried = await sale.sell(
      catalogSale() as unknown as Parameters<typeof sale.sell>[0],
      runners,
    );

    expect(retried.package.id).toBe(first.package.id);
    expect(retried.package.status).toBe('awaiting_payment');
    // The route derives `paymentLinkError: 'payment_provider_unavailable'` from an empty
    // checkoutUrl, so an empty one here is the doctor being told the provider is not configured
    // while the invoice it issued is live.
    expect(retried.package.checkoutUrl).toBe(first.package.checkoutUrl);
  });

  it('does not settle a different sale onto the package an earlier attempt created', async () => {
    const { sale, rows } = buildDeps();

    // Attempt 1 dies after the package row exists — the panel keeps its key for the retry.
    await expect(
      sale.sell(
        catalogSale({ method: 'free' }) as unknown as Parameters<typeof sale.sell>[0],
        runners,
      ),
    ).rejects.toThrow('sale_free_requires_zero_price');

    // The doctor now sells something else entirely, still under the retained key.
    const second = await sale.sell(
      manualSale() as unknown as Parameters<typeof sale.sell>[0],
      runners,
    );

    expect(second.package.priceMinor).toBe(MANUAL_PRICE_MINOR);
    expect(second.package.subscriptionPackageId).toBeNull();
    expect(rows.size).toBe(2);
    const ledger = await inMemoryPatientPaymentsPort.listPayments(PATIENT_ID);
    expect(ledger.map((payment) => payment.amountMinor)).toEqual([MANUAL_PRICE_MINOR]);
  });
});
