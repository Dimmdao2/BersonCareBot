/**
 * Composition root для app-слоя после рефакторинга.
 * Модуль связывает инфраструктурные зависимости и отдает
 * единую точку входа EventGateway для входящих адаптеров.
 */
import { join } from 'path';
import type { FastifyInstance } from 'fastify';
import { getAppRoot } from '../config/appRoot.js';
import { appSettings } from '../config/appSettings.js';
import { env, integratorWebhookSecret } from '../config/env.js';
import { createDbPort, healthCheckDb } from '../infra/db/client.js';
import { getProjectionHealth } from '../infra/db/repos/projectionHealth.js';
import { createDbReadPort } from '../infra/db/readPort.js';
import { createDbWritePort } from '../infra/db/writePort.js';
import { createContentPort } from '../infra/adapters/contentPort.js';
import { createContextQueryPort } from '../infra/adapters/contextQueryPort.js';
import { createPostgresJobQueue } from '../infra/adapters/jobQueuePort.js';
import { createEventGateway } from '../kernel/index.js';
import { createIncomingEventPipeline } from '../kernel/eventGateway/incomingEventPipeline.js';
import type {
  ContentCatalogPort,
  ContentPort,
  ContextQueryPort,
  DbReadPort,
  DispatchPort,
  DbWritePort,
  EventGateway,
  IdempotencyPort,
  QueuePort,
  WebappEventsPort,
} from '../kernel/contracts/index.js';
import { logger } from '../infra/observability/logger.js';
import { createPostgresIdempotencyPort } from '../infra/db/repos/idempotencyKeys.js';
import { createDefaultDispatchPort } from '../infra/adapters/dispatchPort.js';
import { createActorResolutionPort } from '../infra/adapters/actorResolutionPort.js';
import { createContentCatalogPort } from '../infra/adapters/contentCatalogPort.js';
import { createDeliveryDefaultsPort } from '../infra/adapters/deliveryDefaultsPort.js';
import { createProtectedAccessPort } from '../infra/adapters/protectedAccessPort.js';
import { createTemplatePort } from '../infra/adapters/templatePort.js';
import { createOrchestrator } from '../kernel/orchestrator/index.js';
import { createSmscClient } from '../integrations/smsc/client.js';
import { smscConfig } from '../integrations/smsc/config.js';
import { createSmscDeliveryAdapter } from '../integrations/smsc/deliveryAdapter.js';
import { createSmscStub } from '../integrations/smsc/stub.js';
import { getSmscApiKey } from '../integrations/smsc/runtimeConfig.js';
import type { SmsClient } from '../integrations/smsc/types.js';
import { maxConfig } from '../integrations/max/config.js';
import { createMaxDeliveryAdapter } from '../integrations/max/deliveryAdapter.js';
import { registerMaxWebhookRoutes } from '../integrations/max/webhook.js';
import { telegramConfig } from '../integrations/telegram/config.js';
import { createTelegramDeliveryAdapter } from '../integrations/telegram/deliveryAdapter.js';
import { registerTelegramWebhookRoutes } from '../integrations/telegram/webhook.js';
import { registerRubitimeWebhookRoutes } from '../integrations/rubitime/webhook.js';
import { defaultSupportRelayPolicy } from '../integrations/telegram/supportRelayPolicy.js';
import { createWebappEventsPort } from '../infra/adapters/webappEventsClient.js';
import { createDeliveryTargetsPort } from '../infra/adapters/deliveryTargetsPort.js';
import { createCommunicationReadsPort } from '../infra/adapters/communicationReadsPort.js';
import { createRemindersReadsPort } from '../infra/adapters/remindersReadsPort.js';
import { createRemindersWritesPort } from '../infra/adapters/remindersWritesPort.js';
import { createAppointmentsReadsPort } from '../infra/adapters/appointmentsReadsPort.js';
import { createSubscriptionMailingReadsPort } from '../infra/adapters/subscriptionMailingReadsPort.js';

/**
 * Регистраторы интеграций инжектируются,
 * чтобы wiring app-слоя оставался стабильным во время миграции.
 */
/** Injected from `routes.ts` for webapp-entry token enrichment (integrator `users.id`). */
export type MessengerWebappEntryIdentityDeps = {
  resolveIntegratorUserIdForMessenger?: (
    externalId: string,
    resource: 'telegram' | 'max',
  ) => Promise<string | undefined>;
};

export type TelegramRoutesRegistrar = (
  app: FastifyInstance,
  deps: {
    eventGateway: EventGateway;
  } & MessengerWebappEntryIdentityDeps,
) => Promise<void> | void;

export type RubitimeRoutesRegistrar = (
  app: FastifyInstance,
  deps: {
    eventGateway: EventGateway;
    webappEventsPort: WebappEventsPort;
    dispatchPort: DispatchPort;
  },
) => Promise<void> | void;

export type MaxRoutesRegistrar = (
  app: FastifyInstance,
  deps: {
    eventGateway: EventGateway;
  } & MessengerWebappEntryIdentityDeps,
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
  registerMaxWebhookRoutes?: MaxRoutesRegistrar;
};

/** Projection health snapshot for release gate. */
export type ProjectionHealthSnapshot = import('../infra/db/repos/projectionHealth.js').ProjectionHealthSnapshot;

/** Зависимости app-слоя, используемые routes/server. */
export type AppDeps = {
  healthCheckDb: () => Promise<boolean>;
  getProjectionHealth: () => Promise<ProjectionHealthSnapshot>;
  smsClient: SmsClient;
  dbWritePort: DbWritePort;
  dispatchPort: DispatchPort;
  contentPort: ContentPort;
  contentCatalogPort: ContentCatalogPort;
  contextQueryPort: ContextQueryPort;
  eventGateway: EventGateway;
  registerTelegramWebhookRoutes?: TelegramRoutesRegistrar;
  registerRubitimeWebhookRoutes?: RubitimeRoutesRegistrar;
  registerMaxWebhookRoutes?: MaxRoutesRegistrar;
  webappEventsPort: WebappEventsPort;
};

/** Собирает полностью связанный набор зависимостей app-слоя. */
export function buildDeps(input: BuildDepsInput = {}): AppDeps {
  const smsClient: SmsClient = smscConfig.enabled
    ? createSmscClient({
        getApiKey: getSmscApiKey,
        baseUrl: smscConfig.baseUrl,
        log: logger,
      })
    : createSmscStub(logger);

  const dbPort = createDbPort();
  const communicationReadsPort = createCommunicationReadsPort();
  /** Filled after `dispatchPort` is constructed (reminders reads need Telegram on display-TZ fallback). */
  const dispatchPortForReminders: { current?: DispatchPort } = {};
  /** Without webapp base URL + webhook secret, reminder product reads stay on integrator DB (safe fallback). */
  const remindersReadsPort =
    env.APP_BASE_URL && integratorWebhookSecret().length >= 16
      ? createRemindersReadsPort({
          db: dbPort,
          getDispatchPort: () => dispatchPortForReminders.current,
        })
      : undefined;
  const remindersWebappWritesPort =
    env.APP_BASE_URL && integratorWebhookSecret().length >= 16
      ? createRemindersWritesPort()
      : undefined;
  /** Same condition: appointment product reads from webapp when configured. */
  const appointmentsReadsPort =
    env.APP_BASE_URL && integratorWebhookSecret().length >= 16
      ? createAppointmentsReadsPort()
      : undefined;
  /** Subscription/mailing product reads from webapp when configured. */
  const subscriptionMailingReadsPort =
    env.APP_BASE_URL && integratorWebhookSecret().length >= 16
      ? createSubscriptionMailingReadsPort()
      : undefined;
  const dbReadPort = input.dbReadPort ?? createDbReadPort({
    db: dbPort,
    communicationReadsPort,
    ...(remindersReadsPort !== undefined ? { remindersReadsPort } : {}),
    ...(appointmentsReadsPort !== undefined ? { appointmentsReadsPort } : {}),
    ...(subscriptionMailingReadsPort !== undefined ? { subscriptionMailingReadsPort } : {}),
  });
  const webappEventsPort = createWebappEventsPort();
  const dbWritePort = input.dbWritePort ?? createDbWritePort({ db: dbPort, readPort: dbReadPort });
  const queuePort = input.queuePort ?? createPostgresJobQueue({
    db: dbPort,
    retryDelaySeconds: appSettings.runtime.worker.retryDelaySeconds,
  });

  const contentPort = createContentPort({ rootDir: join(getAppRoot(), 'src', 'content') });
  const contentCatalogPort = createContentCatalogPort();
  const deliveryTargetsPort = createDeliveryTargetsPort();
  const contextQueryPort = createContextQueryPort({
    readPort: dbReadPort,
    webappBaseUrl: env.APP_BASE_URL ?? null,
    deliveryTargetsPort,
  });
  const templatePort = createTemplatePort({ contentPort });
  const orchestrator = createOrchestrator({
    contentPort,
    contextQueryPort,
  });

  const adapters = [
    createTelegramDeliveryAdapter(),
    createSmscDeliveryAdapter({ smsClient }),
    ...(maxConfig.enabled ? [createMaxDeliveryAdapter()] : []),
  ];

  const dispatchPort =
    input.dispatchPort ??
    createDefaultDispatchPort({
      adapters,
      readPort: dbReadPort,
      writePort: dbWritePort,
    });

  dispatchPortForReminders.current = dispatchPort;

  const idempotencyPort = input.idempotencyPort ?? createPostgresIdempotencyPort(dbPort);

  const actorResolutionPort = createActorResolutionPort({ writePort: dbWritePort });
  const deliveryDefaultsPort = createDeliveryDefaultsPort();
  const protectedAccessPort = createProtectedAccessPort({ writePort: dbWritePort });
  const pipeline = createIncomingEventPipeline({
    readPort: dbReadPort,
    writePort: dbWritePort,
    queuePort,
    dispatchPort,
    orchestrator,
    templatePort,
    contentCatalogPort,
    protectedAccessPort,
    actorResolutionPort,
    deliveryDefaultsPort,
    contentPort,
    sendMenuOnButtonPress: telegramConfig.sendMenuOnButtonPress ?? false,
    supportRelayPolicy: defaultSupportRelayPolicy,
    webappEventsPort,
    deliveryTargetsPort,
    ...(remindersWebappWritesPort !== undefined ? { remindersWebappWritesPort } : {}),
  });

  const eventGateway = createEventGateway({
    idempotencyPort,
    pipeline,
  });

  const telegramRegistrar = telegramConfig.botToken
    ? (input.registerTelegramWebhookRoutes ?? registerTelegramWebhookRoutes)
    : undefined;

  const maxRegistrar =
    maxConfig.enabled
      ? (input.registerMaxWebhookRoutes ?? registerMaxWebhookRoutes)
      : undefined;

  return {
    healthCheckDb,
    getProjectionHealth: () => getProjectionHealth(dbPort),
    smsClient,
    dbWritePort,
    dispatchPort,
    contentPort,
    contentCatalogPort,
    contextQueryPort,
    eventGateway,
    webappEventsPort,
    ...(telegramRegistrar !== undefined ? { registerTelegramWebhookRoutes: telegramRegistrar } : {}),
    registerRubitimeWebhookRoutes: input.registerRubitimeWebhookRoutes ?? registerRubitimeWebhookRoutes,
    ...(maxRegistrar !== undefined ? { registerMaxWebhookRoutes: maxRegistrar } : {}),
  };
}