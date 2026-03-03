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
import { createOrchestrator } from '../kernel/orchestrator/index.js';
import type {
  DispatchPort,
  DbWritePort,
  EventGateway,
  IdempotencyPort,
  Orchestrator,
} from '../kernel/contracts/index.js';
import { logger } from '../infra/observability/logger.js';
import { createInMemoryIdempotencyPort } from '../infra/db/repos/idempotencyKeys.js';
import { createDefaultDispatchPort } from '../infra/dispatch/default.js';
import { createSmscClient } from '../integrations/smsc/client.js';
import { createSmscStub } from '../integrations/smsc/stub.js';
import type { SmsClient } from '../integrations/smsc/types.js';
import { registerTelegramWebhookRoutes } from '../integrations/telegram/webhook.js';
import { registerRubitimeWebhookRoutes } from '../integrations/rubitime/webhook.js';
import { registerRubitimeIframeEdgeRoute } from '../integrations/rubitime/reqSuccessIframeEdge.js';
import {
  findByPhone,
  getTelegramUserLinkData,
  notificationsPort,
  userPort,
} from '../infra/db/repos/telegramUsers.js';

/**
 * Integration registrars are injected to keep app wiring stable while
 * integration handlers are migrated incrementally.
 */
export type TelegramRoutesRegistrar = (
  app: FastifyInstance,
  deps: {
    userPort: typeof userPort;
    notificationsPort: typeof notificationsPort;
    getTelegramUserLinkData: typeof getTelegramUserLinkData;
  },
) => Promise<void> | void;

export type RubitimeRoutesRegistrar = (
  app: FastifyInstance,
  deps: { eventGateway: EventGateway },
) => Promise<void> | void;

export type RubitimeIframeRegistrar = (app: FastifyInstance) => void;

/** Optional external dependencies for buildDeps during migration. */
export type BuildDepsInput = {
  orchestrator?: Orchestrator;
  dbWritePort?: DbWritePort;
  dispatchPort?: DispatchPort;
  idempotencyPort?: IdempotencyPort;
  registerTelegramWebhookRoutes?: TelegramRoutesRegistrar;
  registerRubitimeWebhookRoutes?: RubitimeRoutesRegistrar;
  registerRubitimeReqSuccessIframeRoute?: RubitimeIframeRegistrar;
};

/** App-layer dependencies consumed by routes/server. */
export type AppDeps = {
  healthCheckDb: () => Promise<boolean>;
  smsClient: SmsClient;
  eventGateway: EventGateway;
  telegramUserPort: typeof userPort;
  notificationsPort: typeof notificationsPort;
  getTelegramUserLinkData: typeof getTelegramUserLinkData;
  registerTelegramWebhookRoutes?: TelegramRoutesRegistrar;
  registerRubitimeWebhookRoutes?: RubitimeRoutesRegistrar;
  registerRubitimeReqSuccessIframeRoute?: RubitimeIframeRegistrar;
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

  const dbWritePort = input.dbWritePort ?? createDbWritePort();
  const dispatchPort = input.dispatchPort ?? createDefaultDispatchPort({ smsClient, writePort: dbWritePort });
  const idempotencyPort = input.idempotencyPort ?? createInMemoryIdempotencyPort();
  const adminTelegramId = Number(env.ADMIN_TELEGRAM_ID);

  const eventGateway = createEventGateway({
    orchestrator: input.orchestrator ?? createOrchestrator({
      async resolveRubitimeRecipientContext(phoneNormalized) {
        const telegramUser = await findByPhone(phoneNormalized);
        const isTelegramAdmin = Boolean(
          telegramUser
            && Number.isFinite(adminTelegramId)
            && String(telegramUser.telegramId) === String(adminTelegramId),
        );
        // App-admin roles are not implemented yet; keep explicit default.
        const isAppAdmin = false;
        return {
          phoneNormalized,
          hasTelegramUser: telegramUser !== null,
          telegramUser,
          isTelegramAdmin,
          isAppAdmin,
          // TODO: use explicit "booking notifications enabled" setting when added.
          telegramNotificationsEnabled: true,
        };
      },
    }),
    writePort: dbWritePort,
    dispatchPort,
    idempotencyPort,
    debugAdminChatId: Number.isFinite(adminTelegramId) ? adminTelegramId : undefined,
    debugForwardAllEvents: env.DEBUG_FORWARD_ALL_EVENTS_TO_ADMIN,
  });

  return {
    healthCheckDb,
    smsClient,
    eventGateway,
    telegramUserPort: userPort,
    notificationsPort,
    getTelegramUserLinkData,
    registerTelegramWebhookRoutes: input.registerTelegramWebhookRoutes ?? registerTelegramWebhookRoutes,
    registerRubitimeWebhookRoutes: input.registerRubitimeWebhookRoutes ?? registerRubitimeWebhookRoutes,
    registerRubitimeReqSuccessIframeRoute: input.registerRubitimeReqSuccessIframeRoute ?? registerRubitimeIframeEdgeRoute,
  };
}
