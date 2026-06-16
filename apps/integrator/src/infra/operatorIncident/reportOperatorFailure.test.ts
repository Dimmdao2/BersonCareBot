import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openOrTouchMock = vi.hoisted(() => vi.fn());
const enqueueMock = vi.hoisted(() => vi.fn());
const loadConfigMock = vi.hoisted(() => vi.fn());
const loadListsMock = vi.hoisted(() => vi.fn());
const sendMaxMessageMock = vi.hoisted(() => vi.fn());
const maxConfigMock = vi.hoisted(() => ({ enabled: false }));

vi.mock('../db/repos/operatorHealthDrizzle.js', () => ({
  openOrTouchOperatorIncident: openOrTouchMock,
}));
vi.mock('../db/client.js', () => ({
  createDbPort: vi.fn(() => ({})),
}));
vi.mock('../db/repos/outgoingDeliveryQueue.js', () => ({
  enqueueOutgoingDeliveryIfAbsent: enqueueMock,
}));
vi.mock('./operatorHealthAlertConfigIntegrator.js', () => ({
  loadOperatorHealthAlertConfigIntegrator: loadConfigMock,
  loadAdminMessengerIdLists: loadListsMock,
}));
vi.mock('../../integrations/max/client.js', () => ({
  sendMaxMessage: sendMaxMessageMock,
}));
vi.mock('../../integrations/max/config.js', () => ({
  maxConfig: maxConfigMock,
}));
const getMaxApiKeyMock = vi.hoisted(() => vi.fn().mockResolvedValue(''));
vi.mock('../../integrations/max/runtimeConfig.js', () => ({
  getMaxApiKey: getMaxApiKeyMock,
}));

import { reportOperatorFailure } from './reportOperatorFailure.js';

describe('reportOperatorFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openOrTouchMock.mockResolvedValue({ id: 'incident-uuid-1', occurrenceCount: 1 });
    enqueueMock.mockResolvedValue(true);
    loadConfigMock.mockResolvedValue({
      topics: { critical_enabled: true, digest_enabled: true, account_conflicts: true },
      channels: {
        critical: { telegram: true, max: false, web_push: false },
        digest: { telegram: true, max: false, web_push: false },
        account_conflicts: { telegram: true, max: false, web_push: false },
      },
    });
    loadListsMock.mockResolvedValue({ telegram: ['4242', '5252'], max: [] });
  });

  it('enqueues telegram delivery with incident uuid, not recipient id', async () => {
    await reportOperatorFailure({
      direction: 'outbound',
      integration: 'max',
      errorClass: 'max_send_failed',
      alertLines: ['send failed'],
    });

    expect(enqueueMock).toHaveBeenCalledTimes(2);
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payloadJson: expect.objectContaining({ incidentId: 'incident-uuid-1' }),
      }),
    );
    const firstPayload = enqueueMock.mock.calls[0]![1] as { payloadJson: { incidentId: string } };
    expect(firstPayload.payloadJson.incidentId).toBe('incident-uuid-1');
    expect(firstPayload.payloadJson.incidentId).not.toBe('4242');
  });

  it('does not enqueue for probe error classes (3-strike policy)', async () => {
    await reportOperatorFailure({
      direction: 'outbound',
      integration: 'max',
      errorClass: 'max_probe_failed',
      alertLines: ['probe failed'],
    });

    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('skips enqueue when critical block disabled', async () => {
    loadConfigMock.mockResolvedValue({
      topics: { critical_enabled: false, digest_enabled: true, account_conflicts: true },
      channels: {
        critical: { telegram: true, max: false, web_push: false },
        digest: { telegram: true, max: false, web_push: false },
        account_conflicts: { telegram: true, max: false, web_push: false },
      },
    });

    await reportOperatorFailure({
      direction: 'outbound',
      integration: 'max',
      errorClass: 'max_probe_failed',
      alertLines: ['probe failed'],
    });

    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('does not enqueue for inbound_webhook (P8 burst policy)', async () => {
    await reportOperatorFailure({
      direction: 'inbound_webhook',
      integration: 'telegram',
      errorClass: 'webhook_parse_failed',
      alertLines: ['parse failed'],
    });

    expect(openOrTouchMock).toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('does not alert on repeat occurrence', async () => {
    openOrTouchMock.mockResolvedValue({ id: 'incident-uuid-1', occurrenceCount: 2 });

    await reportOperatorFailure({
      direction: 'outbound',
      integration: 'max',
      errorClass: 'max_send_failed',
      alertLines: ['send failed'],
    });

    expect(enqueueMock).not.toHaveBeenCalled();
  });

  describe('MAX dev-suppress guard (P5)', () => {
    beforeEach(() => {
      // Enable max channel so the guard code is reached
      maxConfigMock.enabled = true;
      loadConfigMock.mockResolvedValue({
        topics: { critical_enabled: true, digest_enabled: true, account_conflicts: true },
        channels: {
          critical: { telegram: false, max: true, web_push: false },
          digest: { telegram: false, max: false, web_push: false },
          account_conflicts: { telegram: false, max: false, web_push: false },
        },
      });
      loadListsMock.mockResolvedValue({ telegram: [], max: ['9999'] });
      getMaxApiKeyMock.mockResolvedValue('max-api-key');
    });

    afterEach(() => {
      maxConfigMock.enabled = false;
      vi.unstubAllEnvs();
    });

    it('does not call sendMaxMessage in non-production (dev guard)', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('ALLOW_DEV_MAX', '');

      await reportOperatorFailure({
        direction: 'outbound',
        integration: 'max',
        errorClass: 'max_send_failed',
        alertLines: ['fail'],
      });

      expect(sendMaxMessageMock).not.toHaveBeenCalled();
    });

    it('calls sendMaxMessage in production (guard passthrough)', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      await reportOperatorFailure({
        direction: 'outbound',
        integration: 'max',
        errorClass: 'max_send_failed',
        alertLines: ['fail'],
      });

      expect(sendMaxMessageMock).toHaveBeenCalledTimes(1);
      expect(sendMaxMessageMock).toHaveBeenCalledWith({ apiKey: 'max-api-key' }, { userId: 9999, text: 'fail' });
    });
  });
});
