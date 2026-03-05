/**
 * Composition root для app-слоя после рефакторинга.
 * Модуль связывает инфраструктурные зависимости и отдает
 * единую точку входа EventGateway для входящих адаптеров.
 */
import type { FastifyInstance } from 'fastify';
import { appSettings } from '../config/appSettings.js';
import { env } from '../config/env.js';
import { healthCheckDb } from '../infra/db/client.js';
import { createDbReadPort } from '../infra/db/readPort.js';
import { createDbWritePort } from '../infra/db/writePort.js';
import { createPostgresJobQueue } from '../infra/queue/postgresJobQueue.js';
import { createEventGateway } from '../kernel/index.js';
import { createIncomingEventPipeline } from '../kernel/eventGateway/incomingEventPipeline.js';
import type {
  DbReadPort,
  DispatchPort,
  DbWritePort,
  EventGateway,
  IdempotencyPort,
  QueuePort,
} from '../kernel/contracts/index.js';
import { logger } from '../infra/observability/logger.js';
import { createInMemoryIdempotencyPort } from '../infra/db/repos/idempotencyKeys.js';
import { createDefaultDispatchPort } from '../infra/dispatcher/default.js';
import { createSmscClient } from '../integrations/smsc/client.js';
import { createSmscStub } from '../integrations/smsc/stub.js';
import type { SmsClient } from '../integrations/smsc/types.js';
import { registerTelegramWebhookRoutes } from '../integrations/telegram/webhook.js';
import { registerRubitimeWebhookRoutes } from '../integrations/rubitime/webhook.js';

/**
 * Регистраторы интеграций инжектируются,
 * чтобы wiring app-слоя оставался стабильным во время миграции.
 */
export type TelegramRoutesRegistrar = (
  app: FastifyInstance,
  deps: {
    eventGateway: EventGateway;
  },
) => Promise<void> | void;

export type RubitimeRoutesRegistrar = (
  app: FastifyInstance,
  deps: {
    eventGateway: EventGateway;
  },
) => Promise<void> | void;

/** Опциональные внешние зависимости для buildDeps на период миграции. */
export type BuildDepsInput = {
  dbReadPort?: DbReadPort;
  dbWritePort?: DbWritePort;
  queuePort?: QueuePort;
  dispatchPort?: DispatchPort;
  idempotencyPort?: IdempotencyPort;
  registerTelegramWebhookRoutes?: TelegramRoutesRegistrar;
  registerRubitimeWebhookRoutes?: RubitimeRoutesRegistrar;
};

/** Зависимости app-слоя, используемые routes/server. */
export type AppDeps = {
  healthCheckDb: () => Promise<boolean>;
  smsClient: SmsClient;
  dispatchPort: DispatchPort;
  eventGateway: EventGateway;
  registerTelegramWebhookRoutes?: TelegramRoutesRegistrar;
  registerRubitimeWebhookRoutes?: RubitimeRoutesRegistrar;
};

/** Собирает полностью связанный набор зависимостей app-слоя. */
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
  const dbReadPort = input.dbReadPort ?? createDbReadPort();
  const queuePort = input.queuePort ?? createPostgresJobQueue({
    retryDelaySeconds: appSettings.runtime.worker.retryDelaySeconds,
  });

  const dispatchPort =
    input.dispatchPort ??
    createDefaultDispatchPort({
      smsClient,
      writePort: dbWritePort,
    });

  const idempotencyPort = input.idempotencyPort ?? createInMemoryIdempotencyPort();

  const pipeline = createIncomingEventPipeline({
    readPort: dbReadPort,
    writePort: dbWritePort,
    queuePort,
    dispatchPort,
  });

  const eventGateway = createEventGateway({
    writePort: dbWritePort,
    dispatchPort,
    idempotencyPort,
    pipeline,
  });

  return {
    healthCheckDb,
    smsClient,
    dispatchPort,
    eventGateway,
    registerTelegramWebhookRoutes: input.registerTelegramWebhookRoutes ?? registerTelegramWebhookRoutes,
    registerRubitimeWebhookRoutes: input.registerRubitimeWebhookRoutes ?? registerRubitimeWebhookRoutes,
  };
}