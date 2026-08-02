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
  TemplatePort,
  WebappEventsPort,
} from '../kernel/contracts/index.js';
import { logger } from '../infra/observability/logger.js';
import { createPostgresIdempotencyPort } from '../infra/db/repos/idempotencyKeys.js';
import { tryConsumeStart } from '../infra/db/repos/channelUsers.js';
import {
  createDefaultDispatchPort,
  type DispatchPlatformIntegrationId,
} from '../infra/adapters/dispatchPort.js';
import { createUnifiedSender } from '../infra/adapters/sendUnified.js';
import type { UnifiedSender } from '../infra/adapters/sendUnified.js';
import { createActorResolutionPort } from '../infra/adapters/actorResolutionPort.js';
import { createContentCatalogPort } from '../infra/adapters/contentCatalogPort.js';
import { createDeliveryDefaultsPort } from '../infra/adapters/deliveryDefaultsPort.js';
import { createProtectedAccessPort } from '../infra/adapters/protectedAccessPort.js';
import { createTemplatePort } from '../infra/adapters/templatePort.js';
import { createOrchestrator } from '../kernel/orchestrator/index.js';
import { createSmscClient } from '../integrations/smsc/client.js';
import { createSmscDeliveryAdapter } from '../integrations/smsc/deliveryAdapter.js';
import { getMaxRuntimeConfig, getSmscRuntimeConfig, getTelegramRuntimeConfig } from '../infra/adapters/integrationRuntimeConfig.js';
import type { SmsClient } from '../integrations/smsc/types.js';
import { createEmailDeliveryAdapter } from '../integrations/email/deliveryAdapter.js';
import { createMaxDeliveryAdapter } from '../integrations/max/deliveryAdapter.js';
import { registerMaxWebhookRoutes } from '../integrations/max/webhook.js';
import { createTelegramDeliveryAdapter } from '../integrations/telegram/deliveryAdapter.js';
import { registerTelegramWebhookRoutes } from '../integrations/telegram/webhook.js';
import type { ResolveMessengerStaffAdmin } from '../kernel/contracts/index.js';
import { defaultSupportRelayPolicy } from '../integrations/telegram/supportRelayPolicy.js';
import { createWebappEventsPort } from '../infra/adapters/webappEventsClient.js';
import { createDeliveryTargetsPort } from '../infra/adapters/deliveryTargetsPort.js';
import { createRemindersReadsPort } from '../infra/adapters/remindersReadsPort.js';
import { createRemindersWritesPort } from '../infra/adapters/remindersWritesPort.js';
import { createAppointmentsReadsPort } from '../infra/adapters/appointmentsReadsPort.js';
import { createWebPushAccessPort } from '../infra/adapters/webPushAccessPort.js';
import type { WebPushAccessPort } from '../kernel/contracts/index.js';
import { createWebPushDeliveryAdapter } from '../integrations/web-push/deliveryAdapter.js';
import { isPlatformIntegrationAvailable } from '../infra/db/platformIntegrationAvailability.js';

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
  /** Публичный origin вебаппа из deployment env. */
  getAppBaseUrl?: () => Promise<string>;
  /** Staff lists from system_settings (admin_*_ids ∪ doctor_*_ids). */
  resolveMessengerStaffAdmin?: ResolveMessengerStaffAdmin;
  resolveOrganizationIdForMessengerIdentity?: (
    externalId: string,
    resource: 'telegram' | 'max',
  ) => Promise<string | null>;
  /**
   * T0.4 channel-binding fallback: deployment's single organization, used when the messenger
   * identity has no per-user org context yet (first contact / not yet enrolled). See
   * `resolveDeploymentSingleActiveOrganizationId` in `infra/db/repos/channelUsers.ts`.
   */
  resolveDeploymentOrganizationId?: () => Promise<string | null>;
};

export type TelegramRoutesRegistrar = (
  app: FastifyInstance,
  deps: {
    eventGateway: EventGateway;
  } & MessengerWebappEntryIdentityDeps,
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
  dispatchAttemptWritePort?: DbWritePort;
  queuePort?: QueuePort;
  dispatchPort?: DispatchPort;
  idempotencyPort?: IdempotencyPort;
  registerTelegramWebhookRoutes?: TelegramRoutesRegistrar;
  registerMaxWebhookRoutes?: MaxRoutesRegistrar;
};

/** Projection health snapshot for release gate. */
export type ProjectionHealthSnapshot =
  import('../infra/db/repos/projectionHealth.js').ProjectionHealthSnapshot;

/** Зависимости app-слоя, используемые routes/server. */
export type AppDeps = {
  healthCheckDb: () => Promise<boolean>;
  getProjectionHealth: () => Promise<ProjectionHealthSnapshot>;
  smsClient: SmsClient;
  dbWritePort: DbWritePort;
  dispatchPort: DispatchPort;
  idempotencyPort: IdempotencyPort;
  /** Unified send façade — THE single entry point for outbound sends (PLAN S3). */
  unifiedSender: UnifiedSender;
  contentPort: ContentPort;
  /** Шаблоны контента (reply keyboard / inline из JSON меню). */
  templatePort: TemplatePort;
  /** Когда true, к исходящим user `message.send` в Telegram подмешивается главное reply-меню (см. executor). */
  isTelegramMenuOnButtonPress: () => Promise<boolean>;
  contentCatalogPort: ContentCatalogPort;
  contextQueryPort: ContextQueryPort;
  eventGateway: EventGateway;
  registerTelegramWebhookRoutes?: TelegramRoutesRegistrar;
  registerMaxWebhookRoutes?: MaxRoutesRegistrar;
  webappEventsPort: WebappEventsPort;
  /**
   * Read port for web-push subscriptions + VAPID (PLAN S13 Model β).
   * Used by `WebPushDeliveryAdapter` (S14a) to fetch subscriptions + VAPID at send time
   * and to clean up dead subscriptions after 410/404. Wired in S14a.
   */
  webPushAccessPort: WebPushAccessPort;
};

/** Собирает полностью связанный набор зависимостей app-слоя. */
export function buildDeps(input: BuildDepsInput = {}): AppDeps {
  const dbPort = createDbPort();
  const smsClient: SmsClient = createSmscClient({
    getRuntimeConfig: getSmscRuntimeConfig,
    log: logger,
  });
  /** Filled after `dispatchPort` is constructed (reminders reads need Telegram on display-TZ fallback). */
  const dispatchPortForReminders: { current?: DispatchPort } = {};
  /** Without webhook secret, reminder product reads stay on integrator DB (safe fallback). */
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
    integratorWebhookSecret().length >= 16
      ? createAppointmentsReadsPort({ db: dbPort })
      : undefined;
  const dbReadPort =
    input.dbReadPort ??
    createDbReadPort({
      db: dbPort,
      ...(remindersReadsPort !== undefined ? { remindersReadsPort } : {}),
      ...(appointmentsReadsPort !== undefined ? { appointmentsReadsPort } : {}),
    });
  const webappEventsPort = createWebappEventsPort({
    getAppBaseUrl: async () => env.APP_BASE_URL,
  });
  const webPushAccessPort = createWebPushAccessPort({
    getAppBaseUrl: async () => env.APP_BASE_URL,
  });
  const dispatchPortRef: { current?: DispatchPort } = {};
  const dbWritePort =
    input.dbWritePort ??
    createDbWritePort({
      db: dbPort,
      webappEventsPort,
      getDispatchPort: () => dispatchPortRef.current,
    });
  const queuePort =
    input.queuePort ??
    createPostgresJobQueue({
      db: dbPort,
      retryDelaySeconds: appSettings.runtime.worker.retryDelaySeconds,
    });

  const contentPort = createContentPort({ rootDir: join(getAppRoot(), 'src', 'content') });
  const contentCatalogPort = createContentCatalogPort();
  const deliveryTargetsPort = createDeliveryTargetsPort({
    getAppBaseUrl: async () => env.APP_BASE_URL,
  });
  const contextQueryPort = createContextQueryPort({
    readPort: dbReadPort,
    getWebappBaseUrl: async () => env.APP_BASE_URL,
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
    createMaxDeliveryAdapter(),
    createEmailDeliveryAdapter({ getDb: () => dbPort }),
    createWebPushDeliveryAdapter({ webPushAccessPort }),
  ];

  const dispatchPort =
    input.dispatchPort ??
    createDefaultDispatchPort({
      adapters,
      readPort: dbReadPort,
      writePort: input.dispatchAttemptWritePort ?? dbWritePort,
      isPlatformIntegrationEnabled: async (integrationId: DispatchPlatformIntegrationId) => {
        if (!(await isPlatformIntegrationAvailable(dbPort, integrationId))) return false;
        if (integrationId === 'telegram') return (await getTelegramRuntimeConfig()).enabled;
        if (integrationId === 'max') return (await getMaxRuntimeConfig()).enabled;
        if (integrationId === 'smsc') return (await getSmscRuntimeConfig()).enabled;
        return true;
      },
    });

  dispatchPortRef.current = dispatchPort;

  dispatchPortForReminders.current = dispatchPort;

  // Unified send façade — built from the existing dispatchPort (PLAN S3).
  const unifiedSender = createUnifiedSender({ dispatchPort });

  const idempotencyPort = input.idempotencyPort ?? createPostgresIdempotencyPort(dbPort);

  const actorResolutionPort = createActorResolutionPort({ writePort: dbWritePort });
  const deliveryDefaultsPort = createDeliveryDefaultsPort();
  const protectedAccessPort = createProtectedAccessPort({ writePort: dbWritePort });
  const pipeline = createIncomingEventPipeline({
    readPort: dbReadPort,
    writePort: dbWritePort,
    db: dbPort,
    queuePort,
    dispatchPort,
    orchestrator,
    templatePort,
    contentCatalogPort,
    protectedAccessPort,
    actorResolutionPort,
    deliveryDefaultsPort,
    contentPort,
    isTelegramMenuOnButtonPress: async () => (await getTelegramRuntimeConfig()).sendMenuOnButtonPress,
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

  const telegramRegistrar = input.registerTelegramWebhookRoutes ?? registerTelegramWebhookRoutes;
  const maxRegistrar = input.registerMaxWebhookRoutes ?? registerMaxWebhookRoutes;

  return {
    healthCheckDb,
    getProjectionHealth: () => getProjectionHealth(dbPort),
    smsClient,
    dbWritePort,
    dispatchPort,
    idempotencyPort,
    unifiedSender,
    contentPort,
    templatePort,
    isTelegramMenuOnButtonPress: async () => (await getTelegramRuntimeConfig()).sendMenuOnButtonPress,
    contentCatalogPort,
    contextQueryPort,
    eventGateway,
    webappEventsPort,
    webPushAccessPort,
    registerTelegramWebhookRoutes: telegramRegistrar,
    registerMaxWebhookRoutes: maxRegistrar,
  };
}
