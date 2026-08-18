import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createSaasBillingService, SaasBillingTariffDowngradeBlockedError } from './service';
import {
  resolveOwnTariffTransition,
  type TariffDowngradeBlock,
} from '@/modules/org-entitlements/service';
import type { OrgEntitlementsPort } from '@/modules/org-entitlements/ports';
import type { Tariff } from '@/modules/org-entitlements/types';
import type {
  SaasBillingInvoice,
  SaasBillingManualAssignmentTransactionPort,
  SaasBillingRepositoryPort,
} from './ports';
import { PaymentProviderRequestRefusedError, type PaymentProviderPort } from '@/modules/payments/providerPort';
import { createInMemorySaasBillingRepository } from '@/infra/repos/inMemorySaasBilling';
import { resolveCommercialAccess } from '@/infra/repos/commercialAccessComputation';
import type { BillingPeriodOption } from './billingPeriodCatalog';
import type { SeatOverageQuote } from './seatOverageQuote';

/** Котировка, уже прошедшая проверку подписи: сервис получает именно её, а не тело запроса. */
function seatQuote(input: {
  organizationId: string;
  purchaseKey: string;
  priceMinor: number;
  currency?: string;
}): SeatOverageQuote {
  return {
    organizationId: input.organizationId,
    purchaseKey: input.purchaseKey,
    priceMinor: input.priceMinor,
    currency: input.currency ?? 'RUB',
    expiresAt: '2999-01-01T00:00:00.000Z',
  };
}

const DEFAULT_TEST_BILLING_PERIODS: BillingPeriodOption[] = [
  { code: 'day', label: 'День', months: 0, isSelectable: false, sortOrder: 0 },
  { code: 'month', label: 'Месяц', months: 1, isSelectable: true, sortOrder: 10 },
  { code: 'half_year', label: 'Полгода', months: 6, isSelectable: true, sortOrder: 20 },
  { code: 'year', label: 'Год', months: 12, isSelectable: true, sortOrder: 30 },
];

const SAAS_REPO_BILLING_PERIOD_STUB = {
  listBillingPeriods: async () => DEFAULT_TEST_BILLING_PERIODS,
} satisfies Pick<SaasBillingRepositoryPort, 'listBillingPeriods'>;

const invoice: SaasBillingInvoice = {
  id: 'invoice-1',
  organizationId: 'org-1',
  saasBillingAccountId: 'account-1',
  saasBillingSubscriptionId: 'subscription-1',
  tariffId: 'tariff-1',
  tariffName: 'Стандарт',
  invoiceKind: 'tariff_period',
  additionalSeatQuantity: 0,
  description: null,
  amountMinor: 10_000,
  currency: 'RUB',
  tariffBillingPeriod: 'month',
  tariffSnapshot: null,
  servicePeriodStartsAt: '2026-08-01T00:00:00.000Z',
  servicePeriodEndsAt: '2026-09-01T00:00:00.000Z',
  expiresAt: null,
  status: 'pending',
  providerId: 'mock',
  providerInvoiceRef: null,
  providerCheckoutUrl: null,
  providerIdempotencyKey: 'renewal-1',
};

describe('SaaS billing payment provider availability', () => {
  it('names a configured but unsupported provider as unavailable before an invoice is created', async () => {
    const createSaasBillingInvoice = vi.fn(async () => ({ invoice, created: true }));
    const getTariffTransition = vi.fn(async () => {
      throw new Error('platform_operations_principal_required');
    });
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription-1',
          currentTariffId: 'tariff-1',
          tariffId: 'tariff-1',
          billingPeriod: 'month' as const,
          savedPaymentMethodId: null,
          currentPeriodEndsAt: null,
        }),
        createSaasBillingInvoice,
      } as unknown as SaasBillingRepositoryPort,
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'mock',
          providers: [{ id: 'mock', label: 'Mock', enabled: true }],
        }),
      },
      resolvePaymentProvider: () => {
        throw new Error('unsupported_payment_provider:mock');
      },
      getTariffTransition,
    });

    await expect(service.createOwnTariffRenewalInvoice('org-1')).rejects.toThrow(
      'saas_billing_payment_provider_unavailable:mock',
    );
    expect(getTariffTransition).not.toHaveBeenCalled();
    expect(createSaasBillingInvoice).not.toHaveBeenCalled();
  });

  it('does not relabel a different provider-registry failure as unavailable', async () => {
    const createSaasBillingInvoice = vi.fn();
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription-1',
          tariffId: 'tariff-1',
          billingPeriod: 'month' as const,
          savedPaymentMethodId: null,
          currentPeriodEndsAt: null,
        }),
        createSaasBillingInvoice,
      } as unknown as SaasBillingRepositoryPort,
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'mock',
          providers: [{ id: 'mock', label: 'Mock', enabled: true }],
        }),
      },
      resolvePaymentProvider: () => {
        throw new Error('payment_registry_corrupted');
      },
    });

    await expect(service.createOwnTariffRenewalInvoice('org-1')).rejects.toThrow(
      'payment_registry_corrupted',
    );
    expect(createSaasBillingInvoice).not.toHaveBeenCalled();
  });
});

describe('Fiscalized SaaS refunds', () => {
  const fiscalizedInvoice: SaasBillingInvoice = {
    ...invoice,
    amountMinor: 10_000,
    providerInvoiceRef: 'provider-payment-1',
    status: 'paid',
    tariffSnapshot: {
      __bersoncare_fiscal_receipt: {
        customer: { email: 'payer@example.test' },
        items: [
          {
            description: 'Стандарт: август',
            quantity: 1,
            amountMinor: 10_000,
            vatCode: '11',
            paymentSubject: 'service',
            paymentMode: 'full_prepayment',
            measure: 'piece',
          },
        ],
        taxSystemCode: '2',
      },
    },
  };

  function refundService(amountMinor: number) {
    const providerRefund = vi.fn(async (params: Parameters<PaymentProviderPort['refund']>[0]) => {
      if (params.receipt === undefined) throw new Error('receipt_was_silently_dropped');
      return { providerRefundRef: 'provider-refund-1' };
    });
    const attachSaasBillingRefundProviderRef = vi.fn(async () => ({
      id: 'refund-1',
      organizationId: 'org-1',
      saasBillingInvoiceId: fiscalizedInvoice.id,
      amountMinor,
      currency: 'RUB',
      status: 'pending' as const,
      providerId: 'yookassa',
      providerRefundRef: 'provider-refund-1',
      providerIdempotencyKey: 'refund-key',
      confirmedAt: null,
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    }));
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        reserveSaasBillingRefund: async () => ({
          outcome: 'reserved' as const,
          refund: { id: 'refund-1' },
          invoice: fiscalizedInvoice,
        }),
        attachSaasBillingRefundProviderRef,
        markSaasBillingRefundFailed: vi.fn(),
      } as unknown as SaasBillingRepositoryPort,
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'mock',
          providers: [{ id: 'mock', label: 'Mock', enabled: true }],
        }),
      },
      resolvePaymentProvider: () => ({ refund: providerRefund }) as never,
    });
    return { service, providerRefund };
  }

  it('requires the original receipt snapshot for a partial refund and sends corrected totals', async () => {
    const { service, providerRefund } = refundService(2_500);

    await expect(
      service.refundSaasBillingInvoice({
        saasBillingInvoiceId: fiscalizedInvoice.id,
        amountMinor: 2_500,
        requestKey: 'partial',
        actorId: 'admin',
        reason: 'partial',
      }),
    ).resolves.toMatchObject({ outcome: 'refunded', duplicate: false });

    expect(providerRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt: expect.objectContaining({
          customer: { email: 'payer@example.test' },
          items: [expect.objectContaining({ amountMinor: 2_500, quantity: 1, vatCode: '11' })],
        }),
      }),
    );
  });

  it('omits receipt for a full refund', async () => {
    const { service, providerRefund } = refundService(10_000);
    providerRefund.mockImplementationOnce(
      async (params: Parameters<PaymentProviderPort['refund']>[0]) => {
        expect(params.receipt).toBeUndefined();
        return { providerRefundRef: 'provider-refund-1' };
      },
    );

    await expect(
      service.refundSaasBillingInvoice({
        saasBillingInvoiceId: fiscalizedInvoice.id,
        amountMinor: 10_000,
        requestKey: 'full',
        actorId: 'admin',
        reason: 'full',
      }),
    ).resolves.toMatchObject({ outcome: 'refunded', duplicate: false });
  });
});

describe('Р-14: clinic tariff schedule uses the paid-subscription boundary', () => {
  function scheduledService(blocks: TariffDowngradeBlock[] = []) {
    const setManualSaasBillingSubscription = vi.fn(async () => {});
    const appendManualAssignmentAudit = vi.fn(async () => {});
    const createIntent = vi.fn();
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        getOrganizationBillingOverview: async () => ({
          organizationId: 'org',
          subscriptions: [{ source: 'paid_subscription', tariffId: 'tariff-current' }],
          invoices: [],
          providerEvents: [],
        }) as never,
        runManualAssignmentTransaction: (work: (transaction: SaasBillingManualAssignmentTransactionPort) => Promise<unknown>) => work({
          loadManualAssignmentState: async () => ({
            organization: { tariffId: 'tariff-current' },
            organizationTrialConsumed: true,
            activeTrial: null,
            manualSaasBillingSubscription: {
              id: 'subscription', tariffId: 'tariff-current', status: 'active',
              currentPeriodStartsAt: '2026-08-01T00:00:00.000Z', currentPeriodEndsAt: '2026-09-01T00:00:00.000Z', pendingTariffId: null,
            },
          }),
          requireActiveTariff: async () => ({ billingPeriod: 'month' as const }),
          getActiveTrialPolicy: async () => null,
          startOrganizationTrial: vi.fn(),
          setManualSaasBillingSubscription,
          updateOrganizationTariffAssignment: vi.fn(), endActiveTrial: vi.fn(), appendManualAssignmentAudit,
        }),
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      getTariffTransition: async () => ({ currentTariffId: 'tariff-current', targetTariffId: 'tariff-small', blocks, appliesNextPeriod: true }),
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    });
    return { service, setManualSaasBillingSubscription, appendManualAssignmentAudit, createIntent };
  }

  it('schedules a restrictive target without changing the paid dates or creating a provider intent', async () => {
    const { service, setManualSaasBillingSubscription, createIntent } = scheduledService();

    await service.scheduleOwnTariffChange({ organizationId: 'org', tariffId: 'tariff-small', actorId: 'actor' });

    expect(setManualSaasBillingSubscription).toHaveBeenCalledWith(expect.objectContaining({
      tariffId: 'tariff-current', pendingTariffId: 'tariff-small',
      preservePeriodSnapshot: true,
      period: { startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-09-01T00:00:00.000Z' },
    }));
    expect(createIntent).not.toHaveBeenCalled();
  });

  it('refuses a blocked downgrade before any provider call', async () => {
    const { service, setManualSaasBillingSubscription, createIntent } = scheduledService([
      { mechanic: 'patient_count', reason: 'quota_exceeded' },
    ]);

    await expect(service.scheduleOwnTariffChange({ organizationId: 'org', tariffId: 'tariff-small', actorId: 'actor' }))
      .rejects.toBeInstanceOf(SaasBillingTariffDowngradeBlockedError);
    expect(setManualSaasBillingSubscription).not.toHaveBeenCalled();
    expect(createIntent).not.toHaveBeenCalled();
  });

  it('cancels the one pending change without replacing its paid period snapshot and writes an audit entry', async () => {
    const { setManualSaasBillingSubscription, appendManualAssignmentAudit } = scheduledService();
    const cancelService = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        getOrganizationBillingOverview: async () => ({
          organizationId: 'org',
          subscriptions: [{ source: 'paid_subscription', tariffId: 'tariff-current' }],
          invoices: [],
          providerEvents: [],
        }) as never,
        runManualAssignmentTransaction: (work: (transaction: SaasBillingManualAssignmentTransactionPort) => Promise<unknown>) => work({
          loadManualAssignmentState: async () => ({
            organization: { tariffId: 'tariff-current' },
            organizationTrialConsumed: true,
            activeTrial: null,
            manualSaasBillingSubscription: {
              id: 'subscription', tariffId: 'tariff-current', status: 'active',
              currentPeriodStartsAt: '2026-08-01T00:00:00.000Z', currentPeriodEndsAt: '2026-09-01T00:00:00.000Z', pendingTariffId: 'tariff-small',
            },
          }),
          requireActiveTariff: async () => ({ billingPeriod: 'month' as const }),
          getActiveTrialPolicy: async () => null,
          startOrganizationTrial: vi.fn(),
          setManualSaasBillingSubscription,
          updateOrganizationTariffAssignment: vi.fn(), endActiveTrial: vi.fn(), appendManualAssignmentAudit,
        }),
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({}) as never,
    });

    await cancelService.cancelOwnTariffChange({ organizationId: 'org', actorId: 'actor' });

    expect(setManualSaasBillingSubscription).toHaveBeenCalledWith(expect.objectContaining({
      tariffId: 'tariff-current', pendingTariffId: null, preservePeriodSnapshot: true,
      period: { startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-09-01T00:00:00.000Z' },
    }));
    expect(appendManualAssignmentAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'saas_tariff_change_cancelled', after: { pendingTariffId: null },
    }));
  });

  it('rechecks the same transition before issuing a renewal intent', async () => {
    const createIntent = vi.fn();
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription', tariffId: 'tariff-small', billingPeriod: 'month' as const,
          currentTariffId: 'tariff-current',
          savedPaymentMethodId: null, currentPeriodEndsAt: '2026-09-01T00:00:00.000Z',
        }),
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      getTariffTransition: async () => ({ currentTariffId: 'tariff-current', targetTariffId: 'tariff-small', blocks: [{ mechanic: 'patient_count', reason: 'quota_exceeded' }], appliesNextPeriod: true }),
    });

    await expect(service.createOwnTariffRenewalInvoice('org')).rejects.toThrow('saas_billing_tariff_downgrade_blocked');
    expect(createIntent).not.toHaveBeenCalled();
  });
});

// §5a/2.1c — the path by which a clinic pays US must be untouched by the access ladder in every
// state, including the terminal cabinet block; otherwise the block cannot be lifted by paying and
// becomes inescapable. Two halves, because one alone is not enough:
//   1. the checkout is really produced (behaviour);
//   2. this module cannot consult the ladder at all (parse tree) — the only way the path could ever
//      start being gated is by importing the entitlement door, so that is what is forbidden.
// Арбитр: add `import { resolveMechanicAccess } from '@/modules/org-entitlements/service'` to
// service.ts — the second test must turn red.
describe('§5a/2.1c: own-tariff money flow survives the cabinet block', () => {
  it('never depends on the access ladder that could gate it', () => {
    const moduleDir = fileURLToPath(new URL('.', import.meta.url));
    const sources = readdirSync(moduleDir)
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .map((name) => join(moduleDir, name));
    // The clinic-facing billing route and the SaaS payment webhook are the same money path one
    // layer up — the webhook is the provider telling us the clinic paid, and capturing that must
    // stay just as untouched by the ladder as issuing the checkout.
    sources.push(
      fileURLToPath(new URL('../../app/api/clinic/billing/route.ts', import.meta.url)),
      fileURLToPath(
        new URL('../../app/api/payments/saas-webhook/[provider]/route.ts', import.meta.url),
      ),
    );

    const offenders: string[] = [];
    for (const path of sources) {
      const parsed = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      for (const statement of parsed.statements) {
        if (!ts.isImportDeclaration(statement)) continue;
        if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
        // `import type` is erased at compile time and cannot gate anything — only a value import
        // can reach the resolver. `ports.ts` legitimately names a lifecycle type this way.
        if (statement.importClause?.isTypeOnly) continue;
        const specifier = statement.moduleSpecifier.text;
        if (/org-entitlements|requireEntitlement|cabinetAccessGate/.test(specifier)) {
          offenders.push(`${basename(path)} → ${specifier}`);
        }
      }
    }

    expect(offenders, `own-tariff payment reached the access ladder: ${offenders.join(', ')}`)
      .toEqual([]);
  });

  it('creates a checkout for the clinic tariff', async () => {
    const createSaasBillingInvoice = vi.fn(async () => ({ invoice, created: true }));
    const attachSaasBillingInvoiceProviderIntent = vi.fn(async (input) => ({
      ...invoice,
      providerInvoiceRef: input.providerInvoiceRef,
      providerCheckoutUrl: input.providerCheckoutUrl,
    }));
    const createIntent = vi.fn(async () => ({
      providerIntentRef: 'provider-intent-1',
      checkoutUrl: 'https://billing.example.test/checkout-1',
    }));
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        createSaasBillingInvoice,
        attachSaasBillingInvoiceProviderIntent,
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
    });

    const result = await service.createRenewalSaasBillingInvoice({
      organizationId: 'org-1',
      saasBillingSubscriptionId: 'subscription-1',
      servicePeriodStartsAt: invoice.servicePeriodStartsAt,
      servicePeriodEndsAt: invoice.servicePeriodEndsAt,
      providerIdempotencyKey: invoice.providerIdempotencyKey,
    });

    expect(createIntent).toHaveBeenCalledTimes(1);
    expect(result.providerCheckoutUrl).toBe('https://billing.example.test/checkout-1');
  });

  it('carries global payee settings and the billing contact into a persisted YooKassa receipt', async () => {
    const createIntent = vi.fn(async () => ({ providerIntentRef: 'provider-intent-1' }));
    const attachSaasBillingInvoiceReceiptSnapshot = vi.fn(async ({ receipt }) => ({
      ...invoice,
      tariffSnapshot: { __bersoncare_fiscal_receipt: receipt },
    }));
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        createSaasBillingInvoice: async () => ({ invoice, created: true }),
        getSaasBillingAccountBillingEmail: async () => 'payer@example.test',
        attachSaasBillingInvoiceReceiptSnapshot,
        attachSaasBillingInvoiceProviderIntent: async () => invoice,
      } as unknown as SaasBillingRepositoryPort,
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'yookassa',
          providers: [{ id: 'yookassa', label: 'YooKassa', enabled: true }],
          payeeRequisites: { vatCode: '11', taxSystemCode: '2' },
        }),
      },
      resolvePaymentProvider: () => ({ createIntent }) as never,
    });

    await service.createRenewalSaasBillingInvoice({
      organizationId: 'org-1',
      saasBillingSubscriptionId: 'subscription-1',
      servicePeriodStartsAt: invoice.servicePeriodStartsAt,
      servicePeriodEndsAt: invoice.servicePeriodEndsAt,
      providerIdempotencyKey: invoice.providerIdempotencyKey,
    });

    expect(attachSaasBillingInvoiceReceiptSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt: expect.objectContaining({ customer: { email: 'payer@example.test' } }),
      }),
    );
    expect(createIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt: expect.objectContaining({
          customer: { email: 'payer@example.test' },
          taxSystemCode: '2',
          items: [expect.objectContaining({ amountMinor: invoice.amountMinor, vatCode: '11' })],
        }),
      }),
    );
  });

  it('refuses a fiscally configured YooKassa payment with no VAT code before the provider call', async () => {
    const createIntent = vi.fn(async () => ({ providerIntentRef: 'provider-intent-1' }));
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        createSaasBillingInvoice: async () => ({ invoice, created: true }),
        getSaasBillingAccountBillingEmail: async () => 'payer@example.test',
        attachSaasBillingInvoiceReceiptSnapshot: async () => invoice,
        attachSaasBillingInvoiceProviderIntent: async () => invoice,
      } as unknown as SaasBillingRepositoryPort,
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'yookassa',
          providers: [{ id: 'yookassa', label: 'YooKassa', enabled: true }],
          payeeRequisites: { taxSystemCode: '2' },
        }),
      },
      resolvePaymentProvider: () => ({ createIntent }) as never,
    });

    await expect(
      service.createRenewalSaasBillingInvoice({
        organizationId: 'org-1',
        saasBillingSubscriptionId: 'subscription-1',
        servicePeriodStartsAt: invoice.servicePeriodStartsAt,
        servicePeriodEndsAt: invoice.servicePeriodEndsAt,
        providerIdempotencyKey: invoice.providerIdempotencyKey,
      }),
    ).rejects.toThrow('saas_billing_receipt_vat_code_missing');
    expect(createIntent).not.toHaveBeenCalled();
  });
});

// §5a item 7.0 — источник события для лестницы. Поломка, которую ловит: назначение тарифа
// сохраняет подписку БЕЗ оплаченного периода (ровно так и было до 31.07: `current_period_ends_at`
// не писал ни один продуктовый путь), у резолвера нет денежного якоря, и клиника остаётся в полном
// доступе навсегда, какую бы лестницу владелец ни настроил.
// Oracle — решение владельца 31.07: «клиника выбирает нужный тариф и оплачивает; при неоплате
// первично выданный тариф работает как настроено» + длительность периода берётся из поля тарифа
// `billing_period`, а не из числа в коде (§5a item 2.6).
describe('§5a/7.0: назначение тарифа открывает ОПЛАЧЕННЫЙ ПЕРИОД с концом', () => {
  it('loads the period catalog before entering the exact-client assignment transaction', async () => {
    let transactionOpen = false;
    const listBillingPeriods = vi.fn(async () => {
      expect(transactionOpen).toBe(false);
      return DEFAULT_TEST_BILLING_PERIODS;
    });
    const transaction: SaasBillingManualAssignmentTransactionPort = {
      loadManualAssignmentState: async () => ({
        organization: { tariffId: null },
        organizationTrialConsumed: true,
        activeTrial: null,
        manualSaasBillingSubscription: null,
      }),
      requireActiveTariff: async () => ({ billingPeriod: 'month' }),
      setManualSaasBillingSubscription: async () => {},
      updateOrganizationTariffAssignment: async () => ({ tariffId: 'tariff-1' }),
      getActiveTrialPolicy: async () => null,
      startOrganizationTrial: async () => ({ created: false, endsAt: '' }),
      endActiveTrial: async () => null,
      appendManualAssignmentAudit: async () => {},
    };
    const service = createSaasBillingService({
      repository: {
        listBillingPeriods,
        runManualAssignmentTransaction: async (
          work: (input: SaasBillingManualAssignmentTransactionPort) => Promise<unknown>,
        ) => {
          transactionOpen = true;
          try {
            return await work(transaction);
          } finally {
            transactionOpen = false;
          }
        },
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({}) as never,
      now: () => new Date('2026-07-31T09:00:00.000Z'),
    });

    await service.assignManualTariff({
      organizationId: 'org-1',
      tariffId: 'tariff-1',
      audit: { actorId: 'operator-1', reason: 'serial exact-client transaction' },
    });

    expect(listBillingPeriods).toHaveBeenCalledOnce();
  });

  function assignmentTransaction(
    billingPeriod: 'day' | 'month' | 'year',
    /** What the organization already has — an unassign has to start from an assigned tariff. */
    current: {
      id: string;
      tariffId: string;
      status: 'active';
      currentPeriodStartsAt?: string | null;
      currentPeriodEndsAt?: string | null;
      pendingTariffId?: string | null;
    } | null = null,
    options: { organizationTrialConsumed?: boolean } = {},
  ) {
    const setManualSaasBillingSubscription = vi.fn(async () => {});
    const startOrganizationTrial = vi.fn(async () => ({
      created: true,
      endsAt: '2026-08-14T09:00:00.000Z',
    }));
    const transaction = {
      loadManualAssignmentState: async () => ({
        organization: {
          tariffId: current?.tariffId ?? null,
        },
        organizationTrialConsumed: options.organizationTrialConsumed ?? true,
        activeTrial: null,
        manualSaasBillingSubscription: current
          ? {
              ...current,
              currentPeriodStartsAt: current.currentPeriodStartsAt ?? null,
              currentPeriodEndsAt: current.currentPeriodEndsAt ?? null,
              pendingTariffId: current.pendingTariffId ?? null,
            }
          : null,
      }),
      getActiveTrialPolicy: async () => null,
      startOrganizationTrial,
      requireActiveTariff: async () => ({ billingPeriod }),
      setManualSaasBillingSubscription,
      updateOrganizationTariffAssignment: async () => ({
        tariffId: 'tariff-1',
      }),
      endActiveTrial: async () => null,
      appendManualAssignmentAudit: async () => {},
    };
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        runManualAssignmentTransaction: (work: (t: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({}) as never,
      now: () => new Date('2026-07-31T09:00:00.000Z'),
    });
    return { service, setManualSaasBillingSubscription, startOrganizationTrial };
  }

  // Арбитр: вернуть в `setManualSaasBillingSubscription` вызов без `period` (как было до 7.0) —
  // тест краснеет: период равен `null`, и лестнице не от чего отсчитывать неоплату.
  it('период кончается через один расчётный период ТАРИФА, а не через число из кода', async () => {
    for (const [billingPeriod, endsAt] of [
      ['month', '2026-08-31T09:00:00.000Z'],
      ['year', '2027-07-31T09:00:00.000Z'],
      ['day', '2026-08-01T09:00:00.000Z'],
    ] as const) {
      const { service, setManualSaasBillingSubscription } = assignmentTransaction(billingPeriod);

      await service.assignManualTariff({
        organizationId: 'org-1',
        tariffId: 'tariff-1',
        audit: { actorId: 'operator-1', reason: 'проверка' },
      });

      expect(setManualSaasBillingSubscription, `billingPeriod=${billingPeriod}`).toHaveBeenCalledWith({
        organizationId: 'org-1',
        tariffId: 'tariff-1',
        period: { startsAt: '2026-07-31T09:00:00.000Z', endsAt },
        pendingTariffId: null,
      });
    }
  });

  // Снятие тарифа не должно оставлять якорь от тарифа, которого у организации больше нет.
  it('снятие тарифа закрывает период, а не оставляет его висеть', async () => {
    const { service, setManualSaasBillingSubscription } = assignmentTransaction('month', {
      id: 'subscription-1',
      tariffId: 'tariff-1',
      status: 'active',
    });

    await service.assignManualTariff({
      organizationId: 'org-1',
      tariffId: null,
      audit: { actorId: 'operator-1', reason: 'проверка' },
    });

    expect(setManualSaasBillingSubscription).toHaveBeenCalledWith({
      organizationId: 'org-1',
      tariffId: null,
      period: null,
      pendingTariffId: null,
    });
  });

  it('scheduled downgrade preserves the paid tariff and both period dates', async () => {
    const { service, setManualSaasBillingSubscription } = assignmentTransaction('month', {
      id: 'subscription-1',
      tariffId: 'tariff-big',
      status: 'active',
      currentPeriodStartsAt: '2026-07-01T09:00:00.000Z',
      currentPeriodEndsAt: '2026-08-01T09:00:00.000Z',
    });

    await service.assignManualTariff({
      organizationId: 'org-1',
      tariffId: 'tariff-small',
      applyAtNextPeriod: true,
      audit: { actorId: 'operator-1', reason: 'downgrade' },
    });

    expect(setManualSaasBillingSubscription).toHaveBeenCalledWith({
      organizationId: 'org-1',
      tariffId: 'tariff-big',
      period: {
        startsAt: '2026-07-01T09:00:00.000Z',
        endsAt: '2026-08-01T09:00:00.000Z',
      },
      pendingTariffId: 'tariff-small',
    });
  });
});

describe('§5a #1069 T5 (owner 03.08) — first tariff attachment gets the one-time trial', () => {
  const trialPolicy = {
    durationDays: 14,
    discountWindowDays: 3,
    postTrialBehavior: 'blocked',
    postTrialTariffId: null,
  };

  function firstTariffTransaction(options: {
    organizationTrialConsumed?: boolean;
    trialPolicy?: typeof trialPolicy | null;
  } = {}) {
    const setManualSaasBillingSubscription = vi.fn(async () => {});
    const updateOrganizationTariffAssignment = vi.fn(async () => ({ tariffId: 'tariff-1' }));
    const startOrganizationTrial = vi.fn(async () => ({
      created: true,
      endsAt: '2026-08-14T09:00:00.000Z',
    }));
    const appendManualAssignmentAudit = vi.fn(async () => {});
    const transaction = {
      loadManualAssignmentState: async () => ({
        organization: { tariffId: null },
        organizationTrialConsumed: options.organizationTrialConsumed ?? false,
        activeTrial: null,
        manualSaasBillingSubscription: null,
      }),
      getActiveTrialPolicy: async () => options.trialPolicy ?? trialPolicy,
      startOrganizationTrial,
      requireActiveTariff: async () => ({ billingPeriod: 'month' as const }),
      setManualSaasBillingSubscription,
      updateOrganizationTariffAssignment,
      endActiveTrial: async () => null,
      appendManualAssignmentAudit,
    };
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        runManualAssignmentTransaction: (work: (t: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({}) as never,
      now: () => new Date('2026-07-31T09:00:00.000Z'),
    });
    return {
      service,
      setManualSaasBillingSubscription,
      startOrganizationTrial,
      updateOrganizationTariffAssignment,
    };
  }

  // Breakage: the first tariff assignment opens a paid period immediately instead of starting the
  // configured one-time trial — the owner said «первый раз человек получает триал».
  it('starts the one-time trial on the first tariff assignment and skips the paid period', async () => {
    const { service, setManualSaasBillingSubscription, startOrganizationTrial } =
      firstTariffTransaction();

    await service.assignManualTariff({
      organizationId: 'org-1',
      tariffId: 'tariff-1',
      audit: { actorId: 'operator-1', reason: 'first assign' },
    });

    expect(startOrganizationTrial).toHaveBeenCalledOnce();
    expect(setManualSaasBillingSubscription).not.toHaveBeenCalled();
  });

  // Breakage: a clinic that already consumed its trial gets another one on a later assignment.
  it('opens the paid period when the organization already consumed its one trial', async () => {
    const { service, setManualSaasBillingSubscription, startOrganizationTrial } =
      firstTariffTransaction({ organizationTrialConsumed: true });

    await service.assignManualTariff({
      organizationId: 'org-1',
      tariffId: 'tariff-1',
      audit: { actorId: 'operator-1', reason: 'after trial' },
    });

    expect(startOrganizationTrial).not.toHaveBeenCalled();
    expect(setManualSaasBillingSubscription).toHaveBeenCalledOnce();
  });

  // Breakage: clinic billing first-tariff choice bypasses the trial gate and jumps to payment.
  it('returns trial_started when clinic chooses the first tariff under an active trial policy', async () => {
    const chooseOrganizationFirstTariff = vi.fn(async () => ({
      outcome: 'trial_started' as const,
      endsAt: '2026-08-14T09:00:00.000Z',
    }));
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        chooseOrganizationFirstTariff,
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({}) as never,
      getTariffTransition: async () => ({
        currentTariffId: null,
        targetTariffId: 'tariff-1',
        blocks: [],
        appliesNextPeriod: false,
      }),
    });

    const result = await service.scheduleOwnTariffChange({
      organizationId: 'org-1',
      tariffId: 'tariff-1',
      actorId: 'owner-1',
    });

    expect(result).toMatchObject({
      outcome: 'trial_started',
      endsAt: '2026-08-14T09:00:00.000Z',
    });
    expect(chooseOrganizationFirstTariff).toHaveBeenCalledWith({
      organizationId: 'org-1',
      tariffId: 'tariff-1',
      actorId: 'owner-1',
    });
  });

  it('issues checkout when clinic chooses the first tariff after the one-time trial was consumed', async () => {
    const createIntent = vi.fn(async (input: Parameters<PaymentProviderPort['createIntent']>[0]) => ({
      providerIntentRef: `provider-${input.subjectRef}`,
      checkoutUrl: `https://pay.example/${input.subjectRef}`,
    }));
    const repository = createInMemorySaasBillingRepository({
      tariffs: [
        { id: 'tariff-1', name: 'Базовый', priceMinor: 10_000, currency: 'RUB', billingPeriod: 'month' },
      ],
      trialPolicy: null,
    });
    const service = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      getTariffTransition: async () => ({
        currentTariffId: null,
        targetTariffId: 'tariff-1',
        blocks: [],
        appliesNextPeriod: false,
      }),
    });

    const result = await service.scheduleOwnTariffChange({
      organizationId: 'org-choose-pay',
      tariffId: 'tariff-1',
      actorId: 'owner-1',
    });

    expect(result.outcome).toBe('checkout');
    if (result.outcome !== 'checkout') throw new Error('checkout expected');
    expect(result.invoice.providerCheckoutUrl).toBeTruthy();
  });
});

/**
 * L-11, решение владельца 18.08 дословно: «про клинику, у которой он уже закончился: она выбирает
 * платный тариф — ИДЕТ ОПЛАЧИВАТЬ И ПОТОМ ПОЛУЧАЕТ ДОСТУП».
 *
 * Поломка, которую ловит этот блок: выбор первого тарифа записывает его как ДЕЙСТВУЮЩИЙ тариф
 * организации (`be_organizations.tariff_id`) до всякой оплаты. Отказ дорогой и молчаливый: у
 * организации без записи о пробном периоде `resolveCommercialAccess` берёт ветку `assignment`
 * прямо из этого поля и отдаёт все механики выбранного тарифа бесплатно — денег нет, доступ есть,
 * и снаружи это выглядит как обычная работающая клиника.
 *
 * Oracle — решение владельца, не реализация: действующий тариф появляется только по факту оплаты
 * (`app.apply_paid_saas_billing_tariff`), а до неё доступа нет.
 */
describe('L-11: выбранный тариф не действует, действующим его делает оплата', () => {
  const basicTariff = {
    id: 'tariff-basic',
    name: 'Базовый',
    priceMinor: 250_000,
    currency: 'RUB',
    billingPeriod: 'month',
  };

  /**
   * `trialPolicy: null` — организация, которой пробный период дать неоткуда (политика владельца
   * выключена либо её пробный период уже прожит). Именно эта организация в проде и получала
   * выбранный тариф даром.
   */
  function firstChoiceService(options: { trialPolicy?: { durationDays: number } | null } = {}) {
    const createIntent = vi.fn(async (input: Parameters<PaymentProviderPort['createIntent']>[0]) => ({
      providerIntentRef: `provider-${input.subjectRef}`,
      checkoutUrl: `https://pay.example/${input.subjectRef}`,
    }));
    const repository = createInMemorySaasBillingRepository({
      tariffs: [basicTariff],
      trialPolicy: options.trialPolicy
        ? {
            // Длительность здесь — произвольная величина фикстуры, а не «наш пробный период»:
            // настоящая живёт в настройке владельца `saas_trial_policy` и меняется им в любой момент.
            durationDays: options.trialPolicy.durationDays,
            discountWindowDays: 0,
            postTrialBehavior: 'blocked',
            postTrialTariffId: null,
          }
        : null,
    });
    const service = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => new Date('2026-08-18T00:00:00.000Z'),
      // Как в проде: «есть ли уже действующий тариф» читается из назначения организации, а не из
      // строки подписки, — иначе первый выбор перестал бы быть первым сразу после самого себя.
      getTariffTransition: async (organizationId, tariffId) => ({
        currentTariffId: await repository.getOrganizationAssignedTariffId(organizationId),
        targetTariffId: tariffId,
        blocks: [],
        appliesNextPeriod: false,
      }),
    });
    return { repository, service };
  }

  /** Что видит живая клиника: тариф в силе или нет. Та же функция, что и на снимке прав. */
  async function tariffInForce(
    repository: ReturnType<typeof firstChoiceService>['repository'],
    organizationId: string,
  ) {
    return resolveCommercialAccess({
      organizationTariffId: await repository.getOrganizationAssignedTariffId(organizationId),
      trial: null,
      paidPeriod: null,
      now: Date.parse('2026-08-18T00:00:00.000Z'),
    }).tariffId;
  }

  it('выбор платного тарифа не даёт ничего: счёт выставлен, тариф не действует', async () => {
    const { repository, service } = firstChoiceService({ trialPolicy: null });

    const result = await service.scheduleOwnTariffChange({
      organizationId: 'org-no-trial',
      tariffId: basicTariff.id,
      actorId: 'owner-1',
    });

    expect(result.outcome).toBe('checkout');
    if (result.outcome !== 'checkout') throw new Error('checkout expected');
    // Клиника не брошена: у неё есть счёт ровно на выбранный тариф и ссылка на оплату.
    expect(result.invoice).toMatchObject({
      tariffId: basicTariff.id,
      amountMinor: basicTariff.priceMinor,
    });
    expect(result.invoice.providerCheckoutUrl).toBeTruthy();
    // И при этом — ни одной механики: действующего тарифа нет.
    expect(await tariffInForce(repository, 'org-no-trial')).toBeNull();
  });

  it('оплата счёта делает выбранный тариф действующим', async () => {
    const { repository, service } = firstChoiceService({ trialPolicy: null });
    const chosen = await service.scheduleOwnTariffChange({
      organizationId: 'org-pays',
      tariffId: basicTariff.id,
      actorId: 'owner-1',
    });
    if (chosen.outcome !== 'checkout') throw new Error('checkout expected');
    expect(await tariffInForce(repository, 'org-pays')).toBeNull();

    await service.captureSaasBillingProviderWebhookEvent({
      organizationId: 'org-pays',
      saasBillingInvoiceId: chosen.invoice.id,
      providerId: chosen.invoice.providerId,
      verified: {
        idempotencyKey: 'provider-event-1',
        eventType: 'payment.succeeded',
        amountMinor: basicTariff.priceMinor,
        payload: { currency: basicTariff.currency },
      },
    });

    expect(await tariffInForce(repository, 'org-pays')).toBe(basicTariff.id);
  });

  it('единственный доступ без оплаты — начавшийся пробный период', async () => {
    const { repository, service } = firstChoiceService({ trialPolicy: { durationDays: 3 } });

    const result = await service.scheduleOwnTariffChange({
      organizationId: 'org-trial',
      tariffId: basicTariff.id,
      actorId: 'owner-1',
    });

    expect(result.outcome).toBe('trial_started');
    expect(await tariffInForce(repository, 'org-trial')).toBe(basicTariff.id);
  });
});

// К5 — the arbiter this test names: a background tick that runs twice over the same due
// subscription must not raise a second invoice or charge the payment provider a second time for
// the same period. Held by construction in production by `saas_billing_invoices_period_uidx`; this
// fake repository reproduces exactly that constraint's observable effect (a second attempt at the
// same subscription+period returns `created: false` instead of a new row) so the service-level loop
// is what's under test, not the DB. Break it by having the fake always return `created: true` (i.e.
// simulate the unique index being dropped) and this test goes red.
describe('К5: повторный тик по тому же периоду не выставляет второй счёт', () => {
  it('второй прогон находит ту же due-подписку, но не создаёт второй счёт и не зовёт провайдера снова', async () => {
    const dueSubscription = {
      saasBillingSubscriptionId: 'subscription-1',
      organizationId: 'org-1',
      tariffId: 'tariff-1',
      billingPeriod: 'month' as const,
      currentPeriodEndsAt: '2026-08-01T00:00:00.000Z',
    };
    const raisedForPeriod = new Set<string>();
    const createSaasBillingRenewalInvoiceIfAbsent = vi.fn(async (input) => {
      const key = `${input.saasBillingSubscriptionId}:${input.servicePeriodStartsAt}:${input.servicePeriodEndsAt}`;
      if (raisedForPeriod.has(key)) {
        return {
          invoice: { ...invoice, id: 'invoice-existing', providerIdempotencyKey: input.providerIdempotencyKey },
          created: false,
        };
      }
      raisedForPeriod.add(key);
      return {
        invoice: { ...invoice, id: 'invoice-new', providerIdempotencyKey: input.providerIdempotencyKey },
        created: true,
      };
    });
    const listSaasBillingSubscriptionsDueForRenewal = vi.fn(async () => [dueSubscription]);
    const attachSaasBillingInvoiceProviderIntent = vi.fn(async (input) => ({ ...invoice, ...input }));
    const createIntent = vi.fn(async () => ({
      providerIntentRef: 'provider-intent-renewal-1',
      checkoutUrl: null,
    }));

    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        listSaasBillingSubscriptionsDueForRenewal,
        promoteDueSaasBillingPaidInvoice: async () => false,
        createSaasBillingRenewalInvoiceIfAbsent,
        attachSaasBillingInvoiceProviderIntent,
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => new Date('2026-08-02T00:00:00.000Z'),
    });

    const first = await service.runDueSaasBillingRenewals();
    const second = await service.runDueSaasBillingRenewals();

    expect(first).toMatchObject({ dueCount: 1, created: 1, alreadyInvoiced: 0, failed: 0 });
    expect(second).toMatchObject({ dueCount: 1, created: 0, alreadyInvoiced: 1, failed: 0 });
    expect(createIntent).toHaveBeenCalledTimes(1);
    expect(attachSaasBillingInvoiceProviderIntent).toHaveBeenCalledTimes(1);
  });

  it('rechecks a pending downgrade before the background renewal creates its invoice', async () => {
    const createSaasBillingRenewalInvoiceIfAbsent = vi.fn(async (input) => ({
      invoice: { ...invoice, providerIdempotencyKey: input.providerIdempotencyKey },
      created: true,
    }));
    const createIntent = vi.fn(async () => ({ providerIntentRef: 'provider-intent', checkoutUrl: null }));
    const getTariffTransition = vi.fn(async () => ({
      currentTariffId: 'tariff-current',
      targetTariffId: 'tariff-small',
      appliesNextPeriod: true,
      blocks: [{ mechanic: 'patient_count' as const, reason: 'quota_exceeded' as const }],
    }));
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        listSaasBillingSubscriptionsDueForRenewal: async () => [{
          saasBillingSubscriptionId: 'subscription-1',
          organizationId: 'org-1',
          tariffId: 'tariff-small',
          pendingTariffId: 'tariff-small',
          billingPeriod: 'month' as const,
          currentPeriodEndsAt: '2026-08-01T00:00:00.000Z',
          savedPaymentMethodId: 'pm-1',
          autopayConsentedAt: '2026-07-01T00:00:00.000Z',
          autopayRevokedAt: null,
        }],
        promoteDueSaasBillingPaidInvoice: async () => false,
        createSaasBillingRenewalInvoiceIfAbsent,
        attachSaasBillingInvoiceProviderIntent: async (input: Parameters<SaasBillingRepositoryPort['attachSaasBillingInvoiceProviderIntent']>[0]) => ({ ...invoice, ...input }),
        markSaasBillingInvoiceFailed: async () => null,
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      getTariffTransition,
      now: () => new Date('2026-08-02T00:00:00.000Z'),
    });

    await expect(service.runDueSaasBillingRenewals()).resolves.toMatchObject({
      dueCount: 1,
      created: 0,
      failed: 1,
      errors: [{ error: 'saas_billing_tariff_downgrade_blocked' }],
    });
    expect(getTariffTransition).toHaveBeenCalledWith('org-1', 'tariff-small');
    expect(createSaasBillingRenewalInvoiceIfAbsent).not.toHaveBeenCalled();
    expect(createIntent).not.toHaveBeenCalled();
  });
});

describe('К0: early renewal does not cut the paid period short', () => {
  it('anchors the next invoice at currentPeriodEndsAt instead of the checkout click', async () => {
    const createSaasBillingInvoice = vi.fn(async () => ({ invoice, created: true }));
    const attachSaasBillingInvoiceProviderIntent = vi.fn(async () => invoice);
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription-1',
          tariffId: 'tariff-1',
          billingPeriod: 'month' as const,
          savedPaymentMethodId: null,
          currentPeriodEndsAt: '2026-09-01T00:00:00.000Z',
        }),
        createSaasBillingInvoice,
        attachSaasBillingInvoiceProviderIntent,
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent: async () => ({ providerIntentRef: 'intent' }) }) as never,
      now: () => new Date('2026-08-02T00:00:00.000Z'),
    });

    await service.createOwnTariffRenewalInvoice('org-1');

    expect(createSaasBillingInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        servicePeriodStartsAt: '2026-09-01T00:00:00.000Z',
        servicePeriodEndsAt: '2026-10-01T00:00:00.000Z',
      }),
    );
  });
});

describe('К4/#1057: повтор периода использует старый пустой черновик', () => {
  it('после смены legacy bucket возвращает тот же счёт и отправляет в provider его сохранённый ключ', async () => {
    let clock = new Date('2026-07-01T00:00:00.000Z');
    const repository = createInMemorySaasBillingRepository();
    const createSaasBillingInvoice = repository.createSaasBillingInvoice.bind(repository);
    let legacyProviderIdempotencyKey: string | null = null;
    vi.spyOn(repository, 'createSaasBillingInvoice').mockImplementation((input) =>
      createSaasBillingInvoice({
        ...input,
        providerIdempotencyKey: legacyProviderIdempotencyKey ?? input.providerIdempotencyKey,
      }),
    );
    const createIntent = vi.fn(async () => {
      if (createIntent.mock.calls.length === 2) {
        throw new Error('provider_temporarily_unavailable');
      }
      return {
        providerIntentRef: `provider-period-${createIntent.mock.calls.length}`,
        checkoutUrl: `https://pay.example/period-${createIntent.mock.calls.length}`,
      };
    });
    const service = createSaasBillingService({
      repository,
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'mock',
          providers: [{ id: 'mock', label: 'Mock', enabled: true, webhookSecret: 'unused', shopId: 's', apiKey: 'k' }],
        }),
      },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => clock,
    });
    await service.assignManualTariff({
      organizationId: 'org-period-retry',
      tariffId: 'tariff-period-retry',
      audit: { actorId: 'platform-admin', reason: 'test seed' },
    });

    const firstPeriod = await service.createOwnTariffRenewalInvoice('org-period-retry');
    await service.captureSaasBillingProviderWebhookEvent({
      organizationId: 'org-period-retry',
      saasBillingInvoiceId: firstPeriod.id,
      providerId: 'mock',
      verified: {
        idempotencyKey: 'event-period-retry-first',
        eventType: 'payment.succeeded',
        amountMinor: 0,
        payload: { currency: 'RUB' },
      },
    });

    clock = new Date('2026-07-15T00:00:00.000Z');
    legacyProviderIdempotencyKey = 'saas_tariff_renewal:legacy-clock-bucket';
    await expect(service.createOwnTariffRenewalInvoice('org-period-retry')).rejects.toThrow(
      'provider_temporarily_unavailable',
    );
    const legacyDraft = (await repository.getOrganizationBillingOverview('org-period-retry')).invoices.find(
      (row) => row.status === 'draft',
    );
    if (!legacyDraft) throw new Error('test_seed_legacy_tariff_period_draft_missing');

    clock = new Date('2026-07-16T00:00:00.000Z');
    legacyProviderIdempotencyKey = null;
    const retried = await service.createOwnTariffRenewalInvoice('org-period-retry');

    expect(retried).toMatchObject({
      id: legacyDraft.id,
      organizationId: legacyDraft.organizationId,
      saasBillingSubscriptionId: legacyDraft.saasBillingSubscriptionId,
      amountMinor: legacyDraft.amountMinor,
      currency: legacyDraft.currency,
      providerCheckoutUrl: 'https://pay.example/period-3',
      providerIdempotencyKey: 'saas_tariff_renewal:legacy-clock-bucket',
    });
    expect(createIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({ idempotencyKey: legacyDraft.providerIdempotencyKey }),
    );
    expect(createIntent).toHaveBeenCalledTimes(3);
    expect((await repository.getOrganizationBillingOverview('org-period-retry')).invoices).toHaveLength(2);
  });
});

function paidPeriodScenario() {
  let clock = new Date('2026-07-01T00:00:00.000Z');
  const repository = createInMemorySaasBillingRepository();
  const createIntent = vi.fn(async () => ({
    providerIntentRef: `intent-${createIntent.mock.calls.length}`,
    checkoutUrl: `https://billing.example.test/${createIntent.mock.calls.length}`,
  }));
  const service = createSaasBillingService({
    repository,
    settings: {
      getSaasBillingPaymentProviderValue: async () => ({
        defaultProviderId: 'mock',
        providers: [
          {
            id: 'mock',
            label: 'Mock',
            enabled: true,
            webhookSecret: 'unused',
            shopId: 'shop',
            apiKey: 'key',
          },
        ],
      }),
    },
    resolvePaymentProvider: () => ({ createIntent }) as never,
    now: () => clock,
  });
  return {
    service,
    setNow(iso: string) {
      clock = new Date(iso);
    },
  };
}

async function capturePaidInvoice(
  service: ReturnType<typeof createSaasBillingService>,
  input: { invoiceId: string; eventId: string; savedPaymentMethodId?: string },
) {
  return service.captureSaasBillingProviderWebhookEvent({
    organizationId: 'org-paid-period',
    saasBillingInvoiceId: input.invoiceId,
    providerId: 'mock',
    verified: {
      idempotencyKey: input.eventId,
      eventType: 'payment.succeeded',
      amountMinor: 0,
      payload: { currency: 'RUB' },
      ...(input.savedPaymentMethodId ? { savedPaymentMethodId: input.savedPaymentMethodId } : {}),
    },
  });
}

async function seedCurrentPaidPeriod(
  service: ReturnType<typeof createSaasBillingService>,
): Promise<SaasBillingInvoice> {
  await service.assignManualTariff({
    organizationId: 'org-paid-period',
    tariffId: 'tariff-current',
    audit: { actorId: 'platform-admin', reason: 'test seed' },
  });
  const invoice = await service.createOwnTariffRenewalInvoice('org-paid-period');
  await capturePaidInvoice(service, { invoiceId: invoice.id, eventId: 'event-first-period' });
  return invoice;
}

describe('Р-10/Р-14: future paid invoice waits for the paid boundary', () => {
  it('records an early renewal as paid without replacing the current period dates before its start', async () => {
    const { service, setNow } = paidPeriodScenario();
    await seedCurrentPaidPeriod(service);
    const before = (
      await service.getOrganizationBillingOverview('org-paid-period')
    ).subscriptions.find((row) => row.source === 'paid_subscription');
    expect(before).toMatchObject({
      currentPeriodStartsAt: '2026-07-01T00:00:00.000Z',
      currentPeriodEndsAt: '2026-08-01T00:00:00.000Z',
    });

    setNow('2026-07-15T00:00:00.000Z');
    const futureInvoice = await service.createOwnTariffRenewalInvoice('org-paid-period');
    expect(futureInvoice).toMatchObject({
      servicePeriodStartsAt: '2026-08-01T00:00:00.000Z',
      servicePeriodEndsAt: '2026-09-01T00:00:00.000Z',
    });
    await capturePaidInvoice(service, {
      invoiceId: futureInvoice.id,
      eventId: 'event-early-renewal',
    });

    const after = await service.getOrganizationBillingOverview('org-paid-period');
    expect(after.invoices.find((row) => row.id === futureInvoice.id)?.status).toBe('paid');
    expect(after.subscriptions.find((row) => row.source === 'paid_subscription')).toMatchObject({
      currentPeriodStartsAt: before?.currentPeriodStartsAt,
      currentPeriodEndsAt: before?.currentPeriodEndsAt,
    });
  });

  it('an early renewal after a scheduled downgrade buys the pending target, not the current tariff', async () => {
    const { service, setNow } = paidPeriodScenario();
    await seedCurrentPaidPeriod(service);
    setNow('2026-07-15T00:00:00.000Z');
    await service.assignManualTariff({
      organizationId: 'org-paid-period',
      tariffId: 'tariff-next',
      applyAtNextPeriod: true,
      audit: { actorId: 'platform-admin', reason: 'scheduled downgrade' },
    });

    const futureInvoice = await service.createOwnTariffRenewalInvoice('org-paid-period');

    expect(futureInvoice.tariffId).toBe('tariff-next');
  });

  it('promotes one already-paid future invoice exactly once at its boundary', async () => {
    const { service, setNow } = paidPeriodScenario();
    await seedCurrentPaidPeriod(service);
    setNow('2026-07-15T00:00:00.000Z');
    const futureInvoice = await service.createOwnTariffRenewalInvoice('org-paid-period');
    await capturePaidInvoice(service, { invoiceId: futureInvoice.id, eventId: 'event-future-paid' });
    setNow('2026-08-01T00:00:00.000Z');

    await service.runDueSaasBillingRenewals();
    const first = await service.getOrganizationBillingOverview('org-paid-period');
    await service.runDueSaasBillingRenewals();
    const second = await service.getOrganizationBillingOverview('org-paid-period');

    expect(first.subscriptions.find((row) => row.source === 'paid_subscription')).toMatchObject({
      currentPeriodStartsAt: '2026-08-01T00:00:00.000Z',
      currentPeriodEndsAt: '2026-09-01T00:00:00.000Z',
    });
    expect(second.subscriptions).toEqual(
      first.subscriptions.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...stable }) => ({
        ...stable,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })),
    );
  });
});

describe('§5.1 paid additional-seat state machine', () => {
  /**
   * Решение владельца 18.08: «Доп счёт только один раз, и только до конца основного оплаченного
   * периода». Счёт за место продаётся В уже оплаченный период, а не открывает новый полный период
   * от сегодня поверх него. Пробивается: окно счёта снова считается как now + один период тарифа,
   * то есть перекрывает уже оплаченные дни и берёт за них деньги второй раз.
   */
  it('sells the seat into the already-paid period, not into a fresh full period', async () => {
    const createSeatOverageInvoiceIfNeeded = vi.fn(async () => ({
      outcome: 'seat_overage_unavailable' as const,
    }));
    const service = createSaasBillingService({
      repository: {
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription-1',
          tariffId: 'tariff-1',
          billingPeriod: 'month' as const,
          currentPeriodStartsAt: '2026-08-01T00:00:00.000Z',
          currentPeriodEndsAt: '2026-08-31T00:00:00.000Z',
          savedPaymentMethodId: null,
          additionalSeatPriceMinor: 150_000,
          currency: 'RUB',
        }),
        createSeatOverageInvoiceIfNeeded,
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent: async () => ({}) }) as never,
      now: () => new Date('2026-08-16T09:41:00.000Z'),
    });

    await service.purchaseSeatOverage({
      organizationId: 'org-1',
      quote: seatQuote({ organizationId: 'org-1', purchaseKey: 'req-mid-period', priceMinor: 75_000 }),
    });

    expect(createSeatOverageInvoiceIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({
        servicePeriodStartsAt: '2026-08-16T09:41:00.000Z',
        servicePeriodEndsAt: '2026-08-31T00:00:00.000Z',
      }),
    );
  });

  /** Нет оплаченного периода — место продавать не во что: клиника сначала платит за тариф. */
  it('refuses a seat when no paid period is running', async () => {
    const createSeatOverageInvoiceIfNeeded = vi.fn();
    const service = createSaasBillingService({
      repository: {
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription-1',
          tariffId: 'tariff-1',
          billingPeriod: 'month' as const,
          currentPeriodStartsAt: null,
          currentPeriodEndsAt: null,
          savedPaymentMethodId: null,
          additionalSeatPriceMinor: 150_000,
          currency: 'RUB',
        }),
        createSeatOverageInvoiceIfNeeded,
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent: async () => ({}) }) as never,
      now: () => new Date('2026-08-16T09:41:00.000Z'),
    });

    await expect(
      service.purchaseSeatOverage({
        organizationId: 'org-1',
        quote: seatQuote({ organizationId: 'org-1', purchaseKey: 'req-no-period', priceMinor: 150_000 }),
      }),
    ).resolves.toEqual({ outcome: 'seat_overage_unavailable' });
    expect(createSeatOverageInvoiceIfNeeded).not.toHaveBeenCalled();
  });

  it('retries an existing draft with the same provider key instead of returning an unusable draft', async () => {
    const draft: SaasBillingInvoice = {
      ...invoice,
      id: 'seat-draft',
      invoiceKind: 'seat_overage',
      additionalSeatQuantity: 1,
      amountMinor: 15_000,
      providerIdempotencyKey: 'saas_seat_overage:org-1:stable-key',
      status: 'draft',
    };
    const createIntent = vi.fn(async () => ({
      providerIntentRef: 'provider-seat-1',
      checkoutUrl: 'https://pay.example/seat-1',
    }));
    const attachSaasBillingInvoiceProviderIntent = vi.fn(async () => ({
      ...draft,
      providerInvoiceRef: 'provider-seat-1',
      providerCheckoutUrl: 'https://pay.example/seat-1',
      status: 'pending' as const,
    }));
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription-1',
          tariffId: 'tariff-1',
          billingPeriod: 'month' as const,
          currentPeriodStartsAt: '2026-08-01T00:00:00.000Z',
          currentPeriodEndsAt: '2026-09-01T00:00:00.000Z',
          savedPaymentMethodId: null,
          additionalSeatPriceMinor: 15_000,
          currency: 'RUB',
        }),
        createSeatOverageInvoiceIfNeeded: async () => ({
          outcome: 'invoice' as const,
          invoice: draft,
          created: false,
        }),
        attachSaasBillingInvoiceProviderIntent,
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => new Date('2026-08-02T00:00:00.000Z'),
    });

    const result = await service.purchaseSeatOverage({
      organizationId: 'org-1',
      quote: seatQuote({ organizationId: 'org-1', purchaseKey: 'stable-key', priceMinor: 15_000 }),
    });

    expect(result).toMatchObject({ outcome: 'checkout', invoice: { id: 'seat-draft' } });
    expect(createIntent).toHaveBeenCalledOnce();
    expect(createIntent).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'saas_seat_overage:org-1:stable-key',
      purpose: 'saas_billing_seat_overage',
      returnUrl: expect.stringContaining('/app/settings?tab=team&seatPayment=seat-draft'),
    }));
  });

  it('adds allowance once while preserving tariff state, even under a different-event replay', async () => {
    let clock = new Date('2026-07-01T00:00:00.000Z');
    const repository = createInMemorySaasBillingRepository({
      tariffs: [
        {
          id: 'tariff-seat',
          name: 'Клиника',
          priceMinor: 500_000,
          currency: 'RUB',
          billingPeriod: 'month',
          additionalSeatPriceMinor: 150_000,
        },
      ],
      trialPolicy: null,
    });
    const service = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({
        createIntent: async () => ({
          providerIntentRef: 'provider-seat',
          checkoutUrl: 'https://pay.example/seat',
        }),
      }) as never,
      now: () => clock,
    });
    await service.assignManualTariff({
      organizationId: 'org-seat',
      tariffId: 'tariff-seat',
      audit: { actorId: 'admin', reason: 'seed' },
    });
    // Оплаченный период 01.07 → 01.08 (31 день).
    const periodInvoice = await service.createOwnTariffRenewalInvoice('org-seat');
    await service.captureSaasBillingProviderWebhookEvent({
      organizationId: 'org-seat',
      saasBillingInvoiceId: periodInvoice.id,
      providerId: 'mock',
      verified: {
        idempotencyKey: 'event-seed-period',
        eventType: 'payment.succeeded',
        amountMinor: 500_000,
        payload: { currency: 'RUB' },
      },
    });

    // Посреди периода: с 16.07 до 01.08 остаётся 16 дней из 31 → 150 000 × 16 / 31 = 77 419,35…,
    // округляется вверх до 77 420. Полная цена места — 150 000: за уже оплаченные дни не платят.
    clock = new Date('2026-07-16T12:00:00.000Z');
    const purchase = await service.purchaseSeatOverage({
      organizationId: 'org-seat',
      quote: seatQuote({ organizationId: 'org-seat', purchaseKey: 'request-1', priceMinor: 77_420 }),
    });
    if (purchase.outcome !== 'checkout') throw new Error('expected seat checkout');
    expect(purchase.invoice).toMatchObject({
      amountMinor: 77_420,
      currency: 'RUB',
      additionalSeatQuantity: 1,
      // «Доп счёт … только до конца основного оплаченного периода».
      servicePeriodEndsAt: '2026-08-01T00:00:00.000Z',
    });
    const before = (await service.getOrganizationBillingOverview('org-seat')).subscriptions.find(
      (row) => row.source === 'paid_subscription',
    );

    for (const eventId of ['seat-event-1', 'seat-event-2']) {
      await service.captureSaasBillingProviderWebhookEvent({
        organizationId: 'org-seat',
        saasBillingInvoiceId: purchase.invoice.id,
        providerId: 'mock',
        verified: {
          idempotencyKey: eventId,
          eventType: 'payment.succeeded',
          amountMinor: 77_420,
          payload: { currency: 'RUB' },
        },
      });
    }

    const after = (await service.getOrganizationBillingOverview('org-seat')).subscriptions.find(
      (row) => row.source === 'paid_subscription',
    );
    expect(after).toMatchObject({
      paidAdditionalSeats: 1,
      tariffId: before?.tariffId,
      pendingTariffId: before?.pendingTariffId,
      status: before?.status,
      lifecycleState: before?.lifecycleState,
      currentPeriodStartsAt: before?.currentPeriodStartsAt,
      currentPeriodEndsAt: before?.currentPeriodEndsAt,
    });
  });

  /**
   * Котировка живёт минуты, но за эти минуты тариф мог измениться. Тогда счёт не выставляется
   * вовсе: человеку возвращают новую цену, и решает снова он. Пробивается: цену на счёт берут из
   * котировки, а не пересчитывают, — и клиника платит по устаревшему обещанию.
   */
  it('writes no invoice and returns the fresh price when the quote no longer matches', async () => {
    let clock = new Date('2026-07-01T00:00:00.000Z');
    const repository = createInMemorySaasBillingRepository({
      tariffs: [
        {
          id: 'tariff-stale',
          name: 'Клиника',
          priceMinor: 500_000,
          currency: 'RUB',
          billingPeriod: 'month',
          additionalSeatPriceMinor: 150_000,
        },
      ],
      trialPolicy: null,
    });
    const service = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () =>
        ({
          createIntent: async () => ({
            providerIntentRef: 'provider-seat',
            checkoutUrl: 'https://pay.example/seat',
          }),
        }) as never,
      now: () => clock,
    });
    await service.assignManualTariff({
      organizationId: 'org-stale',
      tariffId: 'tariff-stale',
      audit: { actorId: 'admin', reason: 'seed' },
    });
    const periodInvoice = await service.createOwnTariffRenewalInvoice('org-stale');
    await service.captureSaasBillingProviderWebhookEvent({
      organizationId: 'org-stale',
      saasBillingInvoiceId: periodInvoice.id,
      providerId: 'mock',
      verified: {
        idempotencyKey: 'event-seed-period',
        eventType: 'payment.succeeded',
        amountMinor: 500_000,
        payload: { currency: 'RUB' },
      },
    });

    clock = new Date('2026-07-16T12:00:00.000Z');
    const invoicesBefore = (await service.getOrganizationBillingOverview('org-stale')).invoices
      .length;
    const stale = await service.purchaseSeatOverage({
      organizationId: 'org-stale',
      quote: seatQuote({
        organizationId: 'org-stale',
        purchaseKey: 'stale-quote',
        priceMinor: 150_000,
      }),
    });

    expect(stale).toEqual({ outcome: 'price_changed', priceMinor: 77_420, currency: 'RUB' });
    expect((await service.getOrganizationBillingOverview('org-stale')).invoices).toHaveLength(
      invoicesBefore,
    );

    // Та же покупка со свежей котировкой пишет счёт ровно на пересчитанную сервером цену.
    const fresh = await service.purchaseSeatOverage({
      organizationId: 'org-stale',
      quote: seatQuote({
        organizationId: 'org-stale',
        purchaseKey: 'fresh-quote',
        priceMinor: 77_420,
      }),
    });
    if (fresh.outcome !== 'checkout') throw new Error('expected seat checkout');
    expect(fresh.invoice.amountMinor).toBe(77_420);

    // Повтор той же котировки — тот же счёт, а не второй: ключ идемпотентности выводится из неё.
    const replay = await service.purchaseSeatOverage({
      organizationId: 'org-stale',
      quote: seatQuote({
        organizationId: 'org-stale',
        purchaseKey: 'fresh-quote',
        priceMinor: 77_420,
      }),
    });
    if (replay.outcome !== 'checkout') throw new Error('expected seat checkout');
    expect(replay.invoice.id).toBe(fresh.invoice.id);
    expect(
      (await service.getOrganizationBillingOverview('org-stale')).invoices.filter(
        (row) => row.invoiceKind === 'seat_overage',
      ),
    ).toHaveLength(1);
  });

  it('rejects a partial seat refund before resolving or calling the provider', async () => {
    const resolvePaymentProvider = vi.fn();
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        reserveSaasBillingRefund: async () => ({
          outcome: 'seat_overage_partial_refund_forbidden' as const,
        }),
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider,
    });

    await expect(service.refundSaasBillingInvoice({
      saasBillingInvoiceId: 'seat-invoice',
      amountMinor: 1,
      requestKey: 'refund-key',
      actorId: 'admin',
      reason: 'partial',
    })).resolves.toEqual({ outcome: 'seat_overage_partial_refund_forbidden' });
    expect(resolvePaymentProvider).not.toHaveBeenCalled();
  });
});

function assignmentTransactionForAcceptance(
  billingPeriod: 'day' | 'month' | 'year',
  current: {
    id: string;
    tariffId: string;
    status: 'active';
    currentPeriodStartsAt: string | null;
    currentPeriodEndsAt: string | null;
    pendingTariffId: string | null;
  },
) {
  const setManualSaasBillingSubscription = vi.fn(async () => {});
  const transaction = {
    loadManualAssignmentState: async () => ({
      organization: { tariffId: current.tariffId },
      organizationTrialConsumed: true,
      activeTrial: null,
      manualSaasBillingSubscription: current,
    }),
    requireActiveTariff: async () => ({ billingPeriod }),
    setManualSaasBillingSubscription,
    updateOrganizationTariffAssignment: async (input: { tariffId: string | null }) => ({
      tariffId: input.tariffId,
    }),
    endActiveTrial: async () => null,
    appendManualAssignmentAudit: async () => {},
  };
  const service = createSaasBillingService({
    repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
      runManualAssignmentTransaction: (work: (input: typeof transaction) => Promise<unknown>) =>
        work(transaction),
    } as unknown as SaasBillingRepositoryPort,
    settings: { getSaasBillingPaymentProviderValue: async () => null },
    resolvePaymentProvider: () => ({}) as never,
    now: () => new Date('2026-07-15T00:00:00.000Z'),
  });
  return { service, setManualSaasBillingSubscription };
}

describe('Р-14: manual platform assignment preserves the paid boundary', () => {
  it('applies an upgrade snapshot now but keeps the existing paid start/end dates', async () => {
    const existingPeriod = {
      startsAt: '2026-07-01T09:00:00.000Z',
      endsAt: '2026-08-01T09:00:00.000Z',
    };
    const { service, setManualSaasBillingSubscription } = assignmentTransactionForAcceptance(
      'month',
      {
        id: 'subscription-1',
        tariffId: 'tariff-basic',
        status: 'active',
        currentPeriodStartsAt: existingPeriod.startsAt,
        currentPeriodEndsAt: existingPeriod.endsAt,
        pendingTariffId: null,
      },
    );

    await service.assignManualTariff({
      organizationId: 'org-1',
      tariffId: 'tariff-upgrade',
      audit: { actorId: 'platform-admin', reason: 'manual upgrade' },
    });

    expect(setManualSaasBillingSubscription).toHaveBeenCalledWith({
      organizationId: 'org-1',
      tariffId: 'tariff-upgrade',
      period: existingPeriod,
      pendingTariffId: null,
    });
  });

  it('assigning the current tariff cancels an already scheduled downgrade', async () => {
    const existingPeriod = {
      startsAt: '2026-07-01T09:00:00.000Z',
      endsAt: '2026-08-01T09:00:00.000Z',
    };
    const { service, setManualSaasBillingSubscription } = assignmentTransactionForAcceptance(
      'month',
      {
        id: 'subscription-1',
        tariffId: 'tariff-current',
        status: 'active',
        currentPeriodStartsAt: existingPeriod.startsAt,
        currentPeriodEndsAt: existingPeriod.endsAt,
        pendingTariffId: 'tariff-next',
      },
    );

    await service.assignManualTariff({
      organizationId: 'org-1',
      tariffId: 'tariff-current',
      audit: { actorId: 'platform-admin', reason: 'cancel downgrade' },
    });

    expect(setManualSaasBillingSubscription).toHaveBeenCalledWith({
      organizationId: 'org-1',
      tariffId: 'tariff-current',
      period: existingPeriod,
      pendingTariffId: null,
    });
  });
});

describe('Р-14: immediate paid upgrade', () => {
  it('keeps the old snapshot until capture, then applies the new one once without moving the paid boundary', async () => {
    const repository = createInMemorySaasBillingRepository({
      tariffs: [
        { id: 'basic', name: 'Базовый', priceMinor: 10_000, currency: 'RUB', billingPeriod: 'month' },
        { id: 'pro', name: 'Про', priceMinor: 20_000, currency: 'RUB', billingPeriod: 'month' },
      ],
    });
    const seed = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({
        createIntent: async () => ({
          providerIntentRef: 'provider-initial',
          checkoutUrl: 'https://pay.example/initial',
        }),
      }) as never,
      now: () => new Date('2026-08-01T00:00:00.000Z'),
    });
    await seed.assignManualTariff({
      organizationId: 'org-upgrade',
      tariffId: 'basic',
      audit: { actorId: 'admin', reason: 'seed paid period' },
    });
    const initial = await seed.createOwnTariffRenewalInvoice('org-upgrade');
    await seed.captureSaasBillingProviderWebhookEvent({
      organizationId: 'org-upgrade',
      saasBillingInvoiceId: initial.id,
      providerId: 'yookassa',
      verified: {
        idempotencyKey: 'initial-capture',
        eventType: 'payment.succeeded',
        amountMinor: 10_000,
        payload: { currency: 'RUB' },
      },
    });

    const createIntent = vi.fn(async (input: Parameters<PaymentProviderPort['createIntent']>[0]) => ({
      providerIntentRef: `provider-${input.amountMinor}`,
      checkoutUrl: `https://pay.example/${input.amountMinor}`,
    }));
    const service = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => new Date('2026-08-16T12:00:00.000Z'),
      getTariffTransition: async () => ({
        currentTariffId: 'basic',
        targetTariffId: 'pro',
        blocks: [],
        appliesNextPeriod: false,
      }),
    });

    const [first, second] = await Promise.all([
      service.scheduleOwnTariffChange({
        organizationId: 'org-upgrade',
        tariffId: 'pro',
        actorId: 'owner',
      }),
      service.scheduleOwnTariffChange({
        organizationId: 'org-upgrade',
        tariffId: 'pro',
        actorId: 'owner',
      }),
    ]);
    if (first.outcome !== 'checkout' || second.outcome !== 'checkout') throw new Error('checkout expected');
    expect(first.invoice.amountMinor).toBe(5_000);
    expect(second.invoice.id).toBe(first.invoice.id);
    expect(createIntent).toHaveBeenCalledOnce();

    const mismatch = await service.resolveSaasBillingInvoiceForWebhook({
      providerId: 'yookassa',
      verified: {
        intentRef: 'provider-5000',
        amountMinor: 5_001,
        payload: { currency: 'RUB' },
      },
    });
    expect(mismatch).toEqual({ outcome: 'mismatch', field: 'amount' });
    expect(
      (await service.getOrganizationBillingOverview('org-upgrade')).subscriptions.find(
        (row) => row.source === 'paid_subscription',
      ),
    ).toMatchObject({
      tariffId: 'basic',
      tariffSnapshot: { id: 'basic' },
    });

    const captured = await service.captureSaasBillingProviderWebhookEvent({
      organizationId: 'org-upgrade',
      saasBillingInvoiceId: first.invoice.id,
      providerId: 'yookassa',
      verified: {
        idempotencyKey: 'upgrade-capture-1',
        eventType: 'payment.succeeded',
        amountMinor: 5_000,
        payload: { currency: 'RUB' },
      },
    });
    const replayed = await service.captureSaasBillingProviderWebhookEvent({
      organizationId: 'org-upgrade',
      saasBillingInvoiceId: first.invoice.id,
      providerId: 'yookassa',
      verified: {
        idempotencyKey: 'upgrade-capture-replay',
        eventType: 'payment.succeeded',
        amountMinor: 5_000,
        payload: { currency: 'RUB' },
      },
    });
    expect(captured.captured).toBe(true);
    expect(replayed.captured).toBe(false);
    expect(
      (await service.getOrganizationBillingOverview('org-upgrade')).subscriptions.find(
        (row) => row.source === 'paid_subscription',
      ),
    ).toMatchObject({
      tariffId: 'pro',
      tariffSnapshot: { id: 'pro' },
      currentPeriodStartsAt: '2026-08-01T00:00:00.000Z',
      currentPeriodEndsAt: '2026-09-01T00:00:00.000Z',
    });

    await service.createOwnTariffRenewalInvoice('org-upgrade');
    expect(createIntent.mock.calls[1]?.[0]).toMatchObject({ amountMinor: 20_000, currency: 'RUB' });
  });

  it('classifies the change against the paid snapshot after the live current-tariff price changes', async () => {
    let clock = new Date('2026-08-01T00:00:00.000Z');
    const tariff = (
      id: string,
      priceMinor: number,
    ): Tariff & { priceMinor: number; currency: string } => ({
      id,
      name: id,
      description: '',
      priceMinor,
      currency: 'RUB',
      billingPeriod: 'month',
      mechanics: {},
      quotas: {},
      systemAccessPolicy: null,
      mechanicAccessPolicies: {},
      downgradePolicies: {},
      mailingTemplates: [],
      includedSeats: 1,
      additionalSeatPriceMinor: null,
      discountedPriceMinor: null,
      isActive: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    const currentTariff = tariff('basic', 10_000);
    const targetTariff = tariff('pro', 15_000);
    const entitlements: OrgEntitlementsPort = {
      resolveCabinetAccess: async () => ({
        state: 'full_access',
        policySource: 'system',
        warning: null,
      }),
      resolveMechanicAccess: async (_organizationId, mechanic) => ({
        mechanic,
        state: 'full_access',
        policySource: 'system',
        warning: null,
      }),
      getSnapshot: async () => ({
        tariff: {
          id: currentTariff.id,
          name: currentTariff.name,
          mechanics: currentTariff.mechanics,
          quotas: currentTariff.quotas,
          systemAccessPolicy: currentTariff.systemAccessPolicy,
          mechanicAccessPolicies: currentTariff.mechanicAccessPolicies,
          includedSeats: currentTariff.includedSeats,
        },
        overrides: [],
        access: { lifecycle: 'active', tariffId: currentTariff.id, source: 'assignment' },
      }),
      getTariffForOrg: async () => currentTariff,
      getActiveTariffById: async (tariffId) =>
        tariffId === currentTariff.id
          ? currentTariff
          : tariffId === targetTariff.id
            ? targetTariff
            : null,
      listOverrides: async () => [],
      getEffectiveCommercialAccess: async () => ({
        lifecycle: 'active',
        tariffId: currentTariff.id,
        source: 'assignment',
      }),
      getEnforcedQuotaUsage: async () => ({}),
      getOwnQuotaUsage: async () => ({}),
      prepareLifecycleNotificationContext: async () => ({
        registeredAt: null,
        trialStartedAt: null,
        trialEndsAt: null,
        discountEndsAt: null,
      }),
    };
    const repository = createInMemorySaasBillingRepository({
      tariffs: [currentTariff, targetTariff],
    });
    const service = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({
        createIntent: async (input: Parameters<PaymentProviderPort['createIntent']>[0]) => ({
          providerIntentRef: `provider-${input.subjectRef}`,
          checkoutUrl: `https://pay.example/${input.subjectRef}`,
        }),
      }) as never,
      now: () => clock,
      getTariffTransition: (organizationId, tariffId) =>
        resolveOwnTariffTransition(entitlements, organizationId, tariffId),
    });

    await service.assignManualTariff({
      organizationId: 'org-live-price-change',
      tariffId: currentTariff.id,
      audit: { actorId: 'admin', reason: 'seed paid period' },
    });
    const current = await service.createOwnTariffRenewalInvoice('org-live-price-change');
    await service.captureSaasBillingProviderWebhookEvent({
      organizationId: 'org-live-price-change',
      saasBillingInvoiceId: current.id,
      providerId: 'yookassa',
      verified: {
        idempotencyKey: 'capture-current-before-live-price-change',
        eventType: 'payment.succeeded',
        amountMinor: current.amountMinor,
        payload: { currency: current.currency },
      },
    });

    currentTariff.priceMinor = 20_000;
    clock = new Date('2026-08-16T12:00:00.000Z');
    const result = await service.scheduleOwnTariffChange({
      organizationId: 'org-live-price-change',
      tariffId: targetTariff.id,
      actorId: 'owner',
    });

    expect(result).toMatchObject({ outcome: 'checkout', invoice: { amountMinor: 2_500 } });
  });

  it('charges the next full period at the new price when an old-tariff renewal was paid early', async () => {
    let clock = new Date('2026-08-01T00:00:00.000Z');
    const createIntent = vi.fn(async (input: Parameters<PaymentProviderPort['createIntent']>[0]) => ({
      providerIntentRef: `provider-${input.subjectRef}`,
      checkoutUrl: `https://pay.example/${input.subjectRef}`,
    }));
    const repository = createInMemorySaasBillingRepository({
      tariffs: [
        { id: 'basic', name: 'Базовый', priceMinor: 10_000, currency: 'RUB', billingPeriod: 'month' },
        { id: 'pro', name: 'Про', priceMinor: 20_000, currency: 'RUB', billingPeriod: 'month' },
      ],
    });
    const service = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => clock,
      getTariffTransition: async () => ({
        currentTariffId: 'basic',
        targetTariffId: 'pro',
        blocks: [],
        appliesNextPeriod: false,
      }),
    });
    const capture = (invoice: SaasBillingInvoice, eventId: string) =>
      service.captureSaasBillingProviderWebhookEvent({
        organizationId: 'org-early-renewal-upgrade',
        saasBillingInvoiceId: invoice.id,
        providerId: 'yookassa',
        verified: {
          idempotencyKey: eventId,
          eventType: 'payment.succeeded',
          amountMinor: invoice.amountMinor,
          payload: { currency: invoice.currency },
        },
      });

    await service.assignManualTariff({
      organizationId: 'org-early-renewal-upgrade',
      tariffId: 'basic',
      audit: { actorId: 'admin', reason: 'seed paid period' },
    });
    const current = await service.createOwnTariffRenewalInvoice('org-early-renewal-upgrade');
    await capture(current, 'capture-current');

    clock = new Date('2026-08-16T12:00:00.000Z');
    const earlyRenewal = await service.createOwnTariffRenewalInvoice('org-early-renewal-upgrade');
    await capture(earlyRenewal, 'capture-early-renewal');
    const upgrade = await service.scheduleOwnTariffChange({
      organizationId: 'org-early-renewal-upgrade',
      tariffId: 'pro',
      actorId: 'owner',
    });
    if (upgrade.outcome !== 'checkout') throw new Error('checkout expected');
    expect(upgrade.invoice).toMatchObject({
      amountMinor: 15_000,
      tariffSnapshot: { upgrade_future_period_adjustment_minor: 10_000 },
    });
    await capture(upgrade.invoice, 'capture-upgrade');

    clock = new Date('2026-09-01T00:00:00.000Z');
    await service.runDueSaasBillingRenewals();
    const overview = await service.getOrganizationBillingOverview('org-early-renewal-upgrade');
    expect(overview.invoices.find((invoice) => invoice.id === earlyRenewal.id)).toMatchObject({
      amountMinor: 10_000,
      tariffId: 'pro',
      tariffSnapshot: { id: 'pro' },
    });
    expect(createIntent.mock.calls.map(([input]) => input.amountMinor)).toEqual([
      10_000,
      10_000,
      15_000,
    ]);
    expect(overview.subscriptions.find((row) => row.source === 'paid_subscription')).toMatchObject({
      tariffId: 'pro',
      tariffSnapshot: { id: 'pro' },
    });
  });

  it('does not apply an old-period upgrade capture to a later paid period at the old price', async () => {
    let clock = new Date('2026-08-01T00:00:00.000Z');
    const repository = createInMemorySaasBillingRepository({
      tariffs: [
        { id: 'basic', name: 'Базовый', priceMinor: 10_000, currency: 'RUB', billingPeriod: 'month' },
        { id: 'pro', name: 'Про', priceMinor: 20_000, currency: 'RUB', billingPeriod: 'month' },
      ],
    });
    const service = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({
        createIntent: async (input: Parameters<PaymentProviderPort['createIntent']>[0]) => ({
          providerIntentRef: `provider-${input.subjectRef}`,
          checkoutUrl: `https://pay.example/${input.subjectRef}`,
        }),
      }) as never,
      now: () => clock,
      getTariffTransition: async () => ({
        currentTariffId: 'basic',
        targetTariffId: 'pro',
        blocks: [],
        appliesNextPeriod: false,
      }),
    });
    const capture = (invoice: SaasBillingInvoice, eventId: string) =>
      service.captureSaasBillingProviderWebhookEvent({
        organizationId: 'org-stale-upgrade',
        saasBillingInvoiceId: invoice.id,
        providerId: 'yookassa',
        verified: {
          idempotencyKey: eventId,
          eventType: 'payment.succeeded',
          amountMinor: invoice.amountMinor,
          payload: { currency: invoice.currency },
        },
      });

    await service.assignManualTariff({
      organizationId: 'org-stale-upgrade',
      tariffId: 'basic',
      audit: { actorId: 'admin', reason: 'seed paid period' },
    });
    const current = await service.createOwnTariffRenewalInvoice('org-stale-upgrade');
    await capture(current, 'capture-current');

    clock = new Date('2026-08-16T12:00:00.000Z');
    const upgrade = await service.scheduleOwnTariffChange({
      organizationId: 'org-stale-upgrade',
      tariffId: 'pro',
      actorId: 'owner',
    });
    if (upgrade.outcome !== 'checkout') throw new Error('checkout expected');

    clock = new Date('2026-09-01T00:00:00.000Z');
    const nextPeriod = await service.createOwnTariffRenewalInvoice('org-stale-upgrade');
    await capture(nextPeriod, 'capture-next-period');
    await capture(upgrade.invoice, 'capture-stale-upgrade');

    const overview = await service.getOrganizationBillingOverview('org-stale-upgrade');
    expect(overview.subscriptions.find((row) => row.source === 'paid_subscription')).toMatchObject({
      tariffId: 'basic',
      tariffSnapshot: { id: 'basic' },
      currentPeriodStartsAt: '2026-09-01T00:00:00.000Z',
      currentPeriodEndsAt: '2026-10-01T00:00:00.000Z',
    });
  });
});

// B0.3/#1057 — a repeat upgrade to the SAME tariff after the invoice was closed (provider
// rejection/expiry -> `failed`, or an operator's `POST /.../payments/{id}/cancel` -> `void`) must
// not hand back the dead `providerCheckoutUrl` it once had: `service.ts:265` used to key reuse
// purely off `providerCheckoutUrl` being non-null, a field that is written once and never cleared,
// so it said nothing about whether the PSP would still accept a payment. Live TEST reproduction:
// SAAS_BILLING_PLAN.md B0.3, invoice `9ed3f0cf-…` — YooKassa opened straight into «Успешно» with no
// card form.
describe('B0.3/#1057: повторный апгрейд на тот же тариф после закрытия заказа не отдаёт мёртвую ссылку', () => {
  function createUpgradeRepository() {
    return createInMemorySaasBillingRepository({
      tariffs: [
        { id: 'basic', name: 'Базовый', priceMinor: 10_000, currency: 'RUB', billingPeriod: 'month' },
        { id: 'pro', name: 'Про', priceMinor: 20_000, currency: 'RUB', billingPeriod: 'month' },
      ],
    });
  }

  function upgradeService(
    repository: ReturnType<typeof createInMemorySaasBillingRepository>,
    createIntent: ReturnType<typeof vi.fn>,
  ) {
    return createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => new Date('2026-08-16T12:00:00.000Z'),
      getTariffTransition: async () => ({
        currentTariffId: 'basic',
        targetTariffId: 'pro',
        blocks: [],
        appliesNextPeriod: false,
      }),
    });
  }

  /** Seeds a REAL paid period (assign -> renewal invoice -> webhook capture), same as the other
   *  upgrade suites above — `assignManualTariff` alone leaves `requireOwnTariffBillingSubscription`
   *  without a period until something reads/writes the `paid_subscription` row. Runs through its own
   *  throwaway provider mock so it doesn't pollute the test's own `createIntent` call count. */
  async function seedOrg(
    repository: ReturnType<typeof createInMemorySaasBillingRepository>,
    organizationId: string,
  ) {
    const seedService = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({
        createIntent: async (input: Parameters<PaymentProviderPort['createIntent']>[0]) => ({
          providerIntentRef: `provider-seed-${input.subjectRef}`,
          checkoutUrl: `https://pay.example/seed-${input.subjectRef}`,
        }),
      }) as never,
      now: () => new Date('2026-08-01T00:00:00.000Z'),
    });
    await seedService.assignManualTariff({
      organizationId,
      tariffId: 'basic',
      audit: { actorId: 'admin', reason: 'seed paid period' },
    });
    const seedInvoice = await seedService.createOwnTariffRenewalInvoice(organizationId);
    await seedService.captureSaasBillingProviderWebhookEvent({
      organizationId,
      saasBillingInvoiceId: seedInvoice.id,
      providerId: 'yookassa',
      verified: {
        idempotencyKey: `seed-capture-${organizationId}`,
        eventType: 'payment.succeeded',
        amountMinor: seedInvoice.amountMinor,
        payload: { currency: seedInvoice.currency },
      },
    });
  }

  it('пока заказ ещё открыт (draft/pending) — повтор отдаёт ТУ ЖЕ ссылку без нового вызова провайдера', async () => {
    const repository = createUpgradeRepository();
    await seedOrg(repository, 'org-b03-reuse');
    const createIntent = vi.fn(async (input: Parameters<PaymentProviderPort['createIntent']>[0]) => ({
      providerIntentRef: `provider-${input.subjectRef}`,
      checkoutUrl: `https://pay.example/${input.subjectRef}`,
    }));
    const service = upgradeService(repository, createIntent);

    const first = await service.scheduleOwnTariffChange({
      organizationId: 'org-b03-reuse',
      tariffId: 'pro',
      actorId: 'owner',
    });
    const second = await service.scheduleOwnTariffChange({
      organizationId: 'org-b03-reuse',
      tariffId: 'pro',
      actorId: 'owner',
    });
    if (first.outcome !== 'checkout' || second.outcome !== 'checkout') throw new Error('checkout expected');

    expect(second.invoice.id).toBe(first.invoice.id);
    expect(second.invoice.providerCheckoutUrl).toBe(first.invoice.providerCheckoutUrl);
    expect(createIntent).toHaveBeenCalledOnce();
  });

  it('после отмены (void) закрытого заказа повтор открывает НОВЫЙ платёж, а не отдаёт мёртвую ссылку', async () => {
    const repository = createUpgradeRepository();
    await seedOrg(repository, 'org-b03-void');
    const createIntent = vi.fn(async (input: Parameters<PaymentProviderPort['createIntent']>[0]) => ({
      providerIntentRef: `provider-${createIntent.mock.calls.length}`,
      checkoutUrl: `https://pay.example/upgrade-${createIntent.mock.calls.length}`,
    }));
    const service = upgradeService(repository, createIntent);

    const first = await service.scheduleOwnTariffChange({
      organizationId: 'org-b03-void',
      tariffId: 'pro',
      actorId: 'owner',
    });
    if (first.outcome !== 'checkout') throw new Error('checkout expected');

    // The clinic's browser opens the provider's page for a stuck order; an operator cancels the
    // invoice the same way the live TEST run did (`POST /api/admin/saas-billing/payments/{id}/cancel`).
    const cancelled = await service.cancelSaasBillingInvoice({
      saasBillingInvoiceId: first.invoice.id,
      actorId: 'admin',
      reason: 'stuck upgrade invoice',
    });
    expect(cancelled).toMatchObject({ outcome: 'cancelled', invoice: { status: 'void' } });

    const repeat = await service.scheduleOwnTariffChange({
      organizationId: 'org-b03-void',
      tariffId: 'pro',
      actorId: 'owner',
    });
    if (repeat.outcome !== 'checkout') throw new Error('checkout expected');

    // Same period row (the guard against a second open upgrade invoice for this period still
    // holds), but a FRESH provider order and a FRESH link — never the voided one.
    expect(repeat.invoice.id).toBe(first.invoice.id);
    expect(repeat.invoice.status).toBe('pending');
    expect(repeat.invoice.providerCheckoutUrl).not.toBe(first.invoice.providerCheckoutUrl);
    expect(repeat.invoice.providerIdempotencyKey).not.toBe(first.invoice.providerIdempotencyKey);
    expect(repeat.invoice.providerIdempotencyKey).toMatch(/^saas_tariff_upgrade_retry:/);
    expect(createIntent).toHaveBeenCalledTimes(2);
  });

  it('гонка двух повторов после отмены резервирует ОДИН новый заказ у провайдера', async () => {
    let resolveSecondIntent: ((value: { providerIntentRef: string; checkoutUrl: string }) => void) | undefined;
    let calls = 0;
    const createIntent = vi.fn(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({ providerIntentRef: 'provider-initial', checkoutUrl: 'https://pay.example/initial' });
      }
      return new Promise<{ providerIntentRef: string; checkoutUrl: string }>((resolve) => {
        resolveSecondIntent = resolve;
      });
    });
    const repository = createUpgradeRepository();
    await seedOrg(repository, 'org-b03-race');
    const service = upgradeService(repository, createIntent);

    const first = await service.scheduleOwnTariffChange({
      organizationId: 'org-b03-race',
      tariffId: 'pro',
      actorId: 'owner',
    });
    if (first.outcome !== 'checkout') throw new Error('checkout expected');
    await service.cancelSaasBillingInvoice({
      saasBillingInvoiceId: first.invoice.id,
      actorId: 'admin',
      reason: 'stuck upgrade invoice',
    });

    const racedFirst = service.scheduleOwnTariffChange({
      organizationId: 'org-b03-race',
      tariffId: 'pro',
      actorId: 'owner',
    });
    const racedSecond = service.scheduleOwnTariffChange({
      organizationId: 'org-b03-race',
      tariffId: 'pro',
      actorId: 'owner',
    });
    await vi.waitFor(() => expect(createIntent).toHaveBeenCalledTimes(2));
    resolveSecondIntent?.({ providerIntentRef: 'provider-race', checkoutUrl: 'https://pay.example/race' });
    const [outcomeA, outcomeB] = await Promise.all([racedFirst, racedSecond]);
    if (outcomeA.outcome !== 'checkout' || outcomeB.outcome !== 'checkout') {
      throw new Error('checkout expected');
    }

    // Same convention as the existing concurrent-create test above (`Р-14: immediate paid
    // upgrade`): only ONE of the two racers claims the reopened row and actually calls the
    // provider; the other returns immediately with the still-unclaimed row. What matters for
    // "converges on one order" is a single provider call reserving a single invoice id — not that
    // both promises individually carry the finished link.
    expect(createIntent).toHaveBeenCalledTimes(2);
    expect(outcomeA.invoice.id).toBe(first.invoice.id);
    expect(outcomeB.invoice.id).toBe(first.invoice.id);
    const claimant = [outcomeA, outcomeB].find((outcome) => outcome.invoice.providerCheckoutUrl);
    expect(claimant?.invoice.providerCheckoutUrl).toBe('https://pay.example/race');
  });

  it('оплаченный инвойс никогда не переоткрывается на повторный апгрейд', async () => {
    const createIntent = vi.fn(async () => ({
      providerIntentRef: 'should-not-be-called',
      checkoutUrl: 'https://pay.example/should-not-be-called',
    }));
    const prepareSaasBillingFailedInvoiceForManualCheckout = vi.fn();
    const paidInvoice: SaasBillingInvoice = {
      ...invoice,
      id: 'invoice-paid-upgrade',
      status: 'paid',
      providerId: 'mock',
      providerInvoiceRef: 'provider-already-paid',
      providerCheckoutUrl: 'https://pay.example/already-paid',
    };
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription-1',
          currentTariffId: 'basic',
          tariffId: 'basic',
          billingPeriod: 'month' as const,
          savedPaymentMethodId: null,
          currentPeriodStartsAt: '2026-08-01T00:00:00.000Z',
          currentPeriodEndsAt: '2026-09-01T00:00:00.000Z',
        }),
        createProratedTariffUpgradeInvoice: async () => ({
          outcome: 'checkout' as const,
          invoice: paidInvoice,
          created: false,
        }),
        prepareSaasBillingFailedInvoiceForManualCheckout,
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      getTariffTransition: async () => ({
        currentTariffId: 'basic',
        targetTariffId: 'pro',
        blocks: [],
        appliesNextPeriod: false,
      }),
    });

    const result = await service.scheduleOwnTariffChange({
      organizationId: 'org-paid-guard',
      tariffId: 'pro',
      actorId: 'owner',
    });

    if (result.outcome !== 'checkout') throw new Error('checkout expected');
    expect(result.invoice).toMatchObject({ id: 'invoice-paid-upgrade', status: 'paid' });
    expect(createIntent).not.toHaveBeenCalled();
    expect(prepareSaasBillingFailedInvoiceForManualCheckout).not.toHaveBeenCalled();
  });
});

// #1057 — `createProratedTariffUpgradeInvoice` must reuse an open upgrade invoice only when the
// target tariff matches; otherwise a stale draft for tariff A blocks checkout for tariff B.
describe('#1057: open upgrade invoice scoped to target tariff', () => {
  function createUpgradeRepository() {
    return createInMemorySaasBillingRepository({
      tariffs: [
        { id: 'basic', name: 'Базовый', priceMinor: 10_000, currency: 'RUB', billingPeriod: 'month' },
        { id: 'clinic', name: 'Клиника', priceMinor: 15_000, currency: 'RUB', billingPeriod: 'month' },
        { id: 'pro', name: 'Про', priceMinor: 20_000, currency: 'RUB', billingPeriod: 'month' },
      ],
    });
  }

  async function seedOrg(
    repository: ReturnType<typeof createInMemorySaasBillingRepository>,
    organizationId: string,
  ) {
    const seedService = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({
        createIntent: async (input: Parameters<PaymentProviderPort['createIntent']>[0]) => ({
          providerIntentRef: `provider-seed-${input.subjectRef}`,
          checkoutUrl: `https://pay.example/seed-${input.subjectRef}`,
        }),
      }) as never,
      now: () => new Date('2026-08-01T00:00:00.000Z'),
    });
    await seedService.assignManualTariff({
      organizationId,
      tariffId: 'basic',
      audit: { actorId: 'admin', reason: 'seed paid period' },
    });
    const seedInvoice = await seedService.createOwnTariffRenewalInvoice(organizationId);
    await seedService.captureSaasBillingProviderWebhookEvent({
      organizationId,
      saasBillingInvoiceId: seedInvoice.id,
      providerId: 'yookassa',
      verified: {
        idempotencyKey: `seed-capture-${organizationId}`,
        eventType: 'payment.succeeded',
        amountMinor: seedInvoice.amountMinor,
        payload: { currency: seedInvoice.currency },
      },
    });
  }

  it('does not reuse an open upgrade invoice for a different target tariff', async () => {
    const repository = createUpgradeRepository();
    await seedOrg(repository, 'org-target-tariff-scope');
    const createIntent = vi.fn(async (input: Parameters<PaymentProviderPort['createIntent']>[0]) => ({
      providerIntentRef: `provider-${input.subjectRef}`,
      checkoutUrl: `https://pay.example/${input.subjectRef}`,
    }));
    const service = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => new Date('2026-08-16T12:00:00.000Z'),
      getTariffTransition: async (_organizationId, tariffId) => ({
        currentTariffId: 'basic',
        targetTariffId: tariffId,
        blocks: [],
        appliesNextPeriod: false,
      }),
    });

    const clinicUpgrade = await service.scheduleOwnTariffChange({
      organizationId: 'org-target-tariff-scope',
      tariffId: 'clinic',
      actorId: 'owner',
    });
    const proUpgrade = await service.scheduleOwnTariffChange({
      organizationId: 'org-target-tariff-scope',
      tariffId: 'pro',
      actorId: 'owner',
    });
    if (clinicUpgrade.outcome !== 'checkout' || proUpgrade.outcome !== 'checkout') {
      throw new Error('checkout expected');
    }

    expect(clinicUpgrade.invoice.tariffId).toBe('clinic');
    expect(proUpgrade.invoice.tariffId).toBe('pro');
    expect(proUpgrade.invoice.id).not.toBe(clinicUpgrade.invoice.id);
    expect(createIntent).toHaveBeenCalledTimes(2);
  });

  it('reuses the open upgrade invoice when the target tariff matches', async () => {
    const repository = createUpgradeRepository();
    await seedOrg(repository, 'org-target-tariff-reuse');
    const createIntent = vi.fn(async (input: Parameters<PaymentProviderPort['createIntent']>[0]) => ({
      providerIntentRef: `provider-${input.subjectRef}`,
      checkoutUrl: `https://pay.example/${input.subjectRef}`,
    }));
    const service = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => new Date('2026-08-16T12:00:00.000Z'),
      getTariffTransition: async () => ({
        currentTariffId: 'basic',
        targetTariffId: 'pro',
        blocks: [],
        appliesNextPeriod: false,
      }),
    });

    const first = await service.scheduleOwnTariffChange({
      organizationId: 'org-target-tariff-reuse',
      tariffId: 'pro',
      actorId: 'owner',
    });
    const second = await service.scheduleOwnTariffChange({
      organizationId: 'org-target-tariff-reuse',
      tariffId: 'pro',
      actorId: 'owner',
    });
    if (first.outcome !== 'checkout' || second.outcome !== 'checkout') {
      throw new Error('checkout expected');
    }

    expect(second.invoice.id).toBe(first.invoice.id);
    expect(createIntent).toHaveBeenCalledOnce();
  });
});

describe('webhook replay completes one durable paid-period action', () => {
  it('retries the invoice action when the process fails after event dedupe', async () => {
    let eventRecorded = false;
    let invoiceStatus: SaasBillingInvoice['status'] = 'pending';
    const markSaasBillingInvoicePaid = vi
      .fn()
      .mockRejectedValueOnce(new Error('fault_after_event_dedupe'))
      .mockImplementationOnce(async () => {
        invoiceStatus = 'paid';
        return { ...invoice, status: 'paid' as const };
      });
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        captureSaasBillingPaymentSucceeded: async () => {
          eventRecorded = true;
          return markSaasBillingInvoicePaid({});
        },
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({}) as never,
    });
    const input = {
      organizationId: 'org-1',
      saasBillingInvoiceId: invoice.id,
      providerId: 'mock',
      verified: {
        idempotencyKey: 'event-retry',
        eventType: 'payment.succeeded',
        payload: { currency: 'RUB' },
      },
    };

    await expect(service.captureSaasBillingProviderWebhookEvent(input)).rejects.toThrow(
      'fault_after_event_dedupe',
    );
    await service.captureSaasBillingProviderWebhookEvent(input);

    expect(invoiceStatus).toBe('paid');
    expect(markSaasBillingInvoicePaid).toHaveBeenCalledTimes(2);
  });

  it('does not lose the saved payment method when the process fails after invoice CAS', async () => {
    let eventRecorded = false;
    let savedPaymentMethodId: string | null = null;
    const saveSaasBillingSubscriptionPaymentMethod = vi
      .fn()
      .mockRejectedValueOnce(new Error('fault_after_invoice_cas'))
      .mockImplementationOnce(async (input: { savedPaymentMethodId: string }) => {
        savedPaymentMethodId = input.savedPaymentMethodId;
      });
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        captureSaasBillingPaymentSucceeded: async (input: { savedPaymentMethodId: string | null }) => {
          eventRecorded = true;
          await saveSaasBillingSubscriptionPaymentMethod({ savedPaymentMethodId: input.savedPaymentMethodId });
          return { captured: true, duplicate: false };
        },
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({}) as never,
    });
    const input = {
      organizationId: 'org-1',
      saasBillingInvoiceId: invoice.id,
      providerId: 'mock',
      verified: {
        idempotencyKey: 'event-save-method-retry',
        eventType: 'payment.succeeded',
        payload: { currency: 'RUB' },
        savedPaymentMethodId: 'pm-saved',
      },
    };

    await expect(service.captureSaasBillingProviderWebhookEvent(input)).rejects.toThrow(
      'fault_after_invoice_cas',
    );
    await service.captureSaasBillingProviderWebhookEvent(input);

    expect(savedPaymentMethodId).toBe('pm-saved');
    expect(saveSaasBillingSubscriptionPaymentMethod).toHaveBeenCalledTimes(2);
  });
});

// К4 round 2 — the bug the blind audit reproduced 100% of the time: two identical
// `createManualSaasBillingInvoice` calls each minted their OWN `providerIdempotencyKey` via
// `randomUUID()` and their OWN `servicePeriodStartsAt` via `now()`, so neither of the two unique
// indexes on `saas_billing_invoices` ever saw a repeat — three clicks made three invoices. This
// test runs through the REAL in-memory repository (not a hand-rolled mock of "what idempotency
// should do") so the actual `insertInvoiceIdempotent` codepath is what's under test.
// Арбитр: revert the `providerIdempotencyKey` in `createManualSaasBillingInvoice` back to
// `randomUUID()` and this test goes red on the first assertion.
describe('К4 round 2: повторное «Выставить счёт» не создаёт второй счёт', () => {
  async function seedOrgWithTariff(service: ReturnType<typeof createSaasBillingService>) {
    await service.assignManualTariff({
      organizationId: 'org-k4r2',
      tariffId: 'tariff-k4r2',
      audit: { actorId: 'operator-k4r2', reason: 'test seed' },
    });
  }

  it('тот же запрос дважды возвращает ОДИН и тот же счёт; другой запрос создаёт новый', async () => {
    const createIntent = vi.fn(async () => ({
      providerIntentRef: `provider-invoice-${createIntent.mock.calls.length}`,
      checkoutUrl: `https://yookassa.example.test/checkout-${createIntent.mock.calls.length}`,
    }));
    const repository = createInMemorySaasBillingRepository();
    const service = createSaasBillingService({
      repository,
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'mock',
          providers: [
            {
              id: 'mock',
              label: 'Mock',
              enabled: true,
              webhookSecret: 'unused',
              shopId: 's',
              apiKey: 'k',
            },
          ],
        }),
      },
      resolvePaymentProvider: () => ({ supportsInvoice: true, createIntent }) as never,
      now: () => new Date('2026-08-02T00:00:00.000Z'),
    });
    await seedOrgWithTariff(service);

    const request = {
      organizationId: 'org-k4r2',
      amountMinor: 5_000,
      currency: 'RUB',
      description: 'Счёт за тариф',
    };

    const first = await service.createManualSaasBillingInvoice(request);
    const second = await service.createManualSaasBillingInvoice({ ...request });

    expect(second.id).toBe(first.id);
    expect(second.providerCheckoutUrl).toBe(first.providerCheckoutUrl);
    expect(
      (await repository.getOrganizationBillingOverview('org-k4r2')).invoices.find(
        (candidate) => candidate.id === first.id,
      )?.providerCheckoutUrl,
    ).toBe(first.providerCheckoutUrl);
    expect(createIntent).toHaveBeenCalledTimes(1);
    expect(createIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 5_000,
        currency: 'RUB',
        payerRef: 'organization:org-k4r2',
        purpose: 'saas_billing_tariff_renewal',
        subjectRef: first.id,
        returnUrl: expect.stringMatching(/^https?:\/\/[^/]+\/app\/settings\?tab=billing$/),
        // Этап 1, пункт 1.3 — 30 дней от момента выставления, не выбор администратора.
        invoice: { description: 'Счёт за тариф', expiresAt: '2026-09-01T00:00:00.000Z' },
      }),
    );

    const different = await service.createManualSaasBillingInvoice({
      ...request,
      amountMinor: 7_000,
    });

    expect(different.id).not.toBe(first.id);
    expect(createIntent).toHaveBeenCalledTimes(2);
  });

  it('изолирует ключ повторного счёта по клинике и каждому полю запроса', async () => {
    const createIntent = vi.fn(async () => ({
      providerIntentRef: `provider-isolation-${createIntent.mock.calls.length}`,
      checkoutUrl: `https://yookassa.example.test/isolation-${createIntent.mock.calls.length}`,
    }));
    const repository = createInMemorySaasBillingRepository();
    const service = createSaasBillingService({
      repository,
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'mock',
          providers: [
            { id: 'mock', label: 'Mock', enabled: true, webhookSecret: 'unused', shopId: 's', apiKey: 'k' },
          ],
        }),
      },
      resolvePaymentProvider: () => ({ supportsInvoice: true, createIntent }) as never,
      now: () => new Date('2026-08-02T00:00:00.000Z'),
    });
    for (const organizationId of ['org-k4-isolation-a', 'org-k4-isolation-b']) {
      await service.assignManualTariff({
        organizationId,
        tariffId: `tariff-${organizationId}`,
        audit: { actorId: 'operator-k4-isolation', reason: 'test seed' },
      });
    }
    const request = {
      organizationId: 'org-k4-isolation-a',
      amountMinor: 5_000,
      currency: 'RUB',
      description: 'Счёт за тариф',
    };

    const first = await service.createManualSaasBillingInvoice(request);
    const repeated = await service.createManualSaasBillingInvoice({ ...request });
    const differentAmount = await service.createManualSaasBillingInvoice({ ...request, amountMinor: 7_000 });
    const differentRequest = await service.createManualSaasBillingInvoice({
      ...request,
      description: 'Другой счёт за тариф',
    });
    const otherOrganization = await service.createManualSaasBillingInvoice({
      ...request,
      organizationId: 'org-k4-isolation-b',
    });

    expect(repeated.id).toBe(first.id);
    expect(new Set([first.id, differentAmount.id, differentRequest.id, otherOrganization.id]).size).toBe(4);
    expect(new Set([
      first.providerIdempotencyKey,
      differentAmount.providerIdempotencyKey,
      differentRequest.providerIdempotencyKey,
      otherOrganization.providerIdempotencyKey,
    ]).size).toBe(4);
    expect((await repository.getOrganizationBillingOverview('org-k4-isolation-a')).invoices).toHaveLength(3);
    expect((await repository.getOrganizationBillingOverview('org-k4-isolation-b')).invoices).toHaveLength(1);
    expect(createIntent).toHaveBeenCalledTimes(4);
  });

  it('не отправляет manual invoice провайдеру при неполной фискальной конфигурации', async () => {
    const createIntent = vi.fn();
    const repository = createInMemorySaasBillingRepository();
    const service = createSaasBillingService({
      repository,
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'mock',
          providers: [
            { id: 'mock', label: 'Mock', enabled: true, webhookSecret: 'unused', shopId: 's', apiKey: 'k' },
          ],
          payeeRequisites: { taxSystemCode: '2' },
        }),
      },
      resolvePaymentProvider: () => ({ supportsInvoice: true, createIntent }) as never,
      now: () => new Date('2026-08-17T00:00:00.000Z'),
    });
    await seedOrgWithTariff(service);

    await expect(
      service.createManualSaasBillingInvoice({
        organizationId: 'org-k4r2',
        amountMinor: 5_000,
        currency: 'RUB',
        description: 'Счёт за тариф',
      }),
    ).rejects.toThrow('saas_billing_receipt_vat_code_missing');

    expect(createIntent).not.toHaveBeenCalled();
    expect((await repository.getOrganizationBillingOverview('org-k4r2')).invoices).toHaveLength(1);
  });
});

// К4's provider-failure regression: the durable idempotency row is intentionally written before
// YooKassa is called. Without releasing that unlinked draft, a retry of the exact same operator
// request only returns the empty row and the clinic never receives a payment link.
describe('К4: черновик после сбоя провайдера можно повторить тем же запросом', () => {
  const request = {
    organizationId: 'org-k4-retry',
    amountMinor: 5_000,
    currency: 'RUB',
    description: 'Счёт за тариф',
  };

  async function createService(createIntent: ReturnType<typeof vi.fn>) {
    const repository = createInMemorySaasBillingRepository();
    const service = createSaasBillingService({
      repository,
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'mock',
          providers: [{ id: 'mock', label: 'Mock', enabled: true, webhookSecret: 'unused', shopId: 's', apiKey: 'k' }],
        }),
      },
      resolvePaymentProvider: () => ({ supportsInvoice: true, createIntent }) as never,
      now: () => new Date('2026-08-02T00:00:00.000Z'),
    });
    await service.assignManualTariff({
      organizationId: request.organizationId,
      tariffId: 'tariff-k4-retry',
      audit: { actorId: 'operator-k4-retry', reason: 'test seed' },
    });
    return { repository, service };
  }

  it('после отказа повтор тем же ключом снова вызывает провайдера и возвращает ссылку', async () => {
    const createIntent = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider_temporarily_unavailable'))
      .mockResolvedValueOnce({ providerIntentRef: 'provider-retry-1', checkoutUrl: 'https://pay.example/retry-1' });
    const { repository, service } = await createService(createIntent);

    await expect(service.createManualSaasBillingInvoice(request)).rejects.toThrow(
      'provider_temporarily_unavailable',
    );
    const retried = await service.createManualSaasBillingInvoice({ ...request });

    expect(retried.providerCheckoutUrl).toBe('https://pay.example/retry-1');
    expect(createIntent).toHaveBeenCalledTimes(2);
    expect((await repository.getOrganizationBillingOverview(request.organizationId)).invoices).toHaveLength(1);
  });

  it('гонка одного запроса резервирует один вызов провайдера и один счёт', async () => {
    let resolveIntent: ((value: { providerIntentRef: string; checkoutUrl: string }) => void) | undefined;
    const createIntent = vi.fn(
      () => new Promise<{ providerIntentRef: string; checkoutUrl: string }>((resolve) => { resolveIntent = resolve; }),
    );
    const { repository, service } = await createService(createIntent);

    const first = service.createManualSaasBillingInvoice(request);
    const second = service.createManualSaasBillingInvoice({ ...request });
    await vi.waitFor(() => expect(createIntent).toHaveBeenCalledOnce());
    resolveIntent?.({ providerIntentRef: 'provider-race-1', checkoutUrl: 'https://pay.example/race-1' });
    await Promise.all([first, second]);

    expect(createIntent).toHaveBeenCalledOnce();
    expect((await repository.getOrganizationBillingOverview(request.organizationId)).invoices).toHaveLength(1);
  });
});

// B0.3/#1057 — a refused provider create must not burn the invoice's idempotence key for 24h: a
// PSP refusal PROVEN before creation (`PaymentProviderRequestRefusedError`) must rotate the key so
// the next attempt is not resending a burned one, while an ambiguous failure (network/timeout/5xx,
// a plain `Error`) must keep the same key so a retry idempotently replays instead of risking a
// double charge. Both paths go through `createOwnTariffRenewalInvoice` — the clinic "Оплатить
// тариф" button (K0) — which reuses the exact same period each retry once a paid period exists,
// reproducing the live TEST defect (invoice `e13b2c92-5693-463f-8c3a-274cd198bcf7`).
describe('B0.3/#1057: отказ провайдера ДО создания платежа не жжёт ключ на 24 часа', () => {
  async function createService(createIntent: ReturnType<typeof vi.fn>, organizationId: string) {
    const repository = createInMemorySaasBillingRepository();
    const service = createSaasBillingService({
      repository,
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'mock',
          providers: [{ id: 'mock', label: 'Mock', enabled: true, webhookSecret: 'unused', shopId: 's', apiKey: 'k' }],
        }),
      },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => new Date('2026-08-02T00:00:00.000Z'),
    });
    await service.assignManualTariff({
      organizationId,
      tariffId: 'tariff-b03',
      audit: { actorId: 'platform-admin', reason: 'test seed' },
    });
    return { repository, service };
  }

  it('отказ до создания платежа ротирует ключ — повтор уходит с ДРУГИМ ключом и получает ссылку', async () => {
    const createIntent = vi
      .fn()
      .mockRejectedValueOnce(
        new PaymentProviderRequestRefusedError('yookassa_create_failed:400:invalid_request'),
      )
      .mockResolvedValueOnce({
        providerIntentRef: 'provider-refused-retry-1',
        checkoutUrl: 'https://pay.example/refused-retry-1',
      });
    const { repository, service } = await createService(createIntent, 'org-b03-refused');

    await expect(service.createOwnTariffRenewalInvoice('org-b03-refused')).rejects.toThrow(
      'yookassa_create_failed:400',
    );
    const retried = await service.createOwnTariffRenewalInvoice('org-b03-refused');

    expect(retried.providerCheckoutUrl).toBe('https://pay.example/refused-retry-1');
    expect(createIntent).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = createIntent.mock.calls;
    expect(secondCall[0].idempotencyKey).not.toBe(firstCall[0].idempotencyKey);
    expect(
      (await repository.getOrganizationBillingOverview('org-b03-refused')).invoices,
    ).toHaveLength(1);
  });

  it('неоднозначный сбой (не доказанный отказ) НЕ меняет ключ — повтор уходит ТЕМ ЖЕ ключом', async () => {
    const createIntent = vi
      .fn()
      .mockRejectedValueOnce(new Error('yookassa_create_failed:502:upstream'))
      .mockResolvedValueOnce({
        providerIntentRef: 'provider-ambiguous-retry-1',
        checkoutUrl: 'https://pay.example/ambiguous-retry-1',
      });
    const { repository, service } = await createService(createIntent, 'org-b03-ambiguous');

    await expect(service.createOwnTariffRenewalInvoice('org-b03-ambiguous')).rejects.toThrow(
      'yookassa_create_failed:502',
    );
    const retried = await service.createOwnTariffRenewalInvoice('org-b03-ambiguous');

    expect(retried.providerCheckoutUrl).toBe('https://pay.example/ambiguous-retry-1');
    expect(createIntent).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = createIntent.mock.calls;
    expect(secondCall[0].idempotencyKey).toBe(firstCall[0].idempotencyKey);
    expect(
      (await repository.getOrganizationBillingOverview('org-b03-ambiguous')).invoices,
    ).toHaveLength(1);
  });

  it('два параллельных повтора после отказа сходятся на одном ключе — провайдер вызван один раз', async () => {
    let resolveIntent: ((value: { providerIntentRef: string; checkoutUrl: string }) => void) | undefined;
    const createIntent = vi.fn(() => {
      if (createIntent.mock.calls.length === 1) {
        return Promise.reject(
          new PaymentProviderRequestRefusedError('yookassa_create_failed:400:invalid_request'),
        );
      }
      return new Promise<{ providerIntentRef: string; checkoutUrl: string }>((resolve) => {
        resolveIntent = resolve;
      });
    });
    const { repository, service } = await createService(createIntent, 'org-b03-race');

    await expect(service.createOwnTariffRenewalInvoice('org-b03-race')).rejects.toThrow(
      'yookassa_create_failed:400',
    );

    const first = service.createOwnTariffRenewalInvoice('org-b03-race');
    const second = service.createOwnTariffRenewalInvoice('org-b03-race');
    await vi.waitFor(() => expect(createIntent).toHaveBeenCalledTimes(2));
    resolveIntent?.({ providerIntentRef: 'provider-race-1', checkoutUrl: 'https://pay.example/race-1' });
    await Promise.all([first, second]);

    // 1 refused attempt + 1 retry — the concurrent second retry never opens its own provider call.
    expect(createIntent).toHaveBeenCalledTimes(2);
    expect(
      (await repository.getOrganizationBillingOverview('org-b03-race')).invoices,
    ).toHaveLength(1);
  });
});

// К6 — the money-safety invariant: a revoked (or never-granted) consent must win even when a saved
// payment method is still sitting on the row (revoke never clears it, by design — see
// `revokeSaasBillingAutopayConsent`). Without this gate, `savedPaymentMethodId` alone would let the
// tick keep charging a card the payer explicitly said to stop using — the exact "списали без
// согласия" failure the plan calls out as expensive and silent.
// Арбитр: drop the `autopayRevokedAt === null` half of the `autopayActive` check in
// `runDueSaasBillingRenewals` and this test goes red (`createIntent` gets called with a
// `paymentMethodId`).
describe('К6: без действующего согласия списание не уходит', () => {
  it('отозванное согласие не даёт тику списать деньги с сохранённого способа', async () => {
    const dueSubscription = {
      saasBillingSubscriptionId: 'subscription-1',
      organizationId: 'org-1',
      tariffId: 'tariff-1',
      billingPeriod: 'month' as const,
      currentPeriodEndsAt: '2026-08-01T00:00:00.000Z',
      savedPaymentMethodId: 'pm-1',
      autopayConsentedAt: '2026-07-01T00:00:00.000Z',
      autopayRevokedAt: '2026-07-15T00:00:00.000Z',
    };
    const createSaasBillingRenewalInvoiceIfAbsent = vi.fn(async (input) => ({
      invoice: { ...invoice, id: 'invoice-new', providerIdempotencyKey: input.providerIdempotencyKey },
      created: true,
    }));
    const attachSaasBillingInvoiceProviderIntent = vi.fn(async (input) => ({ ...invoice, ...input }));
    const createIntent = vi.fn(async (_input: { paymentMethodId?: string }) => ({
      providerIntentRef: 'provider-intent-1',
      checkoutUrl: 'https://yookassa.example.test/checkout-1',
    }));
    const markSaasBillingInvoiceFailed = vi.fn();

    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        listSaasBillingSubscriptionsDueForRenewal: async () => [dueSubscription],
        promoteDueSaasBillingPaidInvoice: async () => false,
        createSaasBillingRenewalInvoiceIfAbsent,
        attachSaasBillingInvoiceProviderIntent,
        markSaasBillingInvoiceFailed,
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => new Date('2026-08-02T00:00:00.000Z'),
    });

    const result = await service.runDueSaasBillingRenewals();

    expect(result).toMatchObject({ dueCount: 1, created: 1, failed: 0 });
    expect(createIntent).toHaveBeenCalledTimes(1);
    const [call] = createIntent.mock.calls;
    expect(call?.[0]?.paymentMethodId).toBeUndefined();
    expect(markSaasBillingInvoiceFailed).not.toHaveBeenCalled();
  });
});

// К6 — same arbiter shape as the К5 test above, run over the autopay (off-session) path: a repeat
// tick over the same due subscription must charge the saved method exactly once, never twice, for
// the same service period.
// Арбитр: have the fake `createSaasBillingRenewalInvoiceIfAbsent` always return `created: true`
// (i.e. simulate the period-uniqueness index being dropped) and this test goes red.
describe('К6: повторный тик с активным автосписанием не списывает дважды за тот же период', () => {
  it('второй прогон находит ту же due-подписку и не звонит провайдеру снова', async () => {
    const dueSubscription = {
      saasBillingSubscriptionId: 'subscription-1',
      organizationId: 'org-1',
      tariffId: 'tariff-1',
      billingPeriod: 'month' as const,
      currentPeriodEndsAt: '2026-08-01T00:00:00.000Z',
      savedPaymentMethodId: 'pm-1',
      autopayConsentedAt: '2026-07-01T00:00:00.000Z',
      autopayRevokedAt: null,
    };
    const raisedForPeriod = new Set<string>();
    const createSaasBillingRenewalInvoiceIfAbsent = vi.fn(async (input) => {
      const key = `${input.saasBillingSubscriptionId}:${input.servicePeriodStartsAt}:${input.servicePeriodEndsAt}`;
      if (raisedForPeriod.has(key)) {
        return {
          invoice: { ...invoice, id: 'invoice-existing', providerIdempotencyKey: input.providerIdempotencyKey },
          created: false,
        };
      }
      raisedForPeriod.add(key);
      return {
        invoice: { ...invoice, id: 'invoice-new', providerIdempotencyKey: input.providerIdempotencyKey },
        created: true,
      };
    });
    const attachSaasBillingInvoiceProviderIntent = vi.fn(async (input) => ({ ...invoice, ...input }));
    const createIntent = vi.fn(async (_input: { paymentMethodId?: string }) => ({
      providerIntentRef: 'provider-intent-autopay-1',
      checkoutUrl: undefined,
    }));

    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        listSaasBillingSubscriptionsDueForRenewal: async () => [dueSubscription],
        promoteDueSaasBillingPaidInvoice: async () => false,
        createSaasBillingRenewalInvoiceIfAbsent,
        attachSaasBillingInvoiceProviderIntent,
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => new Date('2026-08-02T00:00:00.000Z'),
    });

    const first = await service.runDueSaasBillingRenewals();
    const second = await service.runDueSaasBillingRenewals();

    expect(first).toMatchObject({ dueCount: 1, created: 1, alreadyInvoiced: 0, failed: 0 });
    expect(second).toMatchObject({ dueCount: 1, created: 0, alreadyInvoiced: 1, failed: 0 });
    expect(createIntent).toHaveBeenCalledTimes(1);
    const [call] = createIntent.mock.calls;
    expect(call?.[0]?.paymentMethodId).toBe('pm-1');
  });
});

// К6 — after an off-session decline the period uniqueness guard must keep protecting against a
// second tariff period WITHOUT trapping the clinic behind a failed row. The existing tariff button
// must reopen that same row as a manual checkout exactly once; a repeat click gets its already
// attached link instead of another provider call.
// Арбитр: remove `retryFailedManually: true` from `createOwnTariffRenewalInvoice` — the first call
// returns the old failed invoice without a link and this test turns red.
describe('К6: неудачное автосписание возвращает клинику к ручной оплате', () => {
  it('reopens the failed period as one idempotent manual checkout', async () => {
    let currentInvoice: SaasBillingInvoice = {
      ...invoice,
      status: 'failed',
      providerId: 'yookassa',
      providerInvoiceRef: 'autopay-canceled-1',
      providerIdempotencyKey: 'saas_tariff_auto_renewal:subscription-1:2026-08-01T00:00:00.000Z',
    };
    const createSaasBillingInvoice = vi.fn(async () => ({ invoice: currentInvoice, created: false }));
    const prepareSaasBillingFailedInvoiceForManualCheckout = vi.fn(async (input) => {
      currentInvoice = {
        ...currentInvoice,
        status: 'draft',
        providerId: input.providerId,
        providerIdempotencyKey: input.providerIdempotencyKey,
        providerInvoiceRef: null,
        providerCheckoutUrl: null,
      };
      return currentInvoice;
    });
    const attachSaasBillingInvoiceProviderIntent = vi.fn(async (input) => {
      currentInvoice = {
        ...currentInvoice,
        status: 'pending',
        providerInvoiceRef: input.providerInvoiceRef,
        providerCheckoutUrl: input.providerCheckoutUrl,
      };
      return currentInvoice;
    });
    const createIntent = vi.fn(async (_input: Parameters<PaymentProviderPort['createIntent']>[0]) => ({
      providerIntentRef: 'manual-checkout-1',
      checkoutUrl: 'https://yookassa.example.test/manual-checkout-1',
    }));
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription-1',
          currentTariffId: 'tariff-1',
          tariffId: 'tariff-1',
          billingPeriod: 'month' as const,
          savedPaymentMethodId: 'pm-1',
          currentPeriodEndsAt: '2026-08-01T00:00:00.000Z',
        }),
        createSaasBillingInvoice,
        prepareSaasBillingFailedInvoiceForManualCheckout,
        attachSaasBillingInvoiceProviderIntent,
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => new Date('2026-08-02T00:00:00.000Z'),
    });

    const first = await service.createOwnTariffRenewalInvoice('org-1');
    const second = await service.createOwnTariffRenewalInvoice('org-1');

    expect(first.providerCheckoutUrl).toBe('https://yookassa.example.test/manual-checkout-1');
    expect(second.providerCheckoutUrl).toBe(first.providerCheckoutUrl);
    expect(prepareSaasBillingFailedInvoiceForManualCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        saasBillingInvoiceId: invoice.id,
        organizationId: 'org-1',
        providerId: 'yookassa',
        providerIdempotencyKey: expect.stringMatching(/^saas_tariff_manual_retry:/),
      }),
    );
    expect(createIntent).toHaveBeenCalledTimes(1);
    const [manualCheckout] = createIntent.mock.calls;
    expect(manualCheckout?.[0]).toMatchObject({ savePaymentMethod: false });
    expect(manualCheckout?.[0]).not.toHaveProperty('paymentMethodId');
  });

  it('turns a later provider cancellation into the visible failed state', async () => {
    const recordSaasBillingProviderEvent = vi.fn(async () => ({ created: true }));
    const markSaasBillingInvoiceFailed = vi.fn(async () => ({ ...invoice, status: 'failed' as const }));
    const service = createSaasBillingService({
      repository: {
      ...SAAS_REPO_BILLING_PERIOD_STUB,
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        recordSaasBillingProviderEvent,
        markSaasBillingInvoiceFailed,
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({}) as never,
    });

    await expect(
      service.captureSaasBillingProviderWebhookEvent({
        organizationId: 'org-1',
        saasBillingInvoiceId: 'invoice-1',
        providerId: 'yookassa',
        verified: {
          idempotencyKey: 'payment-canceled-1',
          eventType: 'payment.canceled',
          payload: { currency: 'RUB' },
        },
      }),
    ).resolves.toEqual({ captured: false, duplicate: false });
    expect(markSaasBillingInvoiceFailed).toHaveBeenCalledWith({
      saasBillingInvoiceId: 'invoice-1',
      organizationId: 'org-1',
    });
  });
});

// Решение владельца 18.08.2026, дословно: «Считать бесплатный тариф неоплачиваемым». Поломка,
// которую ловит этот блок: клиника на тарифе ценой 0 ₽ нажимает «Оплатить тариф», код доходит до
// чека с нулевой позицией (`payment_receipt_item_amount_invalid`) и отвечает «оплата временно
// недоступна» — молчаливый и дорогой отказ: платить нечего, а человеку сказано, что сломалось.
describe('бесплатный тариф неоплачиваем (решение владельца 18.08)', () => {
  function createService(
    createIntent: ReturnType<typeof vi.fn>,
    tariffs: Array<{ id: string; name: string; priceMinor: number; currency: string; billingPeriod: string }>,
  ) {
    const repository = createInMemorySaasBillingRepository({ tariffs });
    const service = createSaasBillingService({
      repository,
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'mock',
          providers: [
            { id: 'mock', label: 'Mock', enabled: true, webhookSecret: 'unused', shopId: 's', apiKey: 'k' },
          ],
        }),
      },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => new Date('2026-08-18T00:00:00.000Z'),
    });
    return { repository, service };
  }

  const freeTariff = {
    id: 'tariff-free',
    name: 'ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК',
    priceMinor: 0,
    currency: 'RUB',
    billingPeriod: 'month',
  };
  const paidTariff = {
    id: 'tariff-paid',
    name: 'ПРОФИ',
    priceMinor: 490_000,
    currency: 'RUB',
    billingPeriod: 'month',
  };

  it('счёт на бесплатный тариф не выставляется: причина названа, счёта нет, провайдер не тронут', async () => {
    const createIntent = vi.fn();
    const { repository, service } = createService(createIntent, [freeTariff, paidTariff]);
    await service.assignManualTariff({
      organizationId: 'org-free',
      tariffId: freeTariff.id,
      audit: { actorId: 'platform-admin', reason: 'test seed' },
    });

    await expect(service.createOwnTariffRenewalInvoice('org-free')).rejects.toThrow(
      'saas_billing_tariff_not_payable',
    );
    expect(createIntent).not.toHaveBeenCalled();
    expect((await repository.getOrganizationBillingOverview('org-free')).invoices).toHaveLength(0);
  });

  it('платный тариф по-прежнему доходит до платёжной двери и получает ссылку', async () => {
    // Дверь объявлена с аргументом намеренно: тест проверяет не только факт вызова, но и сумму,
    // с которой в неё вошли, — без типа параметра `mock.calls[0][0]` недостижим.
    const createIntent = vi.fn(async (_intent: { amountMinor: number; currency: string }) => ({
      providerIntentRef: 'provider-paid-1',
      checkoutUrl: 'https://pay.example/paid-1',
    }));
    const { service } = createService(createIntent, [freeTariff, paidTariff]);
    await service.assignManualTariff({
      organizationId: 'org-paid',
      tariffId: paidTariff.id,
      audit: { actorId: 'platform-admin', reason: 'test seed' },
    });

    const raised = await service.createOwnTariffRenewalInvoice('org-paid');

    expect(raised.providerCheckoutUrl).toBe('https://pay.example/paid-1');
    expect(createIntent).toHaveBeenCalledTimes(1);
    expect(createIntent.mock.calls[0]?.[0]).toMatchObject({
      amountMinor: paidTariff.priceMinor,
      currency: 'RUB',
    });
  });

  it('экран узнаёт то же правило: бесплатный тариф не платится, платный платится', async () => {
    const { service } = createService(vi.fn(), [freeTariff, paidTariff]);
    await service.assignManualTariff({
      organizationId: 'org-free',
      tariffId: freeTariff.id,
      audit: { actorId: 'platform-admin', reason: 'test seed' },
    });
    await service.assignManualTariff({
      organizationId: 'org-paid',
      tariffId: paidTariff.id,
      audit: { actorId: 'platform-admin', reason: 'test seed' },
    });

    await expect(service.getOwnTariffChangeState('org-free')).resolves.toMatchObject({
      payable: false,
    });
    await expect(service.getOwnTariffChangeState('org-paid')).resolves.toMatchObject({
      payable: true,
    });
  });
});

// Решение владельца 18.08.2026, дословно: «клиент получает то что оплачено. То что не оплачено не
// получает. Вот и все». Поломка, которую ловит этот блок: пока смена тарифа запланирована, счёт
// собирается из ДВУХ тарифов — сумма из текущего, длина периода из запланированного. Клиника платит
// месячную цену за год (или годовую за месяц), и никто этого не видит: в счёте оба числа выглядят
// правдоподобно по отдельности. Отказ дорогой (деньги) и молчаливый (проверить нечем, кроме самого
// счёта) — поэтому здесь тест, а не «сходить посмотреть».
describe('счёт целиком по одному тарифу — тому, за который платят (решение владельца 18.08)', () => {
  const monthlyTariff = {
    id: 'tariff-month',
    name: 'СТАРТ',
    priceMinor: 300_000,
    currency: 'RUB',
    billingPeriod: 'month',
  };
  const yearlyTariff = {
    id: 'tariff-year',
    name: 'ГОДОВОЙ',
    priceMinor: 3_000_000,
    currency: 'RUB',
    billingPeriod: 'year',
  };
  const freeYearlyTariff = {
    id: 'tariff-free-year',
    name: 'ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК',
    priceMinor: 0,
    currency: 'RUB',
    billingPeriod: 'year',
  };

  function createService(
    tariffs: Array<{ id: string; name: string; priceMinor: number; currency: string; billingPeriod: string }>,
  ) {
    const createIntent = vi.fn(
      async (input: Parameters<PaymentProviderPort['createIntent']>[0]) => ({
        providerIntentRef: `provider-${input.subjectRef}`,
        checkoutUrl: `https://pay.example/${input.subjectRef}`,
      }),
    );
    const repository = createInMemorySaasBillingRepository({ tariffs, trialPolicy: null });
    const service = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => new Date('2026-08-18T00:00:00.000Z'),
      // Смена тарифа на следующий период: сам переход и его блокировки здесь не предмет проверки.
      getTariffTransition: async (_organizationId, tariffId) => ({
        currentTariffId: 'seeded-current-tariff',
        targetTariffId: tariffId,
        blocks: [],
        appliesNextPeriod: true,
      }),
    });
    return { repository, service, createIntent };
  }

  /** Клиника с открытым оплаченным периодом на `currentTariffId` (период: 18.08 → 18.09). */
  async function seedPaidPeriod(
    service: ReturnType<typeof createService>['service'],
    repository: ReturnType<typeof createService>['repository'],
    organizationId: string,
    currentTariffId: string,
  ) {
    await repository.chooseOrganizationFirstTariff({
      organizationId,
      tariffId: currentTariffId,
      actorId: null,
    });
    await service.assignManualTariff({
      organizationId,
      tariffId: currentTariffId,
      audit: { actorId: 'platform-admin', reason: 'test seed' },
    });
  }

  it('при запланированной смене и сумма, и период, и длина периода — из запланированного тарифа', async () => {
    const { repository, service, createIntent } = createService([monthlyTariff, yearlyTariff]);
    await seedPaidPeriod(service, repository, 'org-scheduled', monthlyTariff.id);

    await expect(
      service.scheduleOwnTariffChange({
        organizationId: 'org-scheduled',
        tariffId: yearlyTariff.id,
        actorId: 'clinic-owner',
      }),
    ).resolves.toMatchObject({ outcome: 'scheduled' });

    const raised = await service.createOwnTariffRenewalInvoice('org-scheduled');

    expect(raised).toMatchObject({
      tariffId: yearlyTariff.id,
      amountMinor: yearlyTariff.priceMinor,
      tariffBillingPeriod: yearlyTariff.billingPeriod,
      // Следующий период начинается на границе оплаченного и длится ГОД — столько же, сколько
      // стоит выставленная сумма.
      servicePeriodStartsAt: '2026-09-18T00:00:00.000Z',
      servicePeriodEndsAt: '2027-09-18T00:00:00.000Z',
    });
    expect(createIntent.mock.calls[0]?.[0]).toMatchObject({
      amountMinor: yearlyTariff.priceMinor,
      currency: 'RUB',
    });
  });

  it('обычное продление без запланированной смены не изменилось: всё из текущего тарифа', async () => {
    const { repository, service } = createService([monthlyTariff, yearlyTariff]);
    await seedPaidPeriod(service, repository, 'org-renewal', monthlyTariff.id);

    const raised = await service.createOwnTariffRenewalInvoice('org-renewal');

    expect(raised).toMatchObject({
      tariffId: monthlyTariff.id,
      amountMinor: monthlyTariff.priceMinor,
      tariffBillingPeriod: monthlyTariff.billingPeriod,
      servicePeriodStartsAt: '2026-09-18T00:00:00.000Z',
      servicePeriodEndsAt: '2026-10-18T00:00:00.000Z',
    });
  });

  it('с бесплатного тарифа на платный: счёт на платный, а не отказ «бесплатный тариф неоплачиваем»', async () => {
    const { repository, service } = createService([freeYearlyTariff, monthlyTariff]);
    await seedPaidPeriod(service, repository, 'org-free-to-paid', freeYearlyTariff.id);
    await service.scheduleOwnTariffChange({
      organizationId: 'org-free-to-paid',
      tariffId: monthlyTariff.id,
      actorId: 'clinic-owner',
    });

    const raised = await service.createOwnTariffRenewalInvoice('org-free-to-paid');

    expect(raised).toMatchObject({
      tariffId: monthlyTariff.id,
      amountMinor: monthlyTariff.priceMinor,
      tariffBillingPeriod: monthlyTariff.billingPeriod,
      servicePeriodEndsAt: '2026-10-18T00:00:00.000Z',
    });
    // Экран обязан предлагать ровно то, что маршрут принимает: платить есть за что.
    await expect(service.getOwnTariffChangeState('org-free-to-paid')).resolves.toMatchObject({
      payable: true,
    });
  });
  it('черновик, выставленный до смены плана, не отправляет платить за прежний тариф', async () => {
    // Тот же период, два разных тарифа: у счёта за период есть уникальный индекс, поэтому второй
    // строкой такой счёт не выставишь. Незанятый черновик обязан обновиться под тот тариф, который
    // покупают СЕЙЧАС, иначе клиника уходит платить за тариф, которого не получит.
    const cheaperMonthly = {
      id: 'tariff-month-cheap',
      name: 'СТАРТ',
      priceMinor: 80_000,
      currency: 'RUB',
      billingPeriod: 'month',
    };
    let providerAvailable = false;
    const createIntent = vi.fn(async (input: Parameters<PaymentProviderPort['createIntent']>[0]) => {
      // Первый заход обрывается ДО заказа у провайдера (ровно так этот черновик и появился на DEV:
      // чек с нулевой позицией). Черновик остаётся незанятым — без ссылки и без заказа.
      if (!providerAvailable) throw new Error('payment_receipt_item_amount_invalid');
      return {
        providerIntentRef: `provider-${input.subjectRef}`,
        checkoutUrl: `https://pay.example/${input.subjectRef}`,
      };
    });
    const repository = createInMemorySaasBillingRepository({
      tariffs: [monthlyTariff, cheaperMonthly],
      trialPolicy: null,
    });
    const service = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      now: () => new Date('2026-08-18T00:00:00.000Z'),
      getTariffTransition: async (_organizationId, tariffId) => ({
        currentTariffId: 'seeded-current-tariff',
        targetTariffId: tariffId,
        blocks: [],
        appliesNextPeriod: true,
      }),
    });
    await seedPaidPeriod(service, repository, 'org-restaged', monthlyTariff.id);
    await service.scheduleOwnTariffChange({
      organizationId: 'org-restaged',
      tariffId: cheaperMonthly.id,
      actorId: 'clinic-owner',
    });
    await expect(service.createOwnTariffRenewalInvoice('org-restaged')).rejects.toThrow();

    // Клиника передумала: запланированная смена отменена, покупается снова текущий тариф.
    await service.cancelOwnTariffChange({ organizationId: 'org-restaged', actorId: 'clinic-owner' });
    providerAvailable = true;
    const raisedAfterCancel = await service.createOwnTariffRenewalInvoice('org-restaged');

    expect(raisedAfterCancel).toMatchObject({
      tariffId: monthlyTariff.id,
      amountMinor: monthlyTariff.priceMinor,
      tariffBillingPeriod: monthlyTariff.billingPeriod,
      servicePeriodStartsAt: '2026-09-18T00:00:00.000Z',
      servicePeriodEndsAt: '2026-10-18T00:00:00.000Z',
    });
    expect(createIntent.mock.calls.at(-1)?.[0]).toMatchObject({
      amountMinor: monthlyTariff.priceMinor,
    });
  });

  it('счёт, на который у провайдера уже есть заказ, не переписывается под другой тариф', async () => {
    // Обратная сторона того же правила и граница, за которую обновление не заходит. Заказ,
    // который провайдер уже держит, — настоящий: он выставлен на конкретную сумму, и человек
    // может платить по нему прямо сейчас. Переписать нашу копию такого счёта значит развести
    // деньги и запись о них: провайдер возьмёт старую сумму за тариф, который в счёте уже другой.
    // Отказ дорогой (деньги) и молчаливый (обе стороны по отдельности выглядят правдоподобно).
    const cheaperMonthly = {
      id: 'tariff-month-cheap',
      name: 'СТАРТ',
      priceMinor: 80_000,
      currency: 'RUB',
      billingPeriod: 'month',
    };
    const { repository, service, createIntent } = createService([monthlyTariff, cheaperMonthly]);
    await seedPaidPeriod(service, repository, 'org-claimed', monthlyTariff.id);

    const claimed = await service.createOwnTariffRenewalInvoice('org-claimed');
    expect(claimed).toMatchObject({
      tariffId: monthlyTariff.id,
      amountMinor: monthlyTariff.priceMinor,
      providerInvoiceRef: `provider-${claimed.id}`,
    });

    await service.scheduleOwnTariffChange({
      organizationId: 'org-claimed',
      tariffId: cheaperMonthly.id,
      actorId: 'clinic-owner',
    });
    const raisedAgain = await service.createOwnTariffRenewalInvoice('org-claimed');

    expect(raisedAgain).toMatchObject({
      id: claimed.id,
      tariffId: monthlyTariff.id,
      amountMinor: monthlyTariff.priceMinor,
      providerInvoiceRef: `provider-${claimed.id}`,
    });
    // И второго заказа у провайдера не появилось: счёт остался тем же самым.
    expect(createIntent).toHaveBeenCalledTimes(1);
  });
});

// Владелец, 18.08 (правка того же дня): срок жизни счёта — ОДНА админ-настройка, действующая на
// КАЖДЫЙ счёт, а не константа в коде и не поле в форме выставления. Провал, который эти проверки
// ловят: путь выставления, который «забыли» подключить к настройке и который поэтому молча живёт
// по своему сроку. Проверяется весь список путей, а не два из пяти.
// Арбитр: верните в любом из этих путей `SAAS_BILLING_INVOICE_VALIDITY_DAYS` вместо
// `provider.invoiceValidityDays` — соответствующее ожидание покраснеет.
describe('срок жизни счёта берётся из настройки на КАЖДОМ пути выставления', () => {
  const ISSUED_AT = '2026-08-02T00:00:00.000Z';
  /** 7 дней от ISSUED_AT — заведомо не дефолтные 30, иначе проверка не отличит настройку от константы. */
  const EXPECTED_EXPIRES_AT = '2026-08-09T00:00:00.000Z';

  const settingsWithValidityDays = (invoiceValidityDays: number) => ({
    getSaasBillingPaymentProviderValue: async () => ({
      defaultProviderId: 'mock',
      providers: [{ id: 'mock', label: 'Mock', enabled: true, shopId: 's', apiKey: 'k' }],
      lifecyclePolicy: { invoiceValidityDays },
    }),
  });

  it('счёт, выставленный администратором вручную, живёт настроенный срок', async () => {
    const createIntent = vi.fn(async () => ({
      providerIntentRef: 'provider-invoice-1',
      checkoutUrl: 'https://yookassa.example.test/checkout-1',
    }));
    const repository = createInMemorySaasBillingRepository();
    const service = createSaasBillingService({
      repository,
      settings: settingsWithValidityDays(7),
      resolvePaymentProvider: () => ({ supportsInvoice: true, createIntent }) as never,
      now: () => new Date(ISSUED_AT),
    });
    await service.assignManualTariff({
      organizationId: 'org-validity',
      tariffId: 'tariff-validity',
      audit: { actorId: 'operator', reason: 'test seed' },
    });

    const issued = await service.createManualSaasBillingInvoice({
      organizationId: 'org-validity',
      amountMinor: 5_000,
      currency: 'RUB',
      description: 'Счёт за тариф',
    });

    expect(issued.expiresAt).toBe(EXPECTED_EXPIRES_AT);
    expect(createIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice: { description: 'Счёт за тариф', expiresAt: EXPECTED_EXPIRES_AT },
      }),
    );
  });

  it('счёт продления, поднятый клиникой из кабинета, живёт тот же настроенный срок', async () => {
    const createSaasBillingInvoice = vi.fn(async (input: { expiresAt: string }) => ({
      invoice: { ...invoice, expiresAt: input.expiresAt },
      created: true,
    }));
    const service = createSaasBillingService({
      repository: {
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription-1',
          currentTariffId: 'tariff-1',
          purchasedTariffPriceMinor: 10_000,
          tariffId: 'tariff-1',
          billingPeriod: 'month' as const,
          currentPeriodStartsAt: null,
          currentPeriodEndsAt: null,
          savedPaymentMethodId: null,
          additionalSeatPriceMinor: null,
          currency: 'RUB',
        }),
        createSaasBillingInvoice,
        attachSaasBillingInvoiceProviderIntent: async (input: unknown) => ({
          ...invoice,
          ...(input as object),
        }),
      } as unknown as SaasBillingRepositoryPort,
      settings: settingsWithValidityDays(7),
      resolvePaymentProvider: () =>
        ({
          createIntent: async () => ({
            providerIntentRef: 'provider-intent-1',
            checkoutUrl: 'https://yookassa.example.test/checkout-1',
          }),
        }) as never,
      now: () => new Date(ISSUED_AT),
    });

    await service.createOwnTariffRenewalInvoice('org-1');

    expect(createSaasBillingInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: EXPECTED_EXPIRES_AT }),
    );
  });

  it('счёт, поднятый фоновым тиком продления, живёт тот же настроенный срок', async () => {
    const createSaasBillingRenewalInvoiceIfAbsent = vi.fn(async (input: { expiresAt: string }) => ({
      invoice: { ...invoice, id: 'invoice-tick', expiresAt: input.expiresAt },
      created: true,
    }));
    const service = createSaasBillingService({
      repository: {
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        listSaasBillingSubscriptionsDueForRenewal: async () => [
          {
            saasBillingSubscriptionId: 'subscription-1',
            organizationId: 'org-1',
            tariffId: 'tariff-1',
            billingPeriod: 'month' as const,
            currentPeriodEndsAt: '2026-08-01T00:00:00.000Z',
            savedPaymentMethodId: null,
            autopayConsentedAt: null,
            autopayRevokedAt: null,
          },
        ],
        promoteDueSaasBillingPaidInvoice: async () => false,
        createSaasBillingRenewalInvoiceIfAbsent,
        attachSaasBillingInvoiceProviderIntent: async (input: unknown) => ({
          ...invoice,
          ...(input as object),
        }),
      } as unknown as SaasBillingRepositoryPort,
      settings: settingsWithValidityDays(7),
      resolvePaymentProvider: () =>
        ({
          createIntent: async () => ({
            providerIntentRef: 'provider-intent-1',
            checkoutUrl: 'https://yookassa.example.test/checkout-1',
          }),
        }) as never,
      now: () => new Date(ISSUED_AT),
    });

    await service.runDueSaasBillingRenewals();

    expect(createSaasBillingRenewalInvoiceIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: EXPECTED_EXPIRES_AT }),
    );
  });

  it('счёт за место сверх тарифа живёт тот же настроенный срок, а не до конца периода услуги', async () => {
    const createSeatOverageInvoiceIfNeeded = vi.fn(async (input: { expiresAt: string }) => ({
      outcome: 'invoice' as const,
      invoice: { ...invoice, invoiceKind: 'seat_overage' as const, expiresAt: input.expiresAt },
      created: true,
    }));
    const service = createSaasBillingService({
      repository: {
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription-1',
          currentTariffId: 'tariff-1',
          purchasedTariffPriceMinor: 10_000,
          tariffId: 'tariff-1',
          billingPeriod: 'month' as const,
          currentPeriodStartsAt: '2026-08-01T00:00:00.000Z',
          currentPeriodEndsAt: '2026-09-01T00:00:00.000Z',
          savedPaymentMethodId: null,
          additionalSeatPriceMinor: 1_000,
          currency: 'RUB',
        }),
        createSeatOverageInvoiceIfNeeded,
        attachSaasBillingInvoiceProviderIntent: async (input: unknown) => ({
          ...invoice,
          ...(input as object),
        }),
      } as unknown as SaasBillingRepositoryPort,
      settings: settingsWithValidityDays(7),
      resolvePaymentProvider: () =>
        ({
          createIntent: async () => ({
            providerIntentRef: 'provider-intent-1',
            checkoutUrl: 'https://yookassa.example.test/checkout-1',
          }),
        }) as never,
      now: () => new Date(ISSUED_AT),
    });

    await service.purchaseSeatOverage({
      organizationId: 'org-1',
      quote: seatQuote({ organizationId: 'org-1', purchaseKey: 'req-1', priceMinor: 1_000 }),
    });

    expect(createSeatOverageInvoiceIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: EXPECTED_EXPIRES_AT }),
    );
  });

  it('счёт за апгрейд тарифа с пропорцией живёт тот же настроенный срок', async () => {
    const createProratedTariffUpgradeInvoice = vi.fn(async (input: { expiresAt: string }) => ({
      outcome: 'checkout' as const,
      invoice: { ...invoice, expiresAt: input.expiresAt },
      created: true,
    }));
    const service = createSaasBillingService({
      repository: {
        ...SAAS_REPO_BILLING_PERIOD_STUB,
        createProratedTariffUpgradeInvoice,
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription-1',
          currentTariffId: 'tariff-1',
          purchasedTariffPriceMinor: 10_000,
          tariffId: 'tariff-1',
          billingPeriod: 'month' as const,
          currentPeriodStartsAt: '2026-08-01T00:00:00.000Z',
          currentPeriodEndsAt: '2026-09-01T00:00:00.000Z',
          savedPaymentMethodId: null,
          additionalSeatPriceMinor: null,
          currency: 'RUB',
        }),
        attachSaasBillingInvoiceProviderIntent: async (input: unknown) => ({
          ...invoice,
          ...(input as object),
        }),
      } as unknown as SaasBillingRepositoryPort,
      settings: settingsWithValidityDays(7),
      getTariffTransition: async () => ({
        currentTariffId: 'tariff-1',
        targetTariffId: 'tariff-2',
        blocks: [],
        appliesNextPeriod: false,
      }),
      resolvePaymentProvider: () =>
        ({
          createIntent: async () => ({
            providerIntentRef: 'provider-intent-1',
            checkoutUrl: 'https://yookassa.example.test/checkout-1',
          }),
        }) as never,
      now: () => new Date(ISSUED_AT),
    });

    await service.scheduleOwnTariffChange({
      organizationId: 'org-1',
      tariffId: 'tariff-2',
      actorId: 'operator',
    });

    expect(createProratedTariffUpgradeInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: EXPECTED_EXPIRES_AT }),
    );
  });

  it('без заданной настройки счёт живёт документированный дефолт', async () => {
    const createIntent = vi.fn(async () => ({
      providerIntentRef: 'provider-invoice-default',
      checkoutUrl: 'https://yookassa.example.test/checkout-default',
    }));
    const service = createSaasBillingService({
      repository: createInMemorySaasBillingRepository(),
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'mock',
          providers: [{ id: 'mock', label: 'Mock', enabled: true, shopId: 's', apiKey: 'k' }],
        }),
      },
      resolvePaymentProvider: () => ({ supportsInvoice: true, createIntent }) as never,
      now: () => new Date(ISSUED_AT),
    });
    await service.assignManualTariff({
      organizationId: 'org-validity-default',
      tariffId: 'tariff-validity-default',
      audit: { actorId: 'operator', reason: 'test seed' },
    });

    const issued = await service.createManualSaasBillingInvoice({
      organizationId: 'org-validity-default',
      amountMinor: 5_000,
      currency: 'RUB',
      description: 'Счёт за тариф',
    });

    expect(issued.expiresAt).toBe('2026-09-01T00:00:00.000Z');
  });

  // Свойство, которое правка срока НЕ должна была сломать: два клика по одной форме — один счёт.
  // Ключ идемпотентности хешит ДЕНЬ выставления, а не срок; поэтому смена настройки между кликами
  // не имеет права родить второй счёт на те же деньги.
  it('двойной клик остаётся одним счётом, даже если срок между кликами переставили', async () => {
    const createIntent = vi.fn(async () => ({
      providerIntentRef: `provider-invoice-${createIntent.mock.calls.length}`,
      checkoutUrl: `https://yookassa.example.test/checkout-${createIntent.mock.calls.length}`,
    }));
    const repository = createInMemorySaasBillingRepository();
    let invoiceValidityDays = 7;
    const service = createSaasBillingService({
      repository,
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'mock',
          providers: [{ id: 'mock', label: 'Mock', enabled: true, shopId: 's', apiKey: 'k' }],
          lifecyclePolicy: { invoiceValidityDays },
        }),
      },
      resolvePaymentProvider: () => ({ supportsInvoice: true, createIntent }) as never,
      now: () => new Date(ISSUED_AT),
    });
    await service.assignManualTariff({
      organizationId: 'org-validity-idem',
      tariffId: 'tariff-validity-idem',
      audit: { actorId: 'operator', reason: 'test seed' },
    });
    const request = {
      organizationId: 'org-validity-idem',
      amountMinor: 5_000,
      currency: 'RUB',
      description: 'Счёт за тариф',
    };

    const first = await service.createManualSaasBillingInvoice(request);
    invoiceValidityDays = 21;
    const second = await service.createManualSaasBillingInvoice({ ...request });

    expect(second.id).toBe(first.id);
    expect(second.expiresAt).toBe(EXPECTED_EXPIRES_AT);
    expect(createIntent).toHaveBeenCalledTimes(1);
  });
});
