import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: { APP_BASE_URL: 'https://webapp.test' },
  integratorWebhookSecret: () => 'test-secret-16chars!!',
}));

import { createAppointmentsReadsPort } from './appointmentsReadsPort.js';

const originalFetch = globalThis.fetch;

describe('appointmentsReadsPort', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('getRecordByExternalId calls correct URL and maps response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        record: {
          externalRecordId: 'rec-1',
          phoneNormalized: '+79991234567',
          recordAt: '2025-06-01T10:00:00.000Z',
          status: 'created',
          payloadJson: { link: 'https://example.com/rec' },
        },
      }),
    });
    const port = createAppointmentsReadsPort();
    const record = await port.getRecordByExternalId('rec-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/api/integrator/appointments/record');
    expect(url).toContain('integratorRecordId=rec-1');
    expect(options?.headers?.['X-Bersoncare-Timestamp']).toBeDefined();
    expect(options?.headers?.['X-Bersoncare-Signature']).toBeDefined();
    expect(record).not.toBeNull();
    expect(record!.externalRecordId).toBe('rec-1');
    expect(record!.phoneNormalized).toBe('+79991234567');
    expect(record!.status).toBe('created');
    expect(record!.recordAt).toBeInstanceOf(Date);
    expect((record!.recordAt as Date).toISOString()).toBe('2025-06-01T10:00:00.000Z');
  });

  it('getRecordByExternalId returns null when record not found', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, record: null }),
    });
    const port = createAppointmentsReadsPort();
    const record = await port.getRecordByExternalId('rec-missing');
    expect(record).toBeNull();
  });

  it('getRecordByExternalId returns null on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const port = createAppointmentsReadsPort();
    const record = await port.getRecordByExternalId('rec-1');
    expect(record).toBeNull();
  });

  it('getRecordByExternalId returns null when response not ok', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ ok: false }),
    });
    const port = createAppointmentsReadsPort();
    const record = await port.getRecordByExternalId('rec-1');
    expect(record).toBeNull();
  });

  it('getActiveRecordsByPhone calls correct URL and maps response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        records: [
          {
            rubitimeRecordId: 'rec-1',
            recordAt: '2025-06-01T10:00:00.000Z',
            status: 'created',
            link: 'https://example.com/rec',
          },
        ],
      }),
    });
    const port = createAppointmentsReadsPort();
    const list = await port.getActiveRecordsByPhone('+79991234567');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/api/integrator/appointments/active-by-user');
    expect(new URL(url).searchParams.get('phoneNormalized')).toBe('+79991234567');
    expect(list).toHaveLength(1);
    expect(list[0]!.rubitimeRecordId).toBe('rec-1');
    expect(list[0]!.recordAt).toBe('2025-06-01T10:00:00.000Z');
    expect(list[0]!.status).toBe('created');
    expect(list[0]!.link).toBe('https://example.com/rec');
  });

  it('getActiveRecordsByPhone returns [] on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const port = createAppointmentsReadsPort();
    const list = await port.getActiveRecordsByPhone('+79991234567');
    expect(list).toEqual([]);
  });

  it('getActiveRecordsByPhone returns [] when response not ok', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const port = createAppointmentsReadsPort();
    const list = await port.getActiveRecordsByPhone('+79991234567');
    expect(list).toEqual([]);
  });
});
