import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createSaasBillingService } from './service';
import type { SaasBillingInvoice, SaasBillingRepositoryPort } from './ports';
import { createInMemorySaasBillingRepository } from '@/infra/repos/inMemorySaasBilling';

const invoice: SaasBillingInvoice = {
  id: 'invoice-1',
  organizationId: 'org-1',
  saasBillingAccountId: 'account-1',
  saasBillingSubscriptionId: 'subscription-1',
  tariffId: 'tariff-1',
  tariffName: 'Стандарт',
  description: null,
  amountMinor: 10_000,
  currency: 'RUB',
  tariffBillingPeriod: 'month',
  servicePeriodStartsAt: '2026-08-01T00:00:00.000Z',
  servicePeriodEndsAt: '2026-09-01T00:00:00.000Z',
  expiresAt: null,
  status: 'pending',
  providerId: 'mock',
  providerInvoiceRef: null,
  providerCheckoutUrl: null,
  providerIdempotencyKey: 'renewal-1',
};

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
    current: { id: string; tariffId: string; status: 'active' } | null = null,
  ) {
    const setManualSaasBillingSubscription = vi.fn(async () => {});
    const transaction = {
      loadManualAssignmentState: async () => ({
        organization: {
          tariffId: current?.tariffId ?? null,
        },
        activeTrial: null,
        manualSaasBillingSubscription: current,
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
    const createInvoice = vi.fn(async () => ({
      providerInvoiceRef: `provider-invoice-${createInvoice.mock.calls.length}`,
      checkoutUrl: `https://yookassa.example.test/checkout-${createInvoice.mock.calls.length}`,
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
      resolvePaymentProvider: () => ({ createInvoice }) as never,
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
    expect(createInvoice).toHaveBeenCalledTimes(1);

    const different = await service.createManualSaasBillingInvoice({
      ...request,
      amountMinor: 7_000,
    });

    expect(different.id).not.toBe(first.id);
    expect(createInvoice).toHaveBeenCalledTimes(2);
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
