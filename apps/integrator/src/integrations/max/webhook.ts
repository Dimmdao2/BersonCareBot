import type { FastifyInstance } from 'fastify';
import { runWithDbBootstrapPrincipal, runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { getRequestLogger, logger, newEventId } from '../../infra/observability/logger.js';
import { env } from '../../config/env.js';
import {
  runWithIntegratorPrincipal,
  runWithOrganizationPrincipal,
} from '../../infra/principal/organizationPrincipal.js';
import type { EventGateway } from '../../kernel/contracts/index.js';
import { buildWebappEntryUrlForMax } from '../webappEntryToken.js';
import { maxIncomingToEvent } from './connector.js';
import { fromMax } from './mapIn.js';
import { parseMaxUpdate } from './schema.js';
import { getMaxRuntimeConfig } from '../../infra/adapters/integrationRuntimeConfig.js';
import { setupMaxCommands } from './setupCommands.js';
import type { MaxUpdateValidated } from './schema.js';
import type { ResolveMessengerStaffAdmin } from '../../kernel/contracts/index.js';
import { createDbPort } from '../../infra/db/client.js';
import { getOperationalVerboseLogEnabled } from '../../infra/db/repos/operationalVerboseLog.js';
import { recordIntegrationWebhookOutcome } from '../../infra/operatorIncident/recordIntegrationWebhookOutcome.js';

type WebhookOutcomeInput = Parameters<typeof recordIntegrationWebhookOutcome>[0];

function recordMaxWebhookOutcome(input: WebhookOutcomeInput): void {
  void runWithDbInfraPrincipal({ source: 'max-webhook:record-outcome' }, () =>
    recordIntegrationWebhookOutcome(input),
  );
}

export type MaxWebhookDeps = {
  eventGateway: EventGateway;
  resolveIntegratorUserIdForMessenger?: (
    externalId: string,
    resource: 'telegram' | 'max',
  ) => Promise<string | undefined>;
  getAppBaseUrl?: () => Promise<string>;
  resolveMessengerStaffAdmin?: ResolveMessengerStaffAdmin;
  resolveOrganizationIdForMessengerIdentity?: (
    externalId: string,
    resource: 'telegram' | 'max',
  ) => Promise<string | null>;
  /**
   * T0.4 channel-binding fallback: resolves the deployment's single organization when the
   * messenger identity has no per-user org context yet (first-contact, not yet enrolled). The
   * tenant boundary is the inbound channel/bot, not the user's enrollment state — see
   * `resolveDeploymentSingleActiveOrganizationId` for the architecture rationale/limits.
   */
  resolveDeploymentOrganizationId?: () => Promise<string | null>;
};

function getSourceMaxExternalId(data: MaxUpdateValidated): string | null {
  const maxId = data.message?.sender?.user_id ?? data.callback?.user?.user_id ?? data.user?.user_id;
  return typeof maxId === 'number' ? String(maxId) : null;
}

async function resolveMaxOrganizationId(
  data: MaxUpdateValidated,
  deps: MaxWebhookDeps,
  reqLogger: ReturnType<typeof getRequestLogger>,
): Promise<string | null> {
  const externalId = getSourceMaxExternalId(data);
  if (externalId && deps.resolveOrganizationIdForMessengerIdentity) {
    try {
      const perUserOrg = await deps.resolveOrganizationIdForMessengerIdentity(externalId, 'max');
      if (perUserOrg) return perUserOrg;
    } catch {
      // fall through to channel-binding fallback below
    }
  }
  if (!deps.resolveDeploymentOrganizationId) return null;
  try {
    const deploymentOrg = await deps.resolveDeploymentOrganizationId();
    if (deploymentOrg) {
      reqLogger.info(
        { source: 'max' },
        'max webhook: no per-user org context, using deployment channel-binding fallback',
      );
      return deploymentOrg;
    }
    reqLogger.warn(
      { source: 'max' },
      'max webhook: no organization resolvable for this channel (unbound/misconfigured deployment)',
    );
    return null;
  } catch {
    return null;
  }
}

async function resolveMaxIntegratorUserId(
  data: MaxUpdateValidated,
  deps: MaxWebhookDeps,
): Promise<string | null> {
  const externalId = getSourceMaxExternalId(data);
  if (!externalId || !deps.resolveIntegratorUserIdForMessenger) return null;
  try {
    return (await deps.resolveIntegratorUserIdForMessenger(externalId, 'max')) ?? null;
  } catch {
    return null;
  }
}

/** Экспорт для тестов контракта URL miniapp (`/app/max`, `next=`). */
export async function buildMaxLinks(
  data: MaxUpdateValidated,
  resolveIntegratorUserIdForMessenger:
    | MaxWebhookDeps['resolveIntegratorUserIdForMessenger']
    | undefined,
  appBaseUrl: string | undefined,
): Promise<Record<string, unknown>> {
  const maxId = data.message?.sender?.user_id ?? data.callback?.user?.user_id ?? data.user?.user_id;
  if (maxId == null || typeof maxId !== 'number') return {};
  const sender = data.message?.sender ?? data.callback?.user ?? data.user;
  const displayName =
    sender?.first_name != null || sender?.last_name != null
      ? [sender?.first_name, sender?.last_name].filter(Boolean).join(' ').trim() || undefined
      : (sender?.name ?? undefined);
  let integratorUserId: string | undefined;
  try {
    if (resolveIntegratorUserIdForMessenger) {
      integratorUserId = await resolveIntegratorUserIdForMessenger(String(maxId), 'max');
    }
  } catch {
    integratorUserId = undefined;
  }
  const appBase = (appBaseUrl ?? env.APP_BASE_URL).trim().replace(/\/+$/, '');
  const remindersUrl =
    appBase.startsWith('http://') || appBase.startsWith('https://')
      ? `${appBase}/app/patient/reminders`
      : undefined;
  const webappEntryUrl = buildWebappEntryUrlForMax(
    {
      maxId: String(maxId),
      ...(displayName ? { displayName } : {}),
      ...(integratorUserId !== undefined ? { integratorUserId } : {}),
    },
    appBaseUrl,
  );
  if (!webappEntryUrl) return remindersUrl ? { links: { remindersUrl } } : {};
  const baseWebappUrl = webappEntryUrl;
  const enc = (p: string) => encodeURIComponent(p);
  return {
    links: {
      webappEntryUrl: baseWebappUrl,
      webappHomeUrl: `${baseWebappUrl}&next=${enc('/app/patient')}`,
      ...(remindersUrl ? { remindersUrl } : {}),
      webappCabinetUrl: `${baseWebappUrl}&next=${enc('/app/patient/cabinet')}`,
      webappAddressUrl: `${baseWebappUrl}&next=${enc('/app/patient/address')}`,
      bookingUrl: `${baseWebappUrl}&next=${enc('/app/patient/cabinet')}`,
    },
  };
}

/** Exported for tests. */
export async function buildMaxFacts(
  data: MaxUpdateValidated,
  resolveIntegratorUserIdForMessenger:
    | MaxWebhookDeps['resolveIntegratorUserIdForMessenger']
    | undefined,
  getAppBaseUrl: MaxWebhookDeps['getAppBaseUrl'],
  resolveMessengerStaffAdmin?: ResolveMessengerStaffAdmin,
): Promise<Record<string, unknown>> {
  const appBaseUrl = getAppBaseUrl ? await getAppBaseUrl() : undefined;
  const chatId = data.message?.recipient?.chat_id ?? data.chat_id;
  const senderUserId =
    data.callback?.user?.user_id ?? data.message?.sender?.user_id ?? data.user?.user_id;
  const actorId =
    senderUserId != null ? String(senderUserId) : chatId != null ? String(chatId) : '';
  let dbAdmin = false;
  if (actorId && resolveMessengerStaffAdmin) {
    try {
      dbAdmin = await resolveMessengerStaffAdmin('max', actorId);
    } catch (err) {
      // Fail open like every other pre-routing lookup in this file (all try/catch and default), and
      // mirroring the telegram sibling (telegram/webhook.ts buildAdminFacts): a transient DB/privilege
      // hiccup here (e.g. the bare bootstrap login role 42501-ing on public.system_settings /
      // app.current_org_id()) must degrade admin-detection to "not admin", not crash the whole inbound
      // MAX pipeline. See deploy/postgres/integrator-login-public-identity-grants.sql for why granting
      // this access is the WRONG fix (it took TEST down) and fail-open in code is the correct one.
      logger.warn(
        { err },
        'buildMaxFacts: resolveMessengerStaffAdmin failed, treating as non-admin',
      );
      dbAdmin = false;
    }
  }
  const isAdmin = dbAdmin;
  return {
    ...(await buildMaxLinks(data, resolveIntegratorUserIdForMessenger, appBaseUrl)),
    ...(actorId ? { isAdmin } : {}),
  };
}

/**
 * Registers MAX webhook route. Flow: secret check -> validate -> map -> eventGateway.
 * Production: set MAX webhook secret in env (MAX_WEBHOOK_SECRET) and ensure HTTPS endpoint is registered with MAX (POST /subscriptions).
 * Blocker: MAX only delivers to HTTPS on port 443; for dev use fixture/long-polling until public URL is ready.
 */
export async function registerMaxWebhookRoutes(
  app: FastifyInstance,
  deps: MaxWebhookDeps,
): Promise<void> {
  await setupMaxCommands();
  const resolveIntegratorUserIdForMessenger = deps.resolveIntegratorUserIdForMessenger;
  const getAppBaseUrl = deps.getAppBaseUrl;
  const resolveMessengerStaffAdmin = deps.resolveMessengerStaffAdmin;

  app.post('/webhook/max', async (request, reply) => {
    const correlationId = request.id;
    const eventId = newEventId('incoming');
    const reqLogger = getRequestLogger(request.id, { correlationId, eventId });

    try {
      const config = await getMaxRuntimeConfig();
      if (!config.enabled) return reply.code(503).send({ ok: false, error: 'Unavailable' });
      const headerSecret = request.headers['x-max-bot-api-secret'];
      if (headerSecret !== config.webhookSecret) {
          reqLogger.warn('max webhook secret mismatch');
          recordMaxWebhookOutcome({
            source: 'max',
            processedOk: false,
            httpStatusReturned: 200,
            errorClass: 'webhook_auth_failed',
            detail: 'secret mismatch',
          });
          return reply.code(200).send({ ok: false, error: 'Forbidden' });
      }

      const parseResult = parseMaxUpdate(request.body);
      if (!parseResult.success) {
        reqLogger.warn(
          { err: parseResult.error.flatten(), hasBody: request.body != null },
          'max webhook body validation failed',
        );
        recordMaxWebhookOutcome({
          source: 'max',
          processedOk: false,
          httpStatusReturned: 200,
          errorClass: 'webhook_parse_failed',
          detail: 'body validation failed',
        });
        return reply.code(200).send({ ok: false, error: 'Invalid webhook body' });
      }

      const data = parseResult.data;
      const verbose = await runWithDbBootstrapPrincipal(
        { source: 'max-webhook:verbose-config' },
        () => getOperationalVerboseLogEnabled(createDbPort()),
      );
      if (verbose) {
        reqLogger.info(
          {
            update_type: data.update_type,
            has_message: data.message != null,
            has_callback: data.callback != null,
            recipient_chat_id: data.message?.recipient?.chat_id,
            recipient_user_id: data.message?.recipient?.user_id,
            sender_user_id: data.message?.sender?.user_id,
          },
          'max webhook received',
        );
      }

      const incoming = fromMax(data, config.apiKey);
      if (!incoming) {
        if (verbose) {
          reqLogger.info(
            { update_type: data.update_type },
            'max webhook skipped (unsupported or missing chatId/userId)',
          );
        }
        recordMaxWebhookOutcome({
          source: 'max',
          processedOk: true,
          httpStatusReturned: 200,
        });
        return reply.code(200).send({ ok: true });
      }

      if (incoming.kind === 'message') {
        const trimmed = incoming.text?.trim() ?? '';
        if (trimmed.startsWith('/start')) {
          reqLogger.debug(
            {
              maxStart: {
                action: incoming.action ?? '',
                linkSecretPresent:
                  typeof incoming.linkSecret === 'string' && incoming.linkSecret.length > 0,
                phoneFromDeepLink:
                  incoming.action === 'start.setphone' && typeof incoming.phone === 'string',
              },
            },
            '[max] /start classified',
          );
        }
      }

      const preRouting = await runWithDbBootstrapPrincipal(
        { source: 'max-webhook:pre-routing' },
        async () => ({
          facts: await buildMaxFacts(
            parseResult.data,
            resolveIntegratorUserIdForMessenger,
            getAppBaseUrl,
            resolveMessengerStaffAdmin,
          ),
          organizationId: await resolveMaxOrganizationId(data, deps, reqLogger),
          integratorUserId: await resolveMaxIntegratorUserId(data, deps),
        }),
      );

      const event = maxIncomingToEvent({
        incoming,
        correlationId,
        eventId,
        facts: preRouting.facts,
      });
      const organizationId = preRouting.organizationId;
      const integratorUserId = preRouting.integratorUserId;
      const handleEvent = (): Promise<Awaited<ReturnType<EventGateway['handleIncomingEvent']>>> =>
        deps.eventGateway.handleIncomingEvent(event);
      const result =
        organizationId && integratorUserId
          ? await runWithIntegratorPrincipal(
              { organizationId, integratorUserId, source: 'max-webhook' },
              handleEvent,
            )
          : organizationId
            ? await runWithOrganizationPrincipal(organizationId, handleEvent)
            : await runWithDbBootstrapPrincipal(
                { source: 'max-webhook:unresolved-org' },
                handleEvent,
              );
      if (result.status === 'rejected') {
        reqLogger.warn(
          { reason: result.reason, dedupKey: result.dedupKey },
          'max webhook pipeline rejected',
        );
        recordMaxWebhookOutcome({
          source: 'max',
          processedOk: false,
          httpStatusReturned: 200,
          errorClass: 'webhook_dispatch_failed',
          detail: result.reason,
        });
        return reply.code(200).send({ ok: false, error: 'Processing failed' });
      }
      recordMaxWebhookOutcome({
        source: 'max',
        processedOk: true,
        httpStatusReturned: 200,
      });
      return reply.code(200).send({ ok: true });
    } catch (err) {
      reqLogger.error({ err }, 'max webhook failed');
      const msg = err instanceof Error ? err.message : String(err);
      recordMaxWebhookOutcome({
        source: 'max',
        processedOk: false,
        httpStatusReturned: 200,
        errorClass: 'webhook_internal_error',
        detail: msg,
      });
      return reply.code(200).send({ ok: false, error: 'Internal error' });
    }
  });
}
