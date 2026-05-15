/**
 * Composition root для app-слоя после рефакторинга.
 * Модуль связывает инфраструктурные зависимости и отдает
 * единую точку входа EventGateway для входящих адаптеров.
 */
import { join } from 'path';
import type { FastifyInstance } from 'fastify';
import { getAppRoot } from '../config/appRoot.js';
import { appSettings } from '../config/appSettings.js';
import { integratorWebhookSecret } from '../config/env.js';
import { getAppBaseUrl } from '../config/appBaseUrl.js';
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
  TemplatePort,
  WebappEventsPort,
} from '../kernel/contracts/index.js';
import { logger } from '../infra/observability/logger.js';
import { createPostgresIdempotencyPort } from '../infra/db/repos/idempotencyKeys.js';
import { tryConsumeStart } from '../infra/db/repos/channelUsers.js';
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
  /** Публичный origin вебаппа (`system_settings.app_base_url` / env). */
  getAppBaseUrl?: () => Promise<string>;
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
  /** Шаблоны контента (reply keyboard / inline из JSON меню). */
  templatePort: TemplatePort;
  /** Когда true, к исходящим user `message.send` в Telegram подмешивается главное reply-меню (см. executor). */
  sendMenuOnButtonPress: boolean;
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
  const communicationReadsPort = createCommunicationReadsPort({ db: dbPort });
  /** Filled after `dispatchPort` is constructed (reminders reads need Telegram on display-TZ fallback). */
  const dispatchPortForReminders: { current?: DispatchPort } = {};
  /** Without webhook secret, reminder product reads stay on integrator DB (safe fallback). Base URL: DB `app_base_url` or env. */
  const remindersReadsPort =
    integratorWebhookSecret().length >= 16
      ? createRemindersReadsPort({
          db: dbPort,
          getDispatchPort: () => dispatchPortForReminders.current,
        })
      : undefined;
  const remindersWebappWritesPort =
    integratorWebhookSecret().length >= 16 ? createRemindersWritesPort({ db: dbPort }) : undefined;
  /** Same condition: appointment product reads from webapp when configured. */
  const appointmentsReadsPort =
    integratorWebhookSecret().length >= 16 ? createAppointmentsReadsPort({ db: dbPort }) : undefined;
  /** Subscription/mailing product reads from webapp when configured. */
  const subscriptionMailingReadsPort =
    integratorWebhookSecret().length >= 16 ? createSubscriptionMailingReadsPort({ db: dbPort }) : undefined;
  const dbReadPort = input.dbReadPort ?? createDbReadPort({
    db: dbPort,
    communicationReadsPort,
    ...(remindersReadsPort !== undefined ? { remindersReadsPort } : {}),
    ...(appointmentsReadsPort !== undefined ? { appointmentsReadsPort } : {}),
    ...(subscriptionMailingReadsPort !== undefined ? { subscriptionMailingReadsPort } : {}),
  });
  const webappEventsPort = createWebappEventsPort({
    getAppBaseUrl: () => getAppBaseUrl(dbPort),
  });
  const dispatchPortRef: { current?: DispatchPort } = {};
  const dbWritePort =
    input.dbWritePort ??
    createDbWritePort({
      db: dbPort,
      readPort: dbReadPort,
      webappEventsPort,
      getDispatchPort: () => dispatchPortRef.current,
    });
  const queuePort = input.queuePort ?? createPostgresJobQueue({
    db: dbPort,
    retryDelaySeconds: appSettings.runtime.worker.retryDelaySeconds,
  });

  const contentPort = createContentPort({ rootDir: join(getAppRoot(), 'src', 'content') });
  const contentCatalogPort = createContentCatalogPort();
  const deliveryTargetsPort = createDeliveryTargetsPort({
    getAppBaseUrl: () => getAppBaseUrl(dbPort),
  });
  const contextQueryPort = createContextQueryPort({
    readPort: dbReadPort,
    getWebappBaseUrl: async () => {
      const u = await getAppBaseUrl(dbPort);
      return u.trim().length > 0 ? u : null;
    },
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

  dispatchPortRef.current = dispatchPort;

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
    telegramStartDedup: (telegramUserId) => tryConsumeStart(dbPort, telegramUserId),
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

  void getAppBaseUrl(dbPort).catch(() => {});

  return {
    healthCheckDb,
    getProjectionHealth: () => getProjectionHealth(dbPort),
    smsClient,
    dbWritePort,
    dispatchPort,
    contentPort,
    templatePort,
    sendMenuOnButtonPress: telegramConfig.sendMenuOnButtonPress ?? false,
    contentCatalogPort,
    contextQueryPort,
    eventGateway,
    webappEventsPort,
    ...(telegramRegistrar !== undefined ? { registerTelegramWebhookRoutes: telegramRegistrar } : {}),
    registerRubitimeWebhookRoutes: input.registerRubitimeWebhookRoutes ?? registerRubitimeWebhookRoutes,
    ...(maxRegistrar !== undefined ? { registerMaxWebhookRoutes: maxRegistrar } : {}),
  };
}