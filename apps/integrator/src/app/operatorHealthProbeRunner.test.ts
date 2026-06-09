import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMaxBotInfoMock = vi.hoisted(() => vi.fn());
const maxConfigMock = vi.hoisted(() => ({ enabled: true, apiKey: 'test-api-key-16chars' }));
const fetchRubitimeScheduleMock = vi.hoisted(() => vi.fn());
const pickTripleMock = vi.hoisted(() => vi.fn());
const reportOperatorFailureMock = vi.hoisted(() => vi.fn());
const resolvePrefixMock = vi.hoisted(() => vi.fn());
const recordProbeRunMock = vi.hoisted(() => vi.fn());
const getBotInstanceMock = vi.hoisted(() => vi.fn());
const getMeMock = vi.hoisted(() => vi.fn());
const telegramConfigMock = vi.hoisted(() => ({ botToken: '' }));
const getGoogleCalendarConfigMock = vi.hoisted(() => vi.fn());
const probeGoogleCalendarAccessMock = vi.hoisted(() => vi.fn());

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
  recordOperatorOutboundProbeRun: recordProbeRunMock,
}));
vi.mock('../infra/db/client.js', () => ({
  createDbPort: vi.fn(() => ({ query: vi.fn() })),
}));
vi.mock('../integrations/telegram/client.js', () => ({
  getBotInstance: getBotInstanceMock,
}));
vi.mock('../integrations/telegram/config.js', () => ({
  telegramConfig: telegramConfigMock,
}));
vi.mock('../integrations/google-calendar/runtimeConfig.js', () => ({
  getGoogleCalendarConfig: getGoogleCalendarConfigMock,
}));
vi.mock('../integrations/google-calendar/probe.js', () => ({
  probeGoogleCalendarAccess: probeGoogleCalendarAccessMock,
}));

import { runOperatorHealthProbes } from './operatorHealthProbeRunner.js';

describe('runOperatorHealthProbes', () => {
  const dispatchPort = { dispatchOutgoing: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    vi.clearAllMocks();
    telegramConfigMock.botToken = '';
    resolvePrefixMock.mockResolvedValue(0);
    recordProbeRunMock.mockResolvedValue({ consecutiveFailRuns: 0 });
    reportOperatorFailureMock.mockResolvedValue(undefined);
    pickTripleMock.mockResolvedValue({ branchId: 1, cooperatorId: 2, serviceId: 3 });
    fetchRubitimeScheduleMock.mockResolvedValue({});
    getMeMock.mockResolvedValue({ id: 1 });
    getBotInstanceMock.mockReturnValue({ api: { getMe: getMeMock } });
    getGoogleCalendarConfigMock.mockResolvedValue({ enabled: false });
    probeGoogleCalendarAccessMock.mockResolvedValue(undefined);
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
    recordProbeRunMock.mockResolvedValue({ consecutiveFailRuns: 1 });
    const r = await runOperatorHealthProbes({ dispatchPort });
    expect(r.max).toBe('fail');
    expect(reportOperatorFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        integration: 'max',
        errorClass: 'max_probe_failed',
      }),
    );
    expect(resolvePrefixMock).not.toHaveBeenCalledWith('outbound:max:');
    expect(recordProbeRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ max: 'fail', telegram: 'skipped_not_configured', anyFail: true }),
    );
    expect(r.details.consecutiveFailRuns).toBe('1');
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

  it('Telegram getMe fail reports telegram_probe_failed', async () => {
    getMaxBotInfoMock.mockResolvedValue({ id: 1 });
    pickTripleMock.mockResolvedValue(null);
    telegramConfigMock.botToken = 'tg-token';
    getMeMock.mockRejectedValue(new Error('telegram_down'));
    const r = await runOperatorHealthProbes({ dispatchPort });
    expect(r.telegram).toBe('fail');
    expect(reportOperatorFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        integration: 'telegram',
        errorClass: 'telegram_probe_failed',
      }),
    );
  });

  it('Google Calendar probe fail reports google_calendar_probe_failed', async () => {
    getMaxBotInfoMock.mockResolvedValue({ id: 1 });
    pickTripleMock.mockResolvedValue(null);
    getGoogleCalendarConfigMock.mockResolvedValue({
      enabled: true,
      refreshToken: 'rt',
      calendarId: 'cal',
      clientId: 'cid',
      clientSecret: 'sec',
      redirectUri: 'http://localhost',
    });
    probeGoogleCalendarAccessMock.mockRejectedValue(new Error('GOOGLE_CALENDAR_HTTP_403'));
    const r = await runOperatorHealthProbes({ dispatchPort });
    expect(r.google_calendar).toBe('fail');
    expect(reportOperatorFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        integration: 'google_calendar',
        errorClass: 'google_calendar_probe_failed',
      }),
    );
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
