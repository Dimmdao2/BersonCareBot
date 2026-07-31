import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createSaasBillingService } from './service';
import type { SaasBillingInvoice, SaasBillingRepositoryPort } from './ports';

const invoice: SaasBillingInvoice = {
  id: 'invoice-1',
  organizationId: 'org-1',
  saasBillingAccountId: 'account-1',
  saasBillingSubscriptionId: 'subscription-1',
  tariffId: 'tariff-1',
  tariffName: 'Стандарт',
  amountMinor: 10_000,
  currency: 'RUB',
  tariffBillingPeriod: 'month',
  servicePeriodStartsAt: '2026-08-01T00:00:00.000Z',
  servicePeriodEndsAt: '2026-09-01T00:00:00.000Z',
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
    // The clinic-facing billing route is the same money path one layer up.
    sources.push(
      fileURLToPath(new URL('../../app/api/clinic/billing/route.ts', import.meta.url)),
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
    const createSaasBillingInvoice = vi.fn(async () => invoice);
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
          commercialAccessState: current ? 'active' : 'no_trial',
        },
        activeTrial: null,
        manualSaasBillingSubscription: current,
      }),
      requireActiveTariff: async () => ({ billingPeriod }),
      setManualSaasBillingSubscription,
      updateCompatibilityProjection: async () => ({
        tariffId: 'tariff-1',
        commercialAccessState: 'active',
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
