/**
 * Composition root для app-слоя после рефакторинга.
 * Модуль связывает инфраструктурные зависимости и отдает
 * единую точку входа EventGateway для входящих адаптеров.
 */
import type { FastifyInstance } from 'fastify';
import { appSettings } from '../config/appSettings.js';
import { createDbPort, healthCheckDb } from '../infra/db/client.js';
import { createDbReadPort } from '../infra/db/readPort.js';
import { createDbWritePort } from '../infra/db/writePort.js';
import { createContentPort } from '../infra/adapters/contentPort.js';
import { createContextQueryPort } from '../infra/adapters/contextQueryPort.js';
import { createPostgresJobQueue } from '../infra/adapters/jobQueuePort.js';
import { createEventGateway } from '../kernel/index.js';
import { createIncomingEventPipeline } from '../kernel/eventGateway/incomingEventPipeline.js';
import type {
  ContentPort,
  ContextQueryPort,
  DbReadPort,
  DispatchPort,
  DbWritePort,
  EventGateway,
  IdempotencyPort,
  QueuePort,
} from '../kernel/contracts/index.js';
import { logger } from '../infra/observability/logger.js';
import { createPostgresIdempotencyPort } from '../infra/db/repos/idempotencyKeys.js';
import { createDefaultDispatchPort } from '../infra/adapters/dispatchPort.js';
import { createActorResolutionPort } from '../infra/adapters/actorResolutionPort.js';
import { createDeliveryDefaultsPort } from '../infra/adapters/deliveryDefaultsPort.js';
import { createTemplatePort } from '../infra/adapters/templatePort.js';
import { createOrchestrator } from '../kernel/orchestrator/index.js';
import { createSmscClient } from '../integrations/smsc/client.js';
import { smscConfig } from '../integrations/smsc/config.js';
import { createSmscDeliveryAdapter } from '../integrations/smsc/deliveryAdapter.js';
import { createSmscStub } from '../integrations/smsc/stub.js';
import type { SmsClient } from '../integrations/smsc/types.js';
import { createTelegramDeliveryAdapter } from '../integrations/telegram/deliveryAdapter.js';
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
  contentPort: ContentPort;
  contextQueryPort: ContextQueryPort;
  eventGateway: EventGateway;
  registerTelegramWebhookRoutes?: TelegramRoutesRegistrar;
  registerRubitimeWebhookRoutes?: RubitimeRoutesRegistrar;
};

/** Собирает полностью связанный набор зависимостей app-слоя. */
export function buildDeps(input: BuildDepsInput = {}): AppDeps {
  const smsClient: SmsClient = smscConfig.enabled
    ? smscConfig.apiKey
      ? createSmscClient({
          apiKey: smscConfig.apiKey,
          baseUrl: smscConfig.baseUrl,
          log: logger,
        })
      : createSmscStub(logger)
    : createSmscStub(logger);

  if (smscConfig.enabled && !smscConfig.apiKey) {
    logger.warn({ smscEnabled: smscConfig.enabled }, 'smsc enabled but api key is not set, using stub');
  }

  const dbPort = createDbPort();
  const dbWritePort = input.dbWritePort ?? createDbWritePort({ db: dbPort });
  const dbReadPort = input.dbReadPort ?? createDbReadPort({ db: dbPort });
  const queuePort = input.queuePort ?? createPostgresJobQueue({
    db: dbPort,
    retryDelaySeconds: appSettings.runtime.worker.retryDelaySeconds,
  });

  const contentPort = createContentPort();
  const contextQueryPort = createContextQueryPort({ readPort: dbReadPort });
  const templatePort = createTemplatePort({ contentPort });
  const orchestrator = createOrchestrator({
    contentPort,
    contextQueryPort,
  });

  const adapters = [
    createTelegramDeliveryAdapter(),
    createSmscDeliveryAdapter({ smsClient }),
  ];

  const dispatchPort =
    input.dispatchPort ??
    createDefaultDispatchPort({
      adapters,
      readPort: dbReadPort,
      writePort: dbWritePort,
    });

  const idempotencyPort = input.idempotencyPort ?? createPostgresIdempotencyPort(dbPort);

  const actorResolutionPort = createActorResolutionPort({ writePort: dbWritePort });
  const deliveryDefaultsPort = createDeliveryDefaultsPort();
  const pipeline = createIncomingEventPipeline({
    readPort: dbReadPort,
    writePort: dbWritePort,
    queuePort,
    dispatchPort,
    orchestrator,
    templatePort,
    actorResolutionPort,
    deliveryDefaultsPort,
  });

  const eventGateway = createEventGateway({
    idempotencyPort,
    pipeline,
  });

  return {
    healthCheckDb,
    smsClient,
    dispatchPort,
    contentPort,
    contextQueryPort,
    eventGateway,
    registerTelegramWebhookRoutes: input.registerTelegramWebhookRoutes ?? registerTelegramWebhookRoutes,
    registerRubitimeWebhookRoutes: input.registerRubitimeWebhookRoutes ?? registerRubitimeWebhookRoutes,
  };
}