import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMaxBotInfoMock = vi.hoisted(() => vi.fn());
const maxConfigMock = vi.hoisted(() => ({ enabled: true, apiKey: 'test-api-key-16chars' }));
const fetchRubitimeScheduleMock = vi.hoisted(() => vi.fn());
const pickTripleMock = vi.hoisted(() => vi.fn());
const reportOperatorFailureMock = vi.hoisted(() => vi.fn());
const resolvePrefixMock = vi.hoisted(() => vi.fn());

vi.mock('../integrations/max/client.js', () => ({
  getMaxBotInfo: getMaxBotInfoMock,
}));
vi.mock('../integrations/max/config.js', () => ({
  maxConfig: maxConfigMock,
}));
vi.mock('../integrations/rubitime/client.js', () => ({
  fetchRubitimeSchedule: fetchRubitimeScheduleMock,
}));
vi.mock('../integrations/rubitime/db/bookingProfilesRepo.js', () => ({
  pickAnyActiveRubitimeScheduleTriple: pickTripleMock,
}));
vi.mock('../infra/operatorIncident/reportOperatorFailure.js', () => ({
  reportOperatorFailure: reportOperatorFailureMock,
}));
vi.mock('../infra/db/repos/operatorHealthDrizzle.js', () => ({
  resolveOpenOperatorIncidentsByDedupKeyPrefix: resolvePrefixMock,
}));
vi.mock('../infra/db/client.js', () => ({
  createDbPort: vi.fn(() => ({ query: vi.fn() })),
}));

import { runOperatorHealthProbes } from './operatorHealthProbeRunner.js';

describe('runOperatorHealthProbes', () => {
  const dispatchPort = { dispatchOutgoing: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    vi.clearAllMocks();
    resolvePrefixMock.mockResolvedValue(0);
    reportOperatorFailureMock.mockResolvedValue(undefined);
    pickTripleMock.mockResolvedValue({ branchId: 1, cooperatorId: 2, serviceId: 3 });
    fetchRubitimeScheduleMock.mockResolvedValue({});
  });

  it('MAX ok resolves probe prefix; Rubitime ok resolves prefix', async () => {
    getMaxBotInfoMock.mockResolvedValue({ id: 1 });
    const r = await runOperatorHealthProbes({ dispatchPort });
    expect(r.max).toBe('ok');
    expect(r.rubitime).toBe('ok');
    expect(reportOperatorFailureMock).not.toHaveBeenCalled();
    expect(resolvePrefixMock).toHaveBeenCalledWith('outbound:max:');
    expect(resolvePrefixMock).toHaveBeenCalledWith('outbound:rubitime:');
  });

  it('MAX fail reports failure and does not resolve', async () => {
    getMaxBotInfoMock.mockResolvedValue(null);
    const r = await runOperatorHealthProbes({ dispatchPort });
    expect(r.max).toBe('fail');
    expect(reportOperatorFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        integration: 'max',
        errorClass: 'max_probe_failed',
      }),
    );
    expect(resolvePrefixMock).not.toHaveBeenCalledWith('outbound:max:');
  });

  it('Rubitime schedule throw reports failure', async () => {
    getMaxBotInfoMock.mockResolvedValue({ id: 1 });
    fetchRubitimeScheduleMock.mockRejectedValue(new Error('RUBITIME_HTTP_500'));
    const r = await runOperatorHealthProbes({ dispatchPort });
    expect(r.rubitime).toBe('fail');
    expect(reportOperatorFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        integration: 'rubitime',
        errorClass: 'rubitime_get_schedule_failed',
      }),
    );
  });

  it('Rubitime skipped when no active booking profile', async () => {
    getMaxBotInfoMock.mockResolvedValue({ id: 1 });
    pickTripleMock.mockResolvedValue(null);
    const r = await runOperatorHealthProbes({ dispatchPort });
    expect(r.rubitime).toBe('skipped_not_configured');
    expect(fetchRubitimeScheduleMock).not.toHaveBeenCalled();
  });

  it('MAX probe fails when getMaxBotInfo exceeds timeout', async () => {
    vi.useFakeTimers();
    try {
      pickTripleMock.mockResolvedValue(null);
      getMaxBotInfoMock.mockImplementation(() => new Promise(() => {}));
      const p = runOperatorHealthProbes({ dispatchPort });
      await vi.advanceTimersByTimeAsync(15_000);
      const r = await p;
      expect(r.max).toBe('fail');
      expect(reportOperatorFailureMock).toHaveBeenCalledWith(
        expect.objectContaining({
          integration: 'max',
          errorClass: 'max_probe_failed',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
