import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMaxBotInfoMock = vi.hoisted(() => vi.fn());
const maxConfigMock = vi.hoisted(() => ({ enabled: true, apiKey: 'test-api-key-16chars' }));
const reportOperatorFailureMock = vi.hoisted(() => vi.fn());
const resolvePrefixMock = vi.hoisted(() => vi.fn());
const recordProbeRunMock = vi.hoisted(() => vi.fn());
const getBotInstanceMock = vi.hoisted(() => vi.fn());
const getMeMock = vi.hoisted(() => vi.fn());
const telegramConfigMock = vi.hoisted(() => ({ botToken: '' }));
const getGoogleCalendarConfigMock = vi.hoisted(() => vi.fn());
const listGoogleCalendarProbeOrganizationIdsMock = vi.hoisted(() => vi.fn());
const probeGoogleCalendarAccessMock = vi.hoisted(() => vi.fn());

vi.mock('../integrations/max/client.js', () => ({
  getMaxBotInfo: getMaxBotInfoMock,
}));
vi.mock('../integrations/max/config.js', () => ({
  maxConfig: maxConfigMock,
}));
vi.mock('../infra/operatorIncident/reportOperatorFailure.js', () => ({
  reportOperatorFailure: reportOperatorFailureMock,
}));
vi.mock('../infra/db/repos/operatorHealthDrizzle.js', () => ({
  resolveOpenOperatorIncidentsByDedupKeyPrefix: resolvePrefixMock,
  recordOperatorOutboundProbeRun: recordProbeRunMock,
}));
vi.mock('../integrations/telegram/client.js', () => ({
  getBotInstance: getBotInstanceMock,
}));
vi.mock('../integrations/telegram/config.js', () => ({
  telegramConfig: telegramConfigMock,
}));
vi.mock('../integrations/google-calendar/runtimeConfig.js', () => ({
  getGoogleCalendarConfig: getGoogleCalendarConfigMock,
  listGoogleCalendarProbeOrganizationIds: listGoogleCalendarProbeOrganizationIdsMock,
}));
vi.mock('../integrations/google-calendar/probe.js', () => ({
  probeGoogleCalendarAccess: probeGoogleCalendarAccessMock,
}));

import {
  resetOperatorHealthProbeAttemptFloorForTest,
  runOperatorHealthProbes,
} from './operatorHealthProbeRunner.js';
import { DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG } from './operatorHealthProbeSettings.js';

describe('runOperatorHealthProbes', () => {
  const dispatchPort = { dispatchOutgoing: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    vi.clearAllMocks();
    resetOperatorHealthProbeAttemptFloorForTest();
    telegramConfigMock.botToken = '';
    resolvePrefixMock.mockResolvedValue(0);
    recordProbeRunMock.mockResolvedValue({ consecutiveFailRuns: 0, consecutiveFailures: {} });
    reportOperatorFailureMock.mockResolvedValue(undefined);
    getMeMock.mockResolvedValue({ id: 1 });
    getBotInstanceMock.mockReturnValue({ api: { getMe: getMeMock } });
    getGoogleCalendarConfigMock.mockResolvedValue({ enabled: false });
    listGoogleCalendarProbeOrganizationIdsMock.mockResolvedValue([]);
    probeGoogleCalendarAccessMock.mockResolvedValue(undefined);
  });

  it('MAX ok resolves probe prefix', async () => {
    getMaxBotInfoMock.mockResolvedValue({ id: 1 });
    const r = await runOperatorHealthProbes({ dispatchPort });
    expect(r.max).toBe('ok');
    expect(reportOperatorFailureMock).not.toHaveBeenCalled();
    expect(resolvePrefixMock).toHaveBeenCalledWith('outbound:max:');
  });

  it('Telegram first failure is recorded but does not raise an incident', async () => {
    getMaxBotInfoMock.mockResolvedValue({ id: 1 });
    telegramConfigMock.botToken = 'tg-token';
    getMeMock.mockRejectedValue(new Error('telegram_down'));
    const r = await runOperatorHealthProbes({ dispatchPort });
    expect(r.telegram).toBe('fail');
    expect(reportOperatorFailureMock).not.toHaveBeenCalled();
  });

  it('Google Calendar second failure raises an incident', async () => {
    getMaxBotInfoMock.mockResolvedValue({ id: 1 });
    listGoogleCalendarProbeOrganizationIdsMock.mockResolvedValue([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ]);
    getGoogleCalendarConfigMock.mockResolvedValue({
      enabled: true,
      refreshToken: 'rt',
      calendarId: 'cal',
      clientId: 'cid',
      clientSecret: 'sec',
      redirectUri: 'http://localhost',
    });
    probeGoogleCalendarAccessMock.mockRejectedValue(new Error('GOOGLE_CALENDAR_HTTP_403'));
    recordProbeRunMock.mockResolvedValue({
      consecutiveFailRuns: 2,
      consecutiveFailures: { google_calendar: 2 },
    });
    const r = await runOperatorHealthProbes({ dispatchPort });
    expect(r.google_calendar).toBe('fail');
    expect(getGoogleCalendarConfigMock).toHaveBeenCalledWith(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    expect(reportOperatorFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        integration: 'google_calendar',
        errorClass: 'google_calendar_probe_failed',
      }),
    );
  });

  it('uses the configured channel threshold before creating the paging incident', async () => {
    listGoogleCalendarProbeOrganizationIdsMock.mockResolvedValue([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ]);
    getGoogleCalendarConfigMock.mockResolvedValue({
      enabled: true,
      refreshToken: 'rt',
      calendarId: 'cal',
      clientId: 'cid',
      clientSecret: 'sec',
      redirectUri: 'http://localhost',
    });
    probeGoogleCalendarAccessMock.mockRejectedValue(new Error('GOOGLE_CALENDAR_HTTP_403'));
    recordProbeRunMock.mockResolvedValue({
      consecutiveFailRuns: 2,
      consecutiveFailures: { google_calendar: 2 },
    });
    const config = structuredClone(DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG);
    config.google_calendar.consecutiveFailures = 4;

    await runOperatorHealthProbes({
      dispatchPort,
      config,
      probes: ['google_calendar'],
    });

    expect(reportOperatorFailureMock).not.toHaveBeenCalled();
  });

  it('probes a real clinic-scoped Google Calendar connection', async () => {
    const firstOrganizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const connectedOrganizationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    listGoogleCalendarProbeOrganizationIdsMock.mockResolvedValue([
      firstOrganizationId,
      connectedOrganizationId,
    ]);
    getGoogleCalendarConfigMock.mockImplementation(async (organizationId: string) => ({
      enabled: organizationId === connectedOrganizationId,
      refreshToken: organizationId === connectedOrganizationId ? 'rt' : '',
      calendarId: organizationId === connectedOrganizationId ? 'cal' : '',
      clientId: 'cid',
      clientSecret: 'sec',
      redirectUri: 'http://localhost',
    }));

    const result = await runOperatorHealthProbes({
      dispatchPort,
      probes: ['google_calendar'],
    });

    expect(result.google_calendar).toBe('ok');
    expect(result.details.google_calendarConfiguredOrganizations).toBe('2');
    expect(getGoogleCalendarConfigMock).toHaveBeenNthCalledWith(1, firstOrganizationId);
    expect(getGoogleCalendarConfigMock).toHaveBeenNthCalledWith(2, connectedOrganizationId);
    expect(probeGoogleCalendarAccessMock).toHaveBeenCalledTimes(1);
  });

  it('honours the configured quiet window without contacting providers', async () => {
    const config = structuredClone(DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG);
    config.quietUntil = new Date(Date.now() + 60_000).toISOString();

    const result = await runOperatorHealthProbes({ dispatchPort, config });

    expect(result.details.quietWindow).toBe('active');
    expect(getMaxBotInfoMock).not.toHaveBeenCalled();
    expect(recordProbeRunMock).not.toHaveBeenCalled();
  });

  it('MAX probe fails when getMaxBotInfo exceeds timeout', async () => {
    vi.useFakeTimers();
    try {
      getMaxBotInfoMock.mockImplementation(() => new Promise(() => {}));
      const p = runOperatorHealthProbes({ dispatchPort });
      await vi.advanceTimersByTimeAsync(5_000);
      const r = await p;
      expect(r.max).toBe('fail');
      expect(reportOperatorFailureMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('MAX fail reports failure and does not resolve', async () => {
    getMaxBotInfoMock.mockResolvedValue(null);
    recordProbeRunMock.mockResolvedValue({
      consecutiveFailRuns: 1,
      consecutiveFailures: { max: 1 },
    });
    const r = await runOperatorHealthProbes({ dispatchPort });
    expect(r.max).toBe('fail');
    expect(reportOperatorFailureMock).not.toHaveBeenCalled();
    expect(resolvePrefixMock).not.toHaveBeenCalledWith('outbound:max:');
    expect(recordProbeRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        max: 'fail',
        telegram: 'skipped_not_configured',
        probed: expect.any(Array),
      }),
    );
    expect(r.details.consecutiveFailRuns).toBe('1');
  });

  it('does not immediately re-run a provider when recording the previous attempt failed', async () => {
    getMaxBotInfoMock.mockResolvedValue({ id: 1 });
    recordProbeRunMock.mockRejectedValueOnce(new Error('database unavailable'));

    await runOperatorHealthProbes({ dispatchPort, probes: ['max'] });
    await runOperatorHealthProbes({ dispatchPort, probes: ['max'] });

    expect(getMaxBotInfoMock).toHaveBeenCalledTimes(1);
    expect(recordProbeRunMock).toHaveBeenCalledTimes(1);
  });
});
