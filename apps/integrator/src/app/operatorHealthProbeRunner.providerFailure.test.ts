/**
 * Поведение: отказ провайдера, замеченный ПРОБОЙ, будит человека с первого раза.
 *
 * Владелец 21.07: «отказ провайдера — красный, пейджить с первого появления». До этой правки
 * проба складывала любую причину в `telegram_probe_failed` и ждала порога подряд идущих промахов,
 * поэтому телеграмный `401 Unauthorized` молчал столько же, сколько обычный таймаут, и не попадал
 * в путь «пейджить с первого появления» вообще: тот отбирает инциденты по
 * `direction = 'outbound_delivery_provider'`, а проба писала `'outbound'`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reportOperatorFailure =
  vi.fn<(input: { direction: string; integration: string; errorClass: string }) => Promise<void>>(
    async () => {},
  );
const recordOperatorOutboundProbeRun = vi.fn();
const resolveOpenOperatorOutboundProbeIncidents = vi.fn(async () => 0);
const getMe = vi.fn();

vi.mock('../infra/operatorIncident/reportOperatorFailure.js', () => ({ reportOperatorFailure }));
vi.mock('../infra/db/repos/operatorHealthDrizzle.js', () => ({
  recordOperatorOutboundProbeRun,
  resolveOpenOperatorOutboundProbeIncidents,
}));
vi.mock('../integrations/telegram/client.js', () => ({
  getBotInstance: async () => ({ api: { getMe } }),
}));
vi.mock('../integrations/max/client.js', () => ({ getMaxBotInfo: async () => ({ id: 1 }) }));
vi.mock('../infra/adapters/integrationRuntimeConfig.js', () => ({
  getTelegramRuntimeConfig: async () => ({ enabled: true }),
  getMaxRuntimeConfig: async () => ({ enabled: false }),
}));
vi.mock('../integrations/google-calendar/runtimeConfig.js', () => ({
  getGoogleCalendarConfig: async () => ({ enabled: false }),
  listGoogleCalendarProbeOrganizationIds: async () => [],
}));
vi.mock('../integrations/google-calendar/probe.js', () => ({
  probeGoogleCalendarAccess: async () => undefined,
}));
vi.mock('../infra/observability/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG } = await import('./operatorHealthProbeSettings.js');
const { runOperatorHealthProbes, resetOperatorHealthProbeAttemptFloorForTest } =
  await import('./operatorHealthProbeRunner.js');

const config = {
  ...DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG,
  max: { ...DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG.max, enabled: false },
  google_calendar: { ...DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG.google_calendar, enabled: false },
  telegram: { ...DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG.telegram, consecutiveFailures: 3 },
};

async function runWithTelegramError(message: string) {
  getMe.mockRejectedValueOnce(new Error(message));
  // Первый промах подряд: порог (три) заведомо НЕ достигнут.
  recordOperatorOutboundProbeRun.mockResolvedValueOnce({
    consecutiveFailRuns: 1,
    consecutiveFailures: { telegram: 1 },
  });
  await runOperatorHealthProbes({
    dispatchPort: {} as never,
    config,
    probes: ['telegram'],
  });
}

describe('проба здоровья: отказ провайдера против обычного промаха', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOperatorHealthProbeAttemptFloorForTest();
  });

  it('дано: телеграм отвечает 401 на ПЕРВОМ промахе → когда проба отработала → тогда инцидент открыт в том же пространстве, что и отказ настоящей отправки, и пейджится сразу', async () => {
    await runWithTelegramError('401: Unauthorized');

    expect(reportOperatorFailure).toHaveBeenCalledTimes(1);
    expect(reportOperatorFailure.mock.calls[0]![0]).toMatchObject({
      direction: 'outbound_delivery_provider',
      integration: 'telegram',
      errorClass: 'provider_auth_rejected',
    });
  });

  it('дано: телеграм отвалился по таймауту на первом промахе → когда проба отработала → тогда инцидента нет: обычный промах по-прежнему ждёт порога', async () => {
    await runWithTelegramError('probe_timeout');

    expect(reportOperatorFailure).not.toHaveBeenCalled();
  });

  it('дано: телеграм ответил успешно → когда проба отработала → тогда закрываются оба пространства ключей, а не только старое', async () => {
    getMe.mockResolvedValueOnce({ id: 1 });
    recordOperatorOutboundProbeRun.mockResolvedValueOnce({
      consecutiveFailRuns: 0,
      consecutiveFailures: {},
    });

    await runOperatorHealthProbes({ dispatchPort: {} as never, config, probes: ['telegram'] });

    expect(resolveOpenOperatorOutboundProbeIncidents).toHaveBeenCalledWith('telegram');
  });
});
