/**
 * Controlled DEV proof for all four messenger webhook surfaces.
 *
 * The process uses the production composition root and real DEV database ports, but:
 * - disables provider bootstrap mutations (menu/command setup);
 * - disables every redirect target and passthrough recipient;
 * - proves outgoing replies stopped at PRE_FORK_DEV_DELIVERY_REDIRECT_SUPPRESS;
 * - releases every durable idempotency key created by the probe.
 */
import { randomInt, randomUUID } from 'node:crypto';
import type {
  DbWriteMutation,
  DbWritePort,
  IdempotencyPort,
} from '../../kernel/contracts/index.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function disableEveryDeliveryTarget(): void {
  process.env.NODE_ENV = 'development';
  process.env.DEV_DELIVERY_REDIRECT = '1';
  process.env.DEV_REDIRECT_DISABLE_DEFAULTS = '1';
  for (const key of [
    'DEV_REDIRECT_TELEGRAM_CHAT_ID',
    'DEV_DELIVERY_REDIRECT_CHAT_ID',
    'TELEGRAM_ADMIN_ID',
    'DEV_REDIRECT_MAX_USER_ID',
    'DEV_REDIRECT_PHONE',
    'DEV_REDIRECT_EMAIL',
    'DEV_REDIRECT_WEB_PUSH_USER_ID',
    'DEV_REDIRECT_PASSTHROUGH_TELEGRAM',
    'DEV_REDIRECT_PASSTHROUGH_MAX',
    'DEV_REDIRECT_PASSTHROUGH_PHONES',
    'DEV_REDIRECT_PASSTHROUGH_EMAILS',
    'DEV_REDIRECT_PASSTHROUGH_WEB_PUSH',
  ]) {
    process.env[key] = '';
  }
}

type RouteResult = { status: number; ok: boolean };
type ProbeChannel = 'telegram' | 'max';

function parseRouteResult(response: {
  statusCode: number;
  json(): unknown;
}): RouteResult {
  const body = response.json();
  const ok =
    body !== null &&
    typeof body === 'object' &&
    'ok' in body &&
    (body as { ok?: unknown }).ok === true;
  return { status: response.statusCode, ok };
}

async function main(): Promise<void> {
  process.env.NODE_ENV = 'development';
  process.env.DEV_REDIRECT_DISABLE_DEFAULTS = '0';
  await import('../../config/loadEnv.js');

  const redirectModule = await import('../../shared/devDeliveryRedirect.js');
  const originalTargets = redirectModule.getDevRedirectTargets();
  assert(originalTargets.telegramChatId !== null, 'DEV Telegram test identity is not configured');
  assert(originalTargets.maxUserId !== null, 'DEV MAX test identity is not configured');

  disableEveryDeliveryTarget();
  redirectModule._resetDevRedirectActiveCache();
  const disabledTargets = redirectModule.getDevRedirectTargets();
  assert(
    Object.values(disabledTargets).every((value) => value === null),
    'strict no-send process still has a redirect target',
  );

  const [
    { buildApp },
    { registerTelegramWebhookRoutes },
    { registerMaxWebhookRoutes },
    { createDbPort, closeDb },
    { createPostgresIdempotencyPort },
  ] = await Promise.all([
    import('../../app/server.js'),
    import('../../integrations/telegram/webhook.js'),
    import('../../integrations/max/webhook.js'),
    import('../db/client.js'),
    import('../db/repos/idempotencyKeys.js'),
  ]);

  const realIdempotencyPort = createPostgresIdempotencyPort(createDbPort());
  const acquiredKeys = new Set<string>();
  const trackingIdempotencyPort: IdempotencyPort = {
    async tryAcquire(key, ttlSec) {
      const acquired = await realIdempotencyPort.tryAcquire(key, ttlSec);
      if (acquired) acquiredKeys.add(key);
      return acquired;
    },
    async release(key) {
      acquiredKeys.delete(key);
      await realIdempotencyPort.release?.(key);
    },
  };

  const suppressedChannels: string[] = [];
  const deliveryAuditPort: DbWritePort = {
    async writeDb(mutation: DbWriteMutation): Promise<void> {
      if (
        mutation.type === 'delivery.attempt.log' &&
        mutation.params.reason === 'dev_redirect_suppressed' &&
        typeof mutation.params.channel === 'string'
      ) {
        suppressedChannels.push(mutation.params.channel);
      }
    },
  };

  const telegramFingerprint = 'e'.repeat(64);
  const maxFingerprint = 'f'.repeat(64);
  // Existing named DEV fixture organization; used only as the already-proven dedicated endpoint binding.
  const dedicatedProbeOrganizationId = 'a0000000-0000-4000-8000-000000000001';
  const probeOrganizationByChannel = new Map<ProbeChannel, string>();
  const telegramProbeSecret = randomUUID();
  const maxProbeSecret = randomUUID();
  const app = await buildApp({
    idempotencyPort: trackingIdempotencyPort,
    dispatchAttemptWritePort: deliveryAuditPort,
    registerTelegramWebhookRoutes: async (instance, deps) => {
      probeOrganizationByChannel.set('telegram', dedicatedProbeOrganizationId);
      await registerTelegramWebhookRoutes(instance, {
        ...deps,
        setupProviderSurface: false,
        getRuntimeConfig: async () => ({
          enabled: true,
          botToken: 'provider-free-live-probe',
          webhookSecret: telegramProbeSecret,
          sendMenuOnButtonPress: false,
        }),
        resolveOrganizationIdForMessengerIdentity: async () =>
          probeOrganizationByChannel.get('telegram') ?? null,
        resolveDedicatedClinicBotOrganization: async (fingerprint) =>
          fingerprint === telegramFingerprint ? dedicatedProbeOrganizationId : null,
      });
    },
    registerMaxWebhookRoutes: async (instance, deps) => {
      probeOrganizationByChannel.set('max', dedicatedProbeOrganizationId);
      await registerMaxWebhookRoutes(instance, {
        ...deps,
        setupProviderSurface: false,
        getRuntimeConfig: async () => ({
          enabled: true,
          apiKey: 'provider-free-live-probe',
          webhookSecret: maxProbeSecret,
          baseUrl: 'https://provider-free.invalid',
        }),
        resolveOrganizationIdForMessengerIdentity: async () =>
          probeOrganizationByChannel.get('max') ?? null,
        resolveDedicatedClinicBotOrganization: async (fingerprint) =>
          fingerprint === maxFingerprint ? dedicatedProbeOrganizationId : null,
      });
    },
  });

  const telegramPayload = (updateId: number) => ({
    update_id: updateId,
    message: {
      message_id: updateId,
      text: '/start',
      from: { id: originalTargets.telegramChatId },
      chat: { id: originalTargets.telegramChatId },
    },
  });
  const maxPayload = (messageId: string) => ({
    update_type: 'message_created',
    timestamp: Date.now(),
    message: {
      recipient: { chat_id: originalTargets.maxUserId },
      sender: { user_id: originalTargets.maxUserId },
      body: { mid: messageId, text: '/start' },
    },
  });

  try {
    const telegramUpdate = randomInt(1_000_000_000, 2_000_000_000);
    const results = {
      telegramGeneric: parseRouteResult(
        await app.inject({
          method: 'POST',
          url: '/webhook/telegram',
          headers: { 'x-telegram-bot-api-secret-token': telegramProbeSecret },
          payload: telegramPayload(telegramUpdate),
        }),
      ),
      telegramDedicated: parseRouteResult(
        await app.inject({
          method: 'POST',
          url: `/webhook/telegram/dedicated/${telegramFingerprint}`,
          payload: telegramPayload(telegramUpdate + 1),
        }),
      ),
      maxGeneric: parseRouteResult(
        await app.inject({
          method: 'POST',
          url: '/webhook/max',
          headers: { 'x-max-bot-api-secret': maxProbeSecret },
          payload: maxPayload(randomUUID()),
        }),
      ),
      maxDedicated: parseRouteResult(
        await app.inject({
          method: 'POST',
          url: `/webhook/max/dedicated/${maxFingerprint}`,
          payload: maxPayload(randomUUID()),
        }),
      ),
    };

    assert(
      Object.values(results).every((result) => result.status === 200 && result.ok),
      `one or more webhook routes failed: ${JSON.stringify(results)}`,
    );
    assert(suppressedChannels.includes('telegram'), 'Telegram reply did not hit the no-send gate');
    assert(suppressedChannels.includes('max'), 'MAX reply did not hit the no-send gate');

    process.stdout.write(
      `${JSON.stringify({
        routes: results,
        preForkSuppressed: {
          count: suppressedChannels.length,
          channels: [...new Set(suppressedChannels)].sort(),
        },
        durableKeysCreated: acquiredKeys.size,
      })}\n`,
    );
  } finally {
    const keysToClean = [...acquiredKeys];
    await Promise.all(keysToClean.map((key) => realIdempotencyPort.release?.(key)));
    acquiredKeys.clear();
    await app.close();
    await closeDb();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `check-live-incoming-no-send: FAIL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
