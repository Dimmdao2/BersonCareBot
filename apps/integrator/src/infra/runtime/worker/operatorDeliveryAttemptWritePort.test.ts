import { runWithDbInfraPrincipal, runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';
import type { DeliveryAdapter, OutgoingIntent } from '../../../kernel/contracts/index.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultDispatchPort } from '../../adapters/dispatchPort.js';
import { _resetDevRedirectActiveCache } from '../../../shared/devDeliveryRedirect.js';
import { createOperatorAwareDeliveryAttemptWritePort } from './operatorDeliveryAttemptWritePort.js';

const originalTelegramAdminId = process.env.TELEGRAM_ADMIN_ID;

const intent: OutgoingIntent = {
  type: 'message.send',
  meta: { eventId: 'op-inc:test:9001', occurredAt: '2026-07-16T00:00:00.000Z', source: 'telegram' },
  payload: {
    recipient: { chatId: 9001 },
    message: { text: 'sensitive operator alert text' },
    delivery: { channels: ['telegram'], maxAttempts: 1 },
  },
};

function buildHarness() {
  const query = vi.fn().mockResolvedValue({ rows: [{ record_operator_delivery_attempt: 1 }], rowCount: 1 });
  const tenantWrite = vi.fn().mockResolvedValue(undefined);
  const send = vi.fn().mockResolvedValue({});
  const adapter: DeliveryAdapter = { canHandle: () => true, send };
  const writePort = createOperatorAwareDeliveryAttemptWritePort({
    db: { query } as never,
    tenantWritePort: { writeDb: tenantWrite },
  });
  const dispatch = createDefaultDispatchPort({ adapters: [adapter], writePort });
  return { dispatch, query, send, tenantWrite };
}

describe('operator delivery attempt production wiring', () => {
  afterEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.DEV_DELIVERY_REDIRECT;
    delete process.env.DEV_REDIRECT_DISABLE_DEFAULTS;
    delete process.env.DEV_REDIRECT_TELEGRAM_CHAT_ID;
    delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
    if (originalTelegramAdminId === undefined) delete process.env.TELEGRAM_ADMIN_ID;
    else process.env.TELEGRAM_ADMIN_ID = originalTelegramAdminId;
    _resetDevRedirectActiveCache();
  });

  it('uses the real dispatch chain and narrow operational audit function after provider success', async () => {
    process.env.NODE_ENV = 'production';
    _resetDevRedirectActiveCache();
    const harness = buildHarness();
    await runWithDbInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, () =>
      harness.dispatch.dispatchOutgoing(intent),
    );
    expect(harness.send).toHaveBeenCalledTimes(1);
    expect(harness.tenantWrite).not.toHaveBeenCalled();
    expect(harness.query).toHaveBeenCalledWith(
      'SELECT app.record_operator_delivery_attempt($1, $2, $3, $4, $5)',
      ['op-inc:test:9001', 'telegram', 'success', 1, null],
    );
    expect(JSON.stringify(harness.query.mock.calls)).not.toContain('sensitive operator alert text');
    expect(JSON.stringify(harness.query.mock.calls)).not.toContain('9001}');
  });

  it('audits a dev-suppressed send without reaching an adapter or tenant transaction', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DEV_REDIRECT_DISABLE_DEFAULTS = '1';
    delete process.env.TELEGRAM_ADMIN_ID;
    _resetDevRedirectActiveCache();
    const harness = buildHarness();
    await runWithDbInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, () =>
      harness.dispatch.dispatchOutgoing(intent),
    );
    expect(harness.send).not.toHaveBeenCalled();
    expect(harness.tenantWrite).not.toHaveBeenCalled();
    expect(harness.query.mock.calls[0]?.[1]).toEqual([
      'op-inc:test:9001', 'telegram', 'success', 1, 'dev_redirect_suppressed',
    ]);
  });

  it('rejects another infra source and delegates an organization principal', async () => {
    process.env.NODE_ENV = 'production';
    _resetDevRedirectActiveCache();
    const wrongInfra = buildHarness();
    await expect(
      runWithDbInfraPrincipal({ source: 'worker:job-queue-drain' }, () =>
        wrongInfra.dispatch.dispatchOutgoing(intent),
      ),
    ).rejects.toThrow('requires tenant/integrator or exact delivery-worker principal');
    expect(wrongInfra.query).not.toHaveBeenCalled();

    const tenant = buildHarness();
    await runWithDbOrganizationPrincipal('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', () =>
      tenant.dispatch.dispatchOutgoing(intent),
    );
    expect(tenant.tenantWrite).toHaveBeenCalledWith(expect.objectContaining({ type: 'delivery.attempt.log' }));
    expect(tenant.query).not.toHaveBeenCalled();
  });
});
