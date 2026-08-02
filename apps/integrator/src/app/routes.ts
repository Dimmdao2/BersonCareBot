import type { FastifyInstance } from 'fastify';
import { registerBersoncareSendSmsRoute } from '../integrations/bersoncare/sendSmsRoute.js';
import { registerBersoncareSendEmailRoute } from '../integrations/bersoncare/sendEmailRoute.js';
import { registerBersoncareRelayOutboundRoute } from '../integrations/bersoncare/relayOutboundRoute.js';
import { registerOperatorAlertRelayRoute } from '../integrations/bersoncare/operatorAlertRelayRoute.js';
import { registerBersoncareRequestContactRoute } from '../integrations/bersoncare/requestContactRoute.js';
import { registerBersoncareSendOtpRoute } from '../integrations/bersoncare/sendOtpRoute.js';
import { registerBersoncareReminderRulesRoute } from '../integrations/bersoncare/reminderRulesRoute.js';
import { registerBersoncareUserMergeM2mRoutes } from '../integrations/bersoncare/userMergeM2mRoute.js';
import { registerOperatorHealthProbeRoute } from '../integrations/bersoncare/operatorHealthProbeRoute.js';
import { registerBersoncareBookingLifecycleRoute } from '../integrations/bersoncare/bookingLifecycleRoute.js';
import { createDbPort } from '../infra/db/client.js';
import { createMessengerStaffIdsResolver } from '../infra/db/messengerStaffIds.js';
import {
  getLinkDataByIdentity,
  resolveActiveOrganizationIdForIntegratorUserId,
  resolveActiveOrganizationIdForMessengerIdentity,
  resolveDeploymentSingleActiveOrganizationId,
} from '../infra/db/repos/channelUsers.js';
import { resolveDedicatedClinicBotOrganization } from '../infra/db/clinicDedicatedBotBindings.js';
import { env, integratorWebhookSecret } from '../config/env.js';
import { telegramConfig } from '../integrations/telegram/config.js';
import { startTelegramLongPolling } from '../integrations/telegram/longPolling.js';
import type { AppDeps, ProjectionHealthSnapshot } from './di.js';
import type { OutboundProviderErrorClass } from '@bersoncare/operator-db-schema';
import { runWithBootstrapPrincipal } from '../infra/principal/organizationPrincipal.js';
import { reportIntegratorIsolationFailure } from '../infra/observability/saasIsolationTelemetry.js';
import { isAuthChannelEnabled } from '../infra/db/authChannelPolicy.js';
import { recordOperatorFailureIncident } from '../infra/operatorIncident/reportOperatorFailure.js';
import { isSmscProviderReady } from '../integrations/smsc/runtimeConfig.js';

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
      const row = await runWithBootstrapPrincipal(
        { source: `${resource}-webhook:pre-routing` },
        () => getLinkDataByIdentity(db, resource, externalId),
      );
      return row?.userId;
    } catch (error) {
      reportIntegratorIsolationFailure(error);
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
      return await runWithBootstrapPrincipal({ source: `${resource}-webhook:pre-routing` }, () =>
        resolveActiveOrganizationIdForMessengerIdentity(db, { resource, externalId }),
      );
    } catch (error) {
      reportIntegratorIsolationFailure(error);
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
      return await runWithBootstrapPrincipal({ source: 'integrator-user-org-resolution' }, () =>
        resolveActiveOrganizationIdForIntegratorUserId(db, integratorUserId),
      );
    } catch (error) {
      reportIntegratorIsolationFailure(error);
      return null;
    }
  };
}

function createResolveDedicatedClinicBotOrganization(
  channel: 'telegram' | 'max',
): (credentialFingerprint: string) => Promise<string | null> {
  return async (credentialFingerprint) => {
    try {
      const db = createDbPort();
      return await runWithBootstrapPrincipal({ source: `${channel}-dedicated-webhook:pre-routing` }, () =>
        resolveDedicatedClinicBotOrganization(db, channel, credentialFingerprint),
      );
    } catch (error) {
      reportIntegratorIsolationFailure(error);
      return null;
    }
  };
}

/**
 * T0.4 channel-binding fallback: the deployment's single organization, used when a messenger
 * identity has no per-user org context yet (first contact, not yet enrolled). See
 * {@link resolveDeploymentSingleActiveOrganizationId} for the architecture rationale/limits.
 */
function createResolveDeploymentOrganizationId(): () => Promise<string | null> {
  return async () => {
    try {
      const db = createDbPort();
      return await runWithBootstrapPrincipal(
        { source: 'integrator-deployment-org-resolution' },
        () => resolveDeploymentSingleActiveOrganizationId(db),
      );
    } catch (error) {
      reportIntegratorIsolationFailure(error);
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
  const resolveOrganizationIdForMessengerIdentity =
    createResolveOrganizationIdForMessengerIdentity();
  const resolveOrganizationIdForIntegratorUserId = createResolveOrganizationIdForIntegratorUserId();
  const resolveDedicatedTelegramBotOrganization = createResolveDedicatedClinicBotOrganization('telegram');
  const resolveDedicatedMaxBotOrganization = createResolveDedicatedClinicBotOrganization('max');
  const resolveDeploymentOrganizationId = createResolveDeploymentOrganizationId();
  const authChannelPolicyDb = createDbPort();
  const authChannelPolicy = (channel: 'email' | 'sms' | 'telegram' | 'max') =>
    isAuthChannelEnabled(authChannelPolicyDb, channel);
  const recordOutboundProviderFailure = async (
    integration: 'email' | 'smsc',
    errorClass: OutboundProviderErrorClass,
  ): Promise<void> => {
    await recordOperatorFailureIncident({
      direction: 'outbound_delivery_provider',
      integration,
      errorClass,
      errorDetail: null,
    });
  };

  app.get<{ Reply: HealthResponse }>('/health', async (_request, _reply) => {
    const dbOk = await deps.healthCheckDb();
    const body: HealthResponse = { ok: true, db: dbOk ? 'up' : 'down' };
    return body;
  });

  app.get<{ Reply: ProjectionHealthResponse }>('/health/projection', async (_request, reply) => {
    try {
      const snapshot = await deps.getProjectionHealth();
      return reply.code(200).send(snapshot);
    } catch (error) {
      reportIntegratorIsolationFailure(error);
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
    isAuthChannelEnabled: authChannelPolicy,
    recordProviderFailure: (reason) => recordOutboundProviderFailure('smsc', reason),
  });

  await registerBersoncareSendEmailRoute(app, {
    sharedSecret: integratorWebhookSecret(),
    db: createDbPort(),
    dispatchPort: deps.dispatchPort,
    isAuthChannelEnabled: authChannelPolicy,
    recordProviderFailure: (reason) => recordOutboundProviderFailure('email', reason),
  });

  await registerBersoncareRelayOutboundRoute(app, {
    db: createDbPort(),
    dispatchPort: deps.dispatchPort,
    sharedSecret: integratorWebhookSecret(),
    idempotencyPort: deps.idempotencyPort,
  });
  const operatorAlertDb = createDbPort();
  await registerOperatorAlertRelayRoute(app, {
    dispatchPort: deps.dispatchPort,
    sharedSecret: integratorWebhookSecret(),
    isSmsProviderReady: () => isSmscProviderReady(operatorAlertDb),
    idempotencyPort: deps.idempotencyPort,
  });

  await registerBersoncareRequestContactRoute(app, {
    dispatchPort: deps.dispatchPort,
    sharedSecret: integratorWebhookSecret(),
    db: createDbPort(),
    isAuthChannelEnabled: authChannelPolicy,
    resolveOrganizationIdForMessengerIdentity,
    resolveDeploymentOrganizationId,
    idempotencyPort: deps.idempotencyPort,
  });

  await registerBersoncareSendOtpRoute(app, {
    dispatchPort: deps.dispatchPort,
    sharedSecret: integratorWebhookSecret(),
    isAuthChannelEnabled: authChannelPolicy,
  });

  await registerBersoncareReminderRulesRoute(app, {
    writePort: deps.dbWritePort,
    sharedSecret: integratorWebhookSecret(),
    resolveOrganizationIdForIntegratorUserId,
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

  await registerBersoncareBookingLifecycleRoute(app, {
    sharedSecret: integratorWebhookSecret(),
    dispatchPort: deps.dispatchPort,
    dbWritePort: deps.dbWritePort,
    idempotencyPort: deps.idempotencyPort,
    webappEventsPort: deps.webappEventsPort,
  });

  const resolveMessengerStaffAdmin = createMessengerStaffIdsResolver(createDbPort());
  const getAppBaseUrlForWebhooks = async (): Promise<string> => env.APP_BASE_URL;

  const telegramWebhookDeps = {
    eventGateway: deps.eventGateway,
    resolveIntegratorUserIdForMessenger,
    resolveOrganizationIdForMessengerIdentity,
    getAppBaseUrl: getAppBaseUrlForWebhooks,
    resolveMessengerStaffAdmin,
    resolveDedicatedClinicBotOrganization: resolveDedicatedTelegramBotOrganization,
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

  if (deps.registerMaxWebhookRoutes) {
    app.register(async (instance) => {
      await deps.registerMaxWebhookRoutes?.(instance, {
        eventGateway: deps.eventGateway,
        resolveIntegratorUserIdForMessenger,
        resolveOrganizationIdForMessengerIdentity,
        getAppBaseUrl: getAppBaseUrlForWebhooks,
        resolveMessengerStaffAdmin,
        resolveDedicatedClinicBotOrganization: resolveDedicatedMaxBotOrganization,
      });
    });
  }
}
