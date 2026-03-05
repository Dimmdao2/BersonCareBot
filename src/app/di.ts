/**
 * Composition root for the refactor app layer.
 * This module wires infrastructure dependencies and exposes one EventGateway
 * entrypoint for inbound adapters.
 */
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { healthCheckDb } from '../infra/db/client.js';
import { createDbWritePort } from '../infra/db/writePort.js';
import { createEventGateway } from '../kernel/index.js';
import type {
  DispatchPort,
  DbWritePort,
  EventGateway,
  IdempotencyPort,
  IncomingEvent,
} from '../kernel/contracts/index.js';
import { executeDomainAction, processAcceptedIncomingEvent } from '../kernel/domain/index.js';
import { dispatchIntent } from '../runtime/dispatcher/dispatcher.js';
import { logger } from '../infra/observability/logger.js';
import { createInMemoryIdempotencyPort } from '../infra/db/repos/idempotencyKeys.js';
import { createDefaultDispatchPort } from '../infra/dispatch/default.js';
import { createSmscClient } from '../integrations/smsc/client.js';
import { createSmscStub } from '../integrations/smsc/stub.js';
import type { SmsClient } from '../integrations/smsc/types.js';
import { registerTelegramWebhookRoutes } from '../integrations/telegram/webhook.js';
import { registerRubitimeWebhookRoutes } from '../integrations/rubitime/webhook.js';
import { findByPhone } from '../infra/db/repos/telegramUsers.js';

/**
 * Integration registrars are injected to keep app wiring stable while
 * integration handlers are migrated incrementally.
 */
export type TelegramRoutesRegistrar = (
  app: FastifyInstance,
  deps: {
    eventGateway: EventGateway;
    onAcceptedEvent?: (event: IncomingEvent) => Promise<void>;
  },
) => Promise<void> | void;

export type RubitimeRoutesRegistrar = (
  app: FastifyInstance,
  deps: {
    eventGateway: EventGateway;
    onAcceptedEvent?: (event: IncomingEvent) => Promise<void>;
  },
) => Promise<void> | void;

/** Optional external dependencies for buildDeps during migration. */
export type BuildDepsInput = {
  dbWritePort?: DbWritePort;
  dispatchPort?: DispatchPort;
  idempotencyPort?: IdempotencyPort;
  registerTelegramWebhookRoutes?: TelegramRoutesRegistrar;
  registerRubitimeWebhookRoutes?: RubitimeRoutesRegistrar;
  onTelegramAcceptedEvent?: (event: IncomingEvent) => Promise<void>;
  onRubitimeAcceptedEvent?: (event: IncomingEvent) => Promise<void>;
};

/** App-layer dependencies consumed by routes/server. */
export type AppDeps = {
  healthCheckDb: () => Promise<boolean>;
  smsClient: SmsClient;
  dispatchPort: DispatchPort;
  eventGateway: EventGateway;
  registerTelegramWebhookRoutes?: TelegramRoutesRegistrar;
  registerRubitimeWebhookRoutes?: RubitimeRoutesRegistrar;
  onTelegramAcceptedEvent?: (event: IncomingEvent) => Promise<void>;
  onRubitimeAcceptedEvent?: (event: IncomingEvent) => Promise<void>;
};

/** Builds fully wired app dependencies for the refactor runtime. */
export function buildDeps(input: BuildDepsInput = {}): AppDeps {
  const smsClient: SmsClient = env.SMSC_ENABLED
    ? env.SMSC_API_KEY
      ? createSmscClient({
        apiKey: env.SMSC_API_KEY,
        baseUrl: env.SMSC_API_BASE_URL,
        log: logger,
      })
      : createSmscStub(logger)
    : createSmscStub(logger);

  if (env.SMSC_ENABLED && !env.SMSC_API_KEY) {
    logger.warn({ smscEnabled: env.SMSC_ENABLED }, 'smsc enabled but api key is not set, using stub');
  }

  const adminTelegramId = Number(env.ADMIN_TELEGRAM_ID);
  const dbWritePort = input.dbWritePort ?? createDbWritePort();
  const dispatchPort = input.dispatchPort ?? createDefaultDispatchPort({
    smsClient,
    writePort: dbWritePort,
    ...(Number.isFinite(adminTelegramId) ? { debugAdminChatId: adminTelegramId } : {}),
    debugForwardAllEvents: env.DEBUG_FORWARD_ALL_EVENTS_TO_ADMIN,
  });
  const idempotencyPort = input.idempotencyPort ?? createInMemoryIdempotencyPort();

  const eventGateway = createEventGateway({
    writePort: dbWritePort,
    dispatchPort,
    idempotencyPort,
    ...(Number.isFinite(adminTelegramId) ? { debugAdminChatId: adminTelegramId } : {}),
    debugForwardAllEvents: env.DEBUG_FORWARD_ALL_EVENTS_TO_ADMIN,
  });

  const onRubitimeAcceptedEvent = input.onRubitimeAcceptedEvent ?? (async (event: IncomingEvent) => {
    if (event.meta.source !== 'rubitime') return;
    await processAcceptedIncomingEvent(event, {
      adminTelegramId,
      findTelegramUserByPhone: findByPhone,
      async executeAction(action, context) {
        return executeDomainAction(action, context, { writePort: dbWritePort });
      },
      async dispatchIntent(intent) {
        await dispatchIntent(intent, [{
          canHandle: () => true,
          send: async (outgoingIntent) => dispatchPort.dispatchOutgoing(outgoingIntent),
        }]);
      },
    });
  });

  const onTelegramAcceptedEvent = input.onTelegramAcceptedEvent ?? (async (event: IncomingEvent) => {
    if (event.meta.source !== 'telegram') return;
    await processAcceptedIncomingEvent(event, {
      adminTelegramId,
      findTelegramUserByPhone: findByPhone,
      async executeAction(action, context) {
        return executeDomainAction(action, context, { writePort: dbWritePort });
      },
      async dispatchIntent(intent) {
        await dispatchIntent(intent, [{
          canHandle: () => true,
          send: async (outgoingIntent) => dispatchPort.dispatchOutgoing(outgoingIntent),
        }]);
      },
    });
  });

  return {
    healthCheckDb,
    smsClient,
    dispatchPort,
    eventGateway,
    registerTelegramWebhookRoutes: input.registerTelegramWebhookRoutes ?? registerTelegramWebhookRoutes,
    registerRubitimeWebhookRoutes: input.registerRubitimeWebhookRoutes ?? registerRubitimeWebhookRoutes,
    onTelegramAcceptedEvent,
    onRubitimeAcceptedEvent,
  };
}
