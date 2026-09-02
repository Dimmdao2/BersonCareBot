import type { FastifyInstance } from 'fastify';
import { runWithDbBootstrapPrincipal, runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { getRequestLogger, newEventId } from '../../infra/observability/logger.js';
import { env } from '../../config/env.js';
import { runWithOrganizationPrincipal } from '../../infra/principal/organizationPrincipal.js';
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
import { isWebhookSecretValid } from '../common/webhookSecretCompare.js';
import {
  forwardDedicatedBotInbound,
  type DedicatedBotInboundForwardDeps,
} from '../common/clinicBotInboundForward.js';

type WebhookOutcomeInput = Parameters<typeof recordIntegrationWebhookOutcome>[0];

function recordMaxWebhookOutcome(input: WebhookOutcomeInput): void {
  void runWithDbInfraPrincipal({ source: 'max-webhook:record-outcome' }, () =>
    recordIntegrationWebhookOutcome(input),
  );
}

export type MaxWebhookDeps = {
  eventGateway: EventGateway;
  /** Keep provider bootstrap enabled in production; controlled one-shot checks disable external setup calls. */
  setupProviderSurface?: boolean;
  /** Defaults to the DB-backed provider config; injectable for a provider-free route proof. */
  getRuntimeConfig?: typeof getMaxRuntimeConfig;
  getAppBaseUrl?: () => Promise<string>;
  resolveMessengerStaffAdmin?: ResolveMessengerStaffAdmin;
  resolveOrganizationIdForMessengerIdentity?: (
    externalId: string,
    resource: 'telegram' | 'max',
  ) => Promise<string | null>;
  /** Exact dedicated bot-instance binding; never falls back to enrollment/default organization. */
  resolveDedicatedClinicBotOrganization?: (credentialFingerprint: string) => Promise<string | null>;
  resolveDedicatedClinicBotApiKey?: (organizationId: string) => Promise<string | null>;
  /**
   * Direct forwarding of free-form inbound text to the chat the clinic named. Wired ONLY for the
   * dedicated clinic bot route — the platform webhook never gets it.
   */
  dedicatedBotInboundForward?: DedicatedBotInboundForwardDeps;
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
    const perUserOrg = await deps.resolveOrganizationIdForMessengerIdentity(externalId, 'max');
    if (perUserOrg) return perUserOrg;
  }
  reqLogger.warn(
    { source: 'max' },
    'max webhook: no exact organization context for inbound bot message',
  );
  return null;
}

/** Экспорт для тестов контракта URL miniapp (`/app/max`, `next=`). */
export async function buildMaxLinks(
  data: MaxUpdateValidated,
  appBaseUrl: string | undefined,
): Promise<Record<string, unknown>> {
  const maxId = data.message?.sender?.user_id ?? data.callback?.user?.user_id ?? data.user?.user_id;
  if (maxId == null || typeof maxId !== 'number') return {};
  const sender = data.message?.sender ?? data.callback?.user ?? data.user;
  const displayName =
    sender?.first_name != null || sender?.last_name != null
      ? [sender?.first_name, sender?.last_name].filter(Boolean).join(' ').trim() || undefined
      : (sender?.name ?? undefined);
  const appBase = (appBaseUrl ?? env.APP_BASE_URL).trim().replace(/\/+$/, '');
  const remindersUrl =
    appBase.startsWith('http://') || appBase.startsWith('https://')
      ? `${appBase}/app/patient/reminders`
      : undefined;
  // Track D (#987): no user identity travels in the token — `bindings.maxId` is the canonical
  // reference and webapp resolves it against an EXISTING `user_channel_bindings` row.
  const webappEntryUrl = buildWebappEntryUrlForMax(
    {
      maxId: String(maxId),
      ...(displayName ? { displayName } : {}),
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
  getAppBaseUrl: MaxWebhookDeps['getAppBaseUrl'],
  resolveMessengerStaffAdmin?: ResolveMessengerStaffAdmin,
): Promise<Record<string, unknown>> {
  const appBaseUrl = getAppBaseUrl ? await getAppBaseUrl() : undefined;
  const chatId = data.message?.recipient?.chat_id ?? data.chat_id;
  const senderUserId =
    data.callback?.user?.user_id ?? data.message?.sender?.user_id ?? data.user?.user_id;
  const actorId =
    senderUserId != null ? String(senderUserId) : chatId != null ? String(chatId) : '';
  const dbAdmin =
    actorId && resolveMessengerStaffAdmin
      ? await resolveMessengerStaffAdmin('max', actorId)
      : false;
  const isAdmin = dbAdmin;
  return {
    ...(await buildMaxLinks(data, appBaseUrl)),
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
  if (deps.setupProviderSurface !== false) await setupMaxCommands();
  const readRuntimeConfig = deps.getRuntimeConfig ?? getMaxRuntimeConfig;
  const getAppBaseUrl = deps.getAppBaseUrl;
  const resolveMessengerStaffAdmin = deps.resolveMessengerStaffAdmin;

  app.post('/webhook/max', async (request, reply) => {
    const correlationId = request.id;
    const eventId = newEventId('incoming');
    const reqLogger = getRequestLogger(request.id, { correlationId, eventId });

    try {
      const config = await readRuntimeConfig();
      if (!config.enabled) return reply.code(503).send({ ok: false, error: 'Unavailable' });
      const headerSecret = request.headers['x-max-bot-api-secret'];
      if (!isWebhookSecretValid(headerSecret, config.webhookSecret)) {
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
              },
            },
            '[max] /start classified',
          );
        }
      }

      const preRouting = await runWithDbBootstrapPrincipal(
        { source: 'max-webhook:pre-routing' },
        async () => ({
          facts: await buildMaxFacts(parseResult.data, getAppBaseUrl, resolveMessengerStaffAdmin),
          organizationId: await resolveMaxOrganizationId(data, deps, reqLogger),
        }),
      );

      const event = maxIncomingToEvent({
        incoming,
        correlationId,
        eventId,
        facts: preRouting.facts,
      });
      const organizationId = preRouting.organizationId;
      const handleEvent = (): Promise<Awaited<ReturnType<EventGateway['handleIncomingEvent']>>> =>
        deps.eventGateway.handleIncomingEvent(event);
      // Принципал входящего вебхука — организация (Track D, #987: мессенджер-логин больше не
      // разрешается ни в какую публичную числовую личность).
      const result = organizationId
        ? await runWithOrganizationPrincipal(organizationId, handleEvent)
        : await runWithDbBootstrapPrincipal({ source: 'max-webhook:unresolved-org' }, handleEvent);
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
        httpStatusReturned: 503,
        errorClass: 'webhook_internal_error',
        detail: msg,
      });
      return reply.code(503).send({ ok: false, error: 'Internal error' });
    }
  });

  app.post<{ Params: { credentialFingerprint: string } }>(
    '/webhook/max/dedicated/:credentialFingerprint',
    async (request, reply) => {
      const correlationId = request.id;
      const eventId = newEventId('incoming');
      const reqLogger = getRequestLogger(request.id, { correlationId, eventId });
      const fingerprint = request.params.credentialFingerprint;
      const organizationId = await deps.resolveDedicatedClinicBotOrganization?.(fingerprint);
      if (!organizationId) {
        reqLogger.warn({ source: 'max' }, 'max dedicated webhook: unknown bot binding');
        recordMaxWebhookOutcome({
          source: 'max',
          processedOk: false,
          httpStatusReturned: 200,
          errorClass: 'webhook_auth_failed',
          detail: 'unknown dedicated bot binding',
        });
        return reply.code(200).send({ ok: false, error: 'Unknown bot' });
      }
      const parseResult = parseMaxUpdate(request.body);
      if (!parseResult.success) {
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
      const clinicApiKey = await deps.resolveDedicatedClinicBotApiKey?.(organizationId);
      const incoming = fromMax(data, clinicApiKey ?? undefined);
      if (!incoming) return reply.code(200).send({ ok: true });
      const preRouting = await runWithDbBootstrapPrincipal(
        { source: 'max-dedicated-webhook:pre-routing' },
        async () => ({
          facts: await buildMaxFacts(data, deps.getAppBaseUrl, deps.resolveMessengerStaffAdmin),
        }),
      );
      const event = maxIncomingToEvent({
        incoming,
        correlationId,
        eventId,
        facts: preRouting.facts,
      });
      // Прямая пересылка входящего в чат клиники (owner 20.08). Тот же прикладной action, что и в
      // Telegram: различие только в адресации получателя внутри самого action.
      if (deps.dedicatedBotInboundForward) {
        await runWithOrganizationPrincipal(organizationId, () =>
          forwardDedicatedBotInbound(
            {
              channel: 'max',
              organizationId,
              incoming,
              eventId,
              correlationId,
            },
            deps.dedicatedBotInboundForward!,
          ),
        );
      }
      const result = await runWithOrganizationPrincipal(organizationId, () =>
        deps.eventGateway.handleIncomingEvent(event),
      );
      if (result.status === 'rejected') {
        recordMaxWebhookOutcome({
          source: 'max',
          processedOk: false,
          httpStatusReturned: 200,
          errorClass: 'webhook_dispatch_failed',
          detail: result.reason,
        });
        return reply.code(200).send({ ok: false, error: 'Processing failed' });
      }
      recordMaxWebhookOutcome({ source: 'max', processedOk: true, httpStatusReturned: 200 });
      return reply.code(200).send({ ok: true });
    },
  );
}
