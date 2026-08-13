import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  createDbPort: vi.fn(() => ({ query: vi.fn(), tx: vi.fn() })),
  runNamedRoot: vi.fn(
    async (_db: unknown, _identity: string, _args: readonly unknown[], _fragment: unknown) => ({
      rows: [],
    }),
  ),
}));

vi.mock('../client.js', () => ({ createDbPort: fakes.createDbPort }));
vi.mock('../runIntegratorSql.js', () => ({ runIntegratorNamedRoot: fakes.runNamedRoot }));

import { recordIntegrationWebhookOutcomeDb } from './integrationWebhookStatusDrizzle.js';

describe('integration webhook outcome exact root', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['telegram', true, 200, null, null],
    ['max', false, 200, 'webhook_auth_failed', 'Unknown bot'],
  ] as const)(
    'attests the complete %s outcome tuple',
    async (source, processedOk, httpStatusReturned, errorClass, detail) => {
      await recordIntegrationWebhookOutcomeDb({
        source,
        processedOk,
        httpStatusReturned,
        errorClass,
        detail,
      });

      expect(fakes.runNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
        'app.record_integrator_webhook_outcome(text,boolean,integer,text,text)',
        [source, processedOk, httpStatusReturned, errorClass, detail],
      ]);
    },
  );

  it('truncates diagnostic detail before it enters the signed transcript', async () => {
    await recordIntegrationWebhookOutcomeDb({
      source: 'telegram',
      processedOk: false,
      httpStatusReturned: 200,
      errorClass: 'webhook_internal_error',
      detail: 'x'.repeat(1_000),
    });

    const args = fakes.runNamedRoot.mock.calls[0]?.[2] as readonly unknown[];
    expect(args[4]).toBe(`${'x'.repeat(899)}…`);
  });
});
