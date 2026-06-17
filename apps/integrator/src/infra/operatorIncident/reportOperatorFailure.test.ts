import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openOrTouchMock = vi.hoisted(() => vi.fn());
const enqueueMock = vi.hoisted(() => vi.fn());
const loadConfigMock = vi.hoisted(() => vi.fn());
const loadListsMock = vi.hoisted(() => vi.fn());
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
vi.mock('../../integrations/max/config.js', () => ({
  maxConfig: maxConfigMock,
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

  describe('MAX channel via enqueue (P5 — migrated off direct sendMaxMessage)', () => {
    beforeEach(() => {
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
    });

    afterEach(() => {
      maxConfigMock.enabled = false;
    });

    it('enqueues one row for the max recipient on first occurrence', async () => {
      await reportOperatorFailure({
        direction: 'outbound',
        integration: 'max',
        errorClass: 'max_send_failed',
        alertLines: ['fail'],
      });

      expect(enqueueMock).toHaveBeenCalledTimes(1);
      const call = enqueueMock.mock.calls[0]![1] as {
        channel: string;
        kind: string;
        payloadJson: { incidentId: string; intent: { type: string; meta: { source: string }; payload: { recipient: { userId: number }; message: { text: string }; delivery: { channels: string[] } } } };
      };
      expect(call.channel).toBe('max');
      expect(call.kind).toBe('operator_alert');
      expect(call.payloadJson.incidentId).toBe('incident-uuid-1');
      const intent = call.payloadJson.intent;
      expect(intent.type).toBe('message.send');
      expect(intent.meta.source).toBe('max');
      expect(intent.payload.recipient.userId).toBe(9999);
      expect(intent.payload.message.text).toBe('fail');
      expect(intent.payload.delivery.channels).toContain('max');
    });

    it('enqueues one row per max recipient when multiple admin_max_ids configured', async () => {
      loadListsMock.mockResolvedValue({ telegram: [], max: ['111', '222'] });

      await reportOperatorFailure({
        direction: 'outbound',
        integration: 'max',
        errorClass: 'max_send_failed',
        alertLines: ['multi-recipient'],
      });

      expect(enqueueMock).toHaveBeenCalledTimes(2);
      const userIds = enqueueMock.mock.calls.map(
        (c) => (c[1] as { payloadJson: { intent: { payload: { recipient: { userId: number } } } } }).payloadJson.intent.payload.recipient.userId,
      );
      expect(userIds).toContain(111);
      expect(userIds).toContain(222);
    });

    it('skips max enqueue when maxConfig.enabled is false', async () => {
      maxConfigMock.enabled = false;

      await reportOperatorFailure({
        direction: 'outbound',
        integration: 'max',
        errorClass: 'max_send_failed',
        alertLines: ['fail'],
      });

      expect(enqueueMock).not.toHaveBeenCalled();
    });

    it('skips max enqueue when no admin_max_ids are configured', async () => {
      loadListsMock.mockResolvedValue({ telegram: [], max: [] });

      await reportOperatorFailure({
        direction: 'outbound',
        integration: 'max',
        errorClass: 'max_send_failed',
        alertLines: ['fail'],
      });

      expect(enqueueMock).not.toHaveBeenCalled();
    });

    it('does not enqueue when occurrence count is not 1 (repeat incident)', async () => {
      openOrTouchMock.mockResolvedValue({ id: 'incident-uuid-1', occurrenceCount: 2 });

      await reportOperatorFailure({
        direction: 'outbound',
        integration: 'max',
        errorClass: 'max_send_failed',
        alertLines: ['fail'],
      });

      expect(enqueueMock).not.toHaveBeenCalled();
    });

    it('eventId is clipped to 240 chars and includes recipient id', async () => {
      loadListsMock.mockResolvedValue({ telegram: [], max: ['42'] });

      await reportOperatorFailure({
        direction: 'outbound',
        integration: 'max',
        errorClass: 'max_send_failed',
        alertLines: ['eventid test'],
      });

      expect(enqueueMock).toHaveBeenCalledTimes(1);
      const call = enqueueMock.mock.calls[0]![1] as { eventId: string };
      expect(call.eventId).toContain('42');
      expect(call.eventId.length).toBeLessThanOrEqual(240);
    });
  });
});
