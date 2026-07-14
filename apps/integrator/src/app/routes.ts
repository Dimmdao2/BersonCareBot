import type { FastifyInstance } from 'fastify';
import { registerBersoncareSendSmsRoute } from '../integrations/bersoncare/sendSmsRoute.js';
import { registerBersoncareSendEmailRoute } from '../integrations/bersoncare/sendEmailRoute.js';
import { registerBersoncareRelayOutboundRoute } from '../integrations/bersoncare/relayOutboundRoute.js';
import { registerBersoncareRequestContactRoute } from '../integrations/bersoncare/requestContactRoute.js';
import { registerBersoncareSendOtpRoute } from '../integrations/bersoncare/sendOtpRoute.js';
import { registerBersoncareReminderRulesRoute } from '../integrations/bersoncare/reminderRulesRoute.js';
import { registerBersoncareSettingsSyncRoute } from '../integrations/bersoncare/settingsSyncRoute.js';
import { registerBersoncareUserMergeM2mRoutes } from '../integrations/bersoncare/userMergeM2mRoute.js';
import { registerOperatorHealthProbeRoute } from '../integrations/bersoncare/operatorHealthProbeRoute.js';
import { createDbPort } from '../infra/db/client.js';
import { createMessengerStaffIdsResolver } from '../infra/db/messengerStaffIds.js';
import {
  getLinkDataByIdentity,
  resolveActiveOrganizationIdForIntegratorUserId,
  resolveActiveOrganizationIdForMessengerIdentity,
  resolveDeploymentSingleActiveOrganizationId,
} from '../infra/db/repos/channelUsers.js';
import { registerRubitimeRecordM2mRoutes } from '../integrations/rubitime/recordM2mRoute.js';
import { registerRubitimeAdminM2mRoutes } from '../integrations/rubitime/adminM2mRoute.js';
import { getAppBaseUrl } from '../config/appBaseUrl.js';
import { integratorWebhookSecret } from '../config/env.js';
import { telegramConfig } from '../integrations/telegram/config.js';
import { startTelegramLongPolling } from '../integrations/telegram/longPolling.js';
import type { AppDeps, ProjectionHealthSnapshot } from './di.js';

/** Public response shape for the health endpoint. */
export type HealthResponse = {
  ok: true;
  db: 'up' | 'down';
};

/** Response shape for projection health (release gate). */
export type ProjectionHealthResponse = ProjectionHealthSnapshot;

function createResolveIntegratorUserIdForMessenger(): (
  externalId: string,
  resource: 'telegram' | 'max',
) => Promise<string | undefined> {
  return async (externalId, resource) => {
    try {
      const db = createDbPort();
      const row = await getLinkDataByIdentity(db, resource, externalId);
      return row?.userId;
    } catch {
      return undefined;
    }
  };
}

function createResolveOrganizationIdForMessengerIdentity(): (
  externalId: string,
  resource: 'telegram' | 'max',
) => Promise<string | null> {
  return async (externalId, resource) => {
    try {
      const db = createDbPort();
      return await resolveActiveOrganizationIdForMessengerIdentity(db, { resource, externalId });
    } catch {
      return null;
    }
  };
}

function createResolveOrganizationIdForIntegratorUserId(): (
  integratorUserId: string,
) => Promise<string | null> {
  return async (integratorUserId) => {
    try {
      const db = createDbPort();
      return await resolveActiveOrganizationIdForIntegratorUserId(db, integratorUserId);
    } catch {
      return null;
    }
  };
}

// eslint-disable-next-line no-secrets/no-secrets -- JSDoc identifier, not a secret
/**
 * T0.4 channel-binding fallback: the deployment's single organization, used when a messenger
 * identity has no per-user org context yet (first contact, not yet enrolled). See
 * {@link resolveDeploymentSingleActiveOrganizationId} for the architecture rationale/limits.
 */
function createResolveDeploymentOrganizationId(): () => Promise<string | null> {
  return async () => {
    try {
      const db = createDbPort();
      return await resolveDeploymentSingleActiveOrganizationId(db);
    } catch {
      return null;
    }
  };
}

/**
 * Registers all HTTP routes for the app layer.
 * Business routing is delegated to integration registrars + eventGateway.
 */
export async function registerRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const resolveIntegratorUserIdForMessenger = createResolveIntegratorUserIdForMessenger();
  const resolveOrganizationIdForMessengerIdentity = createResolveOrganizationIdForMessengerIdentity();
  const resolveOrganizationIdForIntegratorUserId = createResolveOrganizationIdForIntegratorUserId();
  const resolveDeploymentOrganizationId = createResolveDeploymentOrganizationId();

  app.get<{ Reply: HealthResponse }>('/health', async (_request, _reply) => {
    const dbOk = await deps.healthCheckDb();
    const body: HealthResponse = { ok: true, db: dbOk ? 'up' : 'down' };
    return body;
  });

  app.get<{ Reply: ProjectionHealthResponse }>('/health/projection', async (_request, reply) => {
    try {
      const snapshot = await deps.getProjectionHealth();
      return reply.code(200).send(snapshot);
    } catch {
      return reply.code(503).send({
        pendingCount: 0,
        deadCount: 0,
        cancelledCount: 0,
        oldestPendingAt: null,
        processingCount: 0,
        retryDistribution: {},
        lastSuccessAt: null,
        retriesOverThreshold: 0,
      });
    }
  });

  await registerBersoncareSendSmsRoute(app, {
    dispatchPort: deps.dispatchPort,
    sharedSecret: integratorWebhookSecret(),
  });

  await registerBersoncareSendEmailRoute(app, {
    sharedSecret: integratorWebhookSecret(),
    db: createDbPort(),
    dispatchPort: deps.dispatchPort,
  });

  await registerBersoncareRelayOutboundRoute(app, {
    dispatchPort: deps.dispatchPort,
    sharedSecret: integratorWebhookSecret(),
  });

  await registerBersoncareRequestContactRoute(app, {
    dispatchPort: deps.dispatchPort,
    sharedSecret: integratorWebhookSecret(),
    db: createDbPort(),
    resolveOrganizationIdForMessengerIdentity,
    resolveDeploymentOrganizationId,
  });

  await registerBersoncareSendOtpRoute(app, {
    dispatchPort: deps.dispatchPort,
    sharedSecret: integratorWebhookSecret(),
  });

  await registerBersoncareReminderRulesRoute(app, {
    writePort: deps.dbWritePort,
    sharedSecret: integratorWebhookSecret(),
    resolveOrganizationIdForIntegratorUserId,
  });

  await registerBersoncareSettingsSyncRoute(app, {
    db: createDbPort(),
    sharedSecret: integratorWebhookSecret(),
  });

  await registerBersoncareUserMergeM2mRoutes(app, {
    db: createDbPort(),
    sharedSecret: integratorWebhookSecret(),
    resolveOrganizationIdForIntegratorUserId,
    resolveDeploymentOrganizationId,
  });

  await registerOperatorHealthProbeRoute(app, {
    sharedSecret: integratorWebhookSecret(),
    dispatchPort: deps.dispatchPort,
  });

  await registerRubitimeRecordM2mRoutes(app, {
    sharedSecret: integratorWebhookSecret(),
    dispatchPort: deps.dispatchPort,
    dbWritePort: deps.dbWritePort,
    idempotencyPort: deps.idempotencyPort,
    webappEventsPort: deps.webappEventsPort,
  });

  await registerRubitimeAdminM2mRoutes(app, {
    sharedSecret: integratorWebhookSecret(),
  });

  const webhookRouteDb = createDbPort();
  const resolveMessengerStaffAdmin = createMessengerStaffIdsResolver(webhookRouteDb);
  const getAppBaseUrlForWebhooks = (): Promise<string> => getAppBaseUrl(webhookRouteDb);

  const telegramWebhookDeps = {
    eventGateway: deps.eventGateway,
    resolveIntegratorUserIdForMessenger,
    resolveOrganizationIdForMessengerIdentity,
    resolveDeploymentOrganizationId,
    getAppBaseUrl: getAppBaseUrlForWebhooks,
    resolveMessengerStaffAdmin,
  };
  if (telegramConfig.botToken) {
    if (telegramConfig.mode === 'long_polling') {
      // RU-isolated host: Telegram cannot reach us inbound — pull updates via
      // getUpdates instead of a webhook. Non-fatal, fire-and-forget; NO webhook route.
      startTelegramLongPolling(telegramWebhookDeps);
    } else if (deps.registerTelegramWebhookRoutes) {
      app.register(async (instance) => {
        await deps.registerTelegramWebhookRoutes?.(instance, telegramWebhookDeps);
      });
    }
  }

  if (deps.registerRubitimeWebhookRoutes) {
    app.register(async (instance) => {
      await deps.registerRubitimeWebhookRoutes?.(instance, {
        eventGateway: deps.eventGateway,
        webappEventsPort: deps.webappEventsPort,
        dispatchPort: deps.dispatchPort,
      });
    });
  }

  if (deps.registerMaxWebhookRoutes) {
    app.register(async (instance) => {
      await deps.registerMaxWebhookRoutes?.(instance, {
        eventGateway: deps.eventGateway,
        resolveIntegratorUserIdForMessenger,
        resolveOrganizationIdForMessengerIdentity,
        resolveDeploymentOrganizationId,
        getAppBaseUrl: getAppBaseUrlForWebhooks,
        resolveMessengerStaffAdmin,
      });
    });
  }
}
