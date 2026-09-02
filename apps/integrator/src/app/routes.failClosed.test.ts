import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  resolveActiveOrganizationIdForChannelMock,
  resolveDedicatedClinicBotOrganizationMock,
  reportIntegratorIsolationFailureMock,
} = vi.hoisted(() => ({
  resolveActiveOrganizationIdForChannelMock: vi.fn(),
  resolveDedicatedClinicBotOrganizationMock: vi.fn(),
  reportIntegratorIsolationFailureMock: vi.fn(),
}));

vi.mock('../integrations/bersoncare/sendSmsRoute.js', () => ({
  registerBersoncareSendSmsRoute: vi.fn(async () => undefined),
}));
vi.mock('../integrations/bersoncare/sendEmailRoute.js', () => ({
  registerBersoncareSendEmailRoute: vi.fn(async () => undefined),
}));
vi.mock('../integrations/bersoncare/relayOutboundRoute.js', () => ({
  registerBersoncareRelayOutboundRoute: vi.fn(async () => undefined),
}));
vi.mock('../integrations/bersoncare/operatorAlertRelayRoute.js', () => ({
  registerOperatorAlertRelayRoute: vi.fn(async () => undefined),
}));
vi.mock('../integrations/bersoncare/requestContactRoute.js', () => ({
  registerBersoncareRequestContactRoute: vi.fn(async () => undefined),
}));
vi.mock('../integrations/bersoncare/sendOtpRoute.js', () => ({
  registerBersoncareSendOtpRoute: vi.fn(async () => undefined),
}));
vi.mock('../integrations/bersoncare/bookingLifecycleRoute.js', () => ({
  registerBersoncareBookingLifecycleRoute: vi.fn(async () => undefined),
}));
vi.mock('../infra/db/client.js', () => ({ createDbPort: vi.fn(() => ({})) }));
vi.mock('../infra/db/messengerStaffIds.js', () => ({
  createMessengerStaffIdsResolver: vi.fn(() => async () => false),
}));
vi.mock('../infra/db/repos/platformUserByChannel.js', () => ({
  resolveActiveOrganizationIdForChannel: resolveActiveOrganizationIdForChannelMock,
}));
vi.mock('../infra/db/clinicDedicatedBotBindings.js', () => ({
  resolveDedicatedClinicBotOrganization: resolveDedicatedClinicBotOrganizationMock,
}));
vi.mock('../infra/db/clinicDeliveryCredentials.js', () => ({
  createClinicDeliveryCredentialResolver: vi.fn(() => async () => null),
}));
vi.mock('../config/env.js', () => ({
  env: { APP_BASE_URL: 'https://webapp.test', NODE_ENV: 'development' },
  integratorWebhookSecret: () => 'test-webhook-secret',
}));
vi.mock('../integrations/telegram/longPolling.js', () => ({
  startTelegramLongPolling: vi.fn(),
}));
vi.mock('../infra/observability/saasIsolationTelemetry.js', () => ({
  reportIntegratorIsolationFailure: reportIntegratorIsolationFailureMock,
}));
vi.mock('../infra/operatorIncident/reportOperatorFailure.js', () => ({
  recordOperatorFailureIncident: vi.fn(async () => ({ id: 'incident', occurrenceCount: 1 })),
}));
vi.mock('../infra/adapters/integrationRuntimeConfig.js', () => ({
  getSmscRuntimeConfig: vi.fn(async () => ({ enabled: false, apiKey: '', baseUrl: '' })),
  getTelegramRuntimeConfig: vi.fn(async () => ({
    enabled: false,
    mode: 'webhook',
    botToken: '',
    webhookSecret: '',
    sendMenuOnButtonPress: false,
  })),
}));

import { registerRoutes } from './routes.js';
import type { AppDeps, MessengerWebappEntryIdentityDeps } from './di.js';

const apps: Array<Awaited<ReturnType<typeof Fastify>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

beforeEach(() => {
  vi.clearAllMocks();
  resolveActiveOrganizationIdForChannelMock.mockResolvedValue(null);
  resolveDedicatedClinicBotOrganizationMock.mockResolvedValue(null);
});

async function captureResolvers(): Promise<{
  telegram: MessengerWebappEntryIdentityDeps;
  max: MessengerWebappEntryIdentityDeps;
}> {
  let telegram: MessengerWebappEntryIdentityDeps | undefined;
  let max: MessengerWebappEntryIdentityDeps | undefined;
  const app = Fastify({ logger: false });
  apps.push(app);
  const deps = {
    healthCheckDb: async () => true,
    dispatchPort: {},
    dbWritePort: {},
    idempotencyPort: {},
    eventGateway: {},
    webappEventsPort: {},
    registerTelegramWebhookRoutes: async (
      _instance: unknown,
      captured: MessengerWebappEntryIdentityDeps,
    ) => {
      telegram = captured;
    },
    registerMaxWebhookRoutes: async (
      _instance: unknown,
      captured: MessengerWebappEntryIdentityDeps,
    ) => {
      max = captured;
    },
  } as unknown as AppDeps;

  await registerRoutes(app, deps);
  await app.ready();
  if (!telegram || !max) throw new Error('webhook resolvers were not wired');
  return { telegram, max };
}

describe('composition-root messenger resolvers fail closed', () => {
  it('preserves a genuine null binding', async () => {
    const { telegram } = await captureResolvers();

    await expect(
      telegram.resolveOrganizationIdForMessengerIdentity?.('42', 'telegram'),
    ).resolves.toBeNull();
    await expect(
      telegram.resolveDedicatedClinicBotOrganization?.('fingerprint'),
    ).resolves.toBeNull();
  });

  it('propagates binding DB failures after reporting isolation telemetry', async () => {
    const identityError = new Error('identity resolver unavailable');
    const dedicatedError = new Error('dedicated resolver unavailable');
    resolveActiveOrganizationIdForChannelMock.mockRejectedValueOnce(identityError);
    resolveDedicatedClinicBotOrganizationMock.mockRejectedValueOnce(dedicatedError);
    const { telegram, max } = await captureResolvers();

    await expect(
      telegram.resolveOrganizationIdForMessengerIdentity?.('42', 'telegram'),
    ).rejects.toBe(identityError);
    await expect(max.resolveDedicatedClinicBotOrganization?.('fingerprint')).rejects.toBe(
      dedicatedError,
    );
    expect(reportIntegratorIsolationFailureMock).toHaveBeenCalledTimes(2);
  });
});
