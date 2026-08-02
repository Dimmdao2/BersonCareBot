import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createSaasBillingService } from './service';
import type {
  SaasBillingInvoice,
  SaasBillingManualAssignmentTransactionPort,
  SaasBillingRepositoryPort,
} from './ports';
import { createInMemorySaasBillingRepository } from '@/infra/repos/inMemorySaasBilling';

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

describe('Р-14: clinic tariff schedule uses the paid-subscription boundary', () => {
  function scheduledService(blocks: unknown[] = []) {
    const setManualSaasBillingSubscription = vi.fn(async () => {});
    const createIntent = vi.fn();
    const service = createSaasBillingService({
      repository: {
        runManualAssignmentTransaction: (work: (transaction: SaasBillingManualAssignmentTransactionPort) => Promise<unknown>) => work({
          loadManualAssignmentState: async () => ({
            organization: { tariffId: 'tariff-current' }, activeTrial: null,
            manualSaasBillingSubscription: {
              id: 'subscription', tariffId: 'tariff-current', status: 'active',
              currentPeriodStartsAt: '2026-08-01T00:00:00.000Z', currentPeriodEndsAt: '2026-09-01T00:00:00.000Z', pendingTariffId: null,
            },
          }),
          requireActiveTariff: async () => ({ billingPeriod: 'month' as const }),
          setManualSaasBillingSubscription,
          updateOrganizationTariffAssignment: vi.fn(), endActiveTrial: vi.fn(), appendManualAssignmentAudit: vi.fn(),
        }),
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      getTariffTransition: async () => ({ currentTariffId: 'tariff-current', targetTariffId: 'tariff-small', blocks, appliesNextPeriod: true }),
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    });
    return { service, setManualSaasBillingSubscription, createIntent };
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
    const { service, setManualSaasBillingSubscription, createIntent } = scheduledService([{ mechanic: 'patient_count' }]);

    await expect(service.scheduleOwnTariffChange({ organizationId: 'org', tariffId: 'tariff-small', actorId: 'actor' }))
      .rejects.toThrow('saas_billing_tariff_downgrade_blocked');
    expect(setManualSaasBillingSubscription).not.toHaveBeenCalled();
    expect(createIntent).not.toHaveBeenCalled();
  });

  it('refuses a self-service upgrade until the charge policy is decided', async () => {
    const { setManualSaasBillingSubscription, createIntent } = scheduledService();
    const upgradeService = createSaasBillingService({
      repository: {} as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      getTariffTransition: async () => ({ currentTariffId: 'tariff-current', targetTariffId: 'tariff-big', blocks: [], appliesNextPeriod: false }),
    });

    await expect(upgradeService.scheduleOwnTariffChange({ organizationId: 'org', tariffId: 'tariff-big', actorId: 'actor' }))
      .rejects.toThrow('saas_billing_upgrade_charge_policy_unresolved');
    expect(setManualSaasBillingSubscription).not.toHaveBeenCalled();
    expect(createIntent).not.toHaveBeenCalled();
  });

  it('rechecks the same transition before issuing a renewal intent', async () => {
    const createIntent = vi.fn();
    const service = createSaasBillingService({
      repository: {
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription', tariffId: 'tariff-small', billingPeriod: 'month' as const,
          currentTariffId: 'tariff-current',
          savedPaymentMethodId: null, currentPeriodEndsAt: '2026-09-01T00:00:00.000Z',
        }),
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent }) as never,
      getTariffTransition: async () => ({ currentTariffId: 'tariff-current', targetTariffId: 'tariff-small', blocks: [{ mechanic: 'patient_count' }], appliesNextPeriod: true }),
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
});

// §5a item 7.0 — источник события для лестницы. Поломка, которую ловит: назначение тарифа
// сохраняет подписку БЕЗ оплаченного периода (ровно так и было до 31.07: `current_period_ends_at`
// не писал ни один продуктовый путь), у резолвера нет денежного якоря, и клиника остаётся в полном
// доступе навсегда, какую бы лестницу владелец ни настроил.
// Oracle — решение владельца 31.07: «клиника выбирает нужный тариф и оплачивает; при неоплате
// первично выданный тариф работает как настроено» + длительность периода берётся из поля тарифа
// `billing_period`, а не из числа в коде (§5a item 2.6).
describe('§5a/7.0: назначение тарифа открывает ОПЛАЧЕННЫЙ ПЕРИОД с концом', () => {
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
  ) {
    const setManualSaasBillingSubscription = vi.fn(async () => {});
    const transaction = {
      loadManualAssignmentState: async () => ({
        organization: {
          tariffId: current?.tariffId ?? null,
        },
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
        runManualAssignmentTransaction: (work: (t: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({}) as never,
      now: () => new Date('2026-07-31T09:00:00.000Z'),
    });
    return { service, setManualSaasBillingSubscription };
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
});

describe('К0: early renewal does not cut the paid period short', () => {
  it('anchors the next invoice at currentPeriodEndsAt instead of the checkout click', async () => {
    const createSaasBillingInvoice = vi.fn(async () => ({ invoice, created: true }));
    const attachSaasBillingInvoiceProviderIntent = vi.fn(async () => invoice);
    const service = createSaasBillingService({
      repository: {
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
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription-1',
          tariffId: 'tariff-1',
          billingPeriod: 'month' as const,
          currentPeriodEndsAt: null,
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
      requestKey: 'stable-key',
      confirmedAmountMinor: 15_000,
      confirmedCurrency: 'RUB',
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
    const repository = createInMemorySaasBillingRepository();
    const service = createSaasBillingService({
      repository,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({
        createIntent: async () => ({
          providerIntentRef: 'provider-seat',
          checkoutUrl: 'https://pay.example/seat',
        }),
      }) as never,
      now: () => new Date('2026-08-02T00:00:00.000Z'),
    });
    await service.assignManualTariff({
      organizationId: 'org-seat',
      tariffId: 'tariff-seat',
      audit: { actorId: 'admin', reason: 'seed' },
    });
    const purchase = await service.purchaseSeatOverage({
      organizationId: 'org-seat',
      requestKey: 'request-1',
      confirmedAmountMinor: 15_000,
      confirmedCurrency: 'RUB',
    });
    if (purchase.outcome !== 'checkout') throw new Error('expected seat checkout');
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
          amountMinor: 15_000,
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

  it('rejects a partial seat refund before resolving or calling the provider', async () => {
    const resolvePaymentProvider = vi.fn();
    const service = createSaasBillingService({
      repository: {
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
    const service = createSaasBillingService({
      repository: createInMemorySaasBillingRepository(),
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'mock',
          providers: [
            { id: 'mock', label: 'Mock', enabled: true, webhookSecret: 'unused', shopId: 's', apiKey: 'k' },
          ],
        }),
      },
      resolvePaymentProvider: () => ({ supportsInvoice: true, createIntent }) as never,
    });
    await seedOrgWithTariff(service);

    const request = {
      organizationId: 'org-k4r2',
      amountMinor: 5_000,
      currency: 'RUB',
      description: 'Счёт за тариф',
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const first = await service.createManualSaasBillingInvoice(request);
    const second = await service.createManualSaasBillingInvoice({ ...request });

    expect(second.id).toBe(first.id);
    expect(second.providerCheckoutUrl).toBe(first.providerCheckoutUrl);
    expect(createIntent).toHaveBeenCalledTimes(1);
    expect(createIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 5_000,
        currency: 'RUB',
        payerRef: 'organization:org-k4r2',
        purpose: 'saas_billing_tariff_renewal',
        subjectRef: first.id,
        returnUrl: expect.stringMatching(/^https?:\/\/[^/]+\/app\/settings\?tab=billing$/),
        invoice: { description: 'Счёт за тариф', expiresAt: request.expiresAt },
      }),
    );

    const different = await service.createManualSaasBillingInvoice({
      ...request,
      amountMinor: 7_000,
    });

    expect(different.id).not.toBe(first.id);
    expect(createIntent).toHaveBeenCalledTimes(2);
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
    const createIntent = vi.fn(async () => ({
      providerIntentRef: 'manual-checkout-1',
      checkoutUrl: 'https://yookassa.example.test/manual-checkout-1',
    }));
    const service = createSaasBillingService({
      repository: {
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
