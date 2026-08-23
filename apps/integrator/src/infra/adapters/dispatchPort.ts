import type {
  DeliveryAdapter,
  DeliverySendResult,
  DispatchPort,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';
import {
  isDevRedirectActive,
  isDevRedirectPassthrough,
  buildDevPrefix,
  hasDevPrefix,
  resolveDevRedirect,
} from '../../shared/devDeliveryRedirect.js';
import { logger } from '../observability/logger.js';
import { readChannel } from './channelRouting.js';
import { assertOutboundMessagePolicy } from './outboundMessagePolicy.js';
import type {
  ClinicDeliveryChannel,
  ClinicDeliveryCredential,
} from '../db/clinicDeliveryCredentials.js';

export type DispatchPlatformIntegrationId = 'telegram' | 'max' | 'vk' | 'email' | 'smsc' | 'web_push';

type DeliveryPayload = {
  recipient?: { chatId?: unknown; phoneNormalized?: unknown };
  message?: { text?: unknown };
  delivery?: {
    channels?: unknown;
    maxAttempts?: unknown;
    senderScope?: unknown;
    clinicCredential?: ClinicDeliveryCredential;
  };
} & Record<string, unknown>;

type ClinicSenderScope = 'clinic_required' | 'clinic_preferred' | 'platform_required';

function clinicSenderScope(intent: OutgoingIntent): ClinicSenderScope {
  // Platform/system traffic must never borrow a clinic credential merely because the request
  // happens to run under an organization principal.
  if (
    intent.meta.outboundMessageClass === 'operator_security' &&
    intent.meta.outboundCapability === 'operator_alert'
  ) {
    return 'platform_required';
  }
  if (intent.type !== 'message.send') return 'clinic_preferred';
  const scope = (intent.payload as DeliveryPayload).delivery?.senderScope;
  return scope === 'clinic_required' ? 'clinic_required' : 'clinic_preferred';
}

function asClinicDeliveryChannel(channel: string): ClinicDeliveryChannel | null {
  return channel === 'email' || channel === 'smsc' || channel === 'telegram' || channel === 'max' || channel === 'vk'
    ? channel
    : null;
}

function withClinicCredential(
  intent: OutgoingIntent,
  credential: ClinicDeliveryCredential,
): OutgoingIntent {
  if (intent.type !== 'message.send') return intent;
  const payload = intent.payload as DeliveryPayload;
  return {
    ...intent,
    payload: {
      ...payload,
      delivery: { ...(payload.delivery ?? {}), clinicCredential: credential },
    },
  };
}

function withChannel(intent: OutgoingIntent, channel: string): OutgoingIntent {
  if (intent.type !== 'message.send') return intent;
  const payload = (intent.payload ?? {}) as DeliveryPayload;
  const delivery = { ...(payload.delivery ?? {}), channels: [channel] };
  return {
    ...intent,
    payload: {
      ...payload,
      delivery,
    },
  };
}

function platformIntegrationIdForChannel(channel: string): DispatchPlatformIntegrationId | null {
  if (channel === 'sms' || channel === 'smsc') return 'smsc';
  if (
    channel === 'telegram' ||
    channel === 'max' ||
    channel === 'vk' ||
    channel === 'email' ||
    channel === 'web_push'
  ) {
    return channel;
  }
  return null;
}

/** Sentinel returned by the pre-fork redirect when a send must be suppressed. */
const SUPPRESS = Symbol('dev_redirect_suppress');
type RedirectResult = OutgoingIntent | typeof SUPPRESS;

/**
 * PRE-FORK DEV DELIVERY REDIRECT (primary, authoritative override layer).
 *
 * When active (NODE_ENV !== 'production' OR DEV_DELIVERY_REDIRECT=1), every
 * outgoing intent is redirected to the dev TEST USER's binding FOR ITS OWN CHANNEL
 * BEFORE it branches to any channel adapter:
 *   telegram → his telegram chat, max → his max id, sms/smsc → his phone,
 *   email → his email, web_push → his subscription (via pushUserId).
 * The channel is PRESERVED so the tester experiences the real client app per channel.
 *
 * If the test user has NO binding for the intent's channel (or the channel is
 * unknown), the send is SUPPRESSED — `applyPreForkDevRedirect` returns the SUPPRESS
 * sentinel and `dispatchOutgoing` short-circuits without reaching any adapter. This
 * guarantees a send NEVER reaches a real client and NEVER a different person (D7).
 *
 * This is the SINGLE chokepoint (owner's hard rule: no per-channel duplication).
 * Per-channel guards in telegram/max clients remain as defense-in-depth.
 *
 * Pure function of env + intent — no DB, no IO (keeps the hot path cheap).
 */
function applyPreForkDevRedirect(intent: OutgoingIntent): RedirectResult {
  if (!isDevRedirectActive()) return intent;

  const payload = (intent.payload ?? {}) as DeliveryPayload & Record<string, unknown>;

  // Read original recipient for logging/prefix.
  const origRecipient = payload.recipient as Record<string, unknown> | undefined;
  const origChatId = origRecipient?.chatId;
  const originalId =
    typeof origChatId === 'number'
      ? origChatId
      : typeof origChatId === 'string'
        ? origChatId
        : ((origRecipient?.email as string | undefined) ??
          (origRecipient?.phoneNormalized as string | undefined) ??
          (origRecipient?.pushUserId as string | undefined) ??
          (origRecipient?.userId as string | number | undefined) ??
          intent.meta.source ??
          'unknown');

  const intendedChannel = readChannel(intent);

  // PASSTHROUGH: a recipient that is a KNOWN TEST ACCOUNT (env allowlist) is
  // delivered UNCHANGED so multi-tester flows (doctor↔patient chat/comments/OTP)
  // can be exercised in-vivo on a real-data test env. The allowlist is empty by
  // default, so this never fires — and real clients stay redirected/suppressed —
  // unless an operator explicitly opts in via DEV_REDIRECT_PASSTHROUGH_*.
  if (isDevRedirectPassthrough(intendedChannel, origRecipient)) {
    logger.warn(
      {
        passthroughRecipient: originalId,
        intendedChannel,
        intentType: intent.type,
      },
      'PRE_FORK_DEV_DELIVERY_PASSTHROUGH',
    );
    return intent;
  }

  const outcome = resolveDevRedirect(intendedChannel);

  if (outcome.kind === 'suppress') {
    logger.warn(
      {
        intendedRecipient: originalId,
        intendedChannel,
        intentType: intent.type,
        suppressReason: outcome.reason,
      },
      'PRE_FORK_DEV_DELIVERY_REDIRECT_SUPPRESS',
    );
    return SUPPRESS;
  }

  logger.warn(
    {
      intendedRecipient: originalId,
      intendedChannel,
      sentTo: outcome.label,
      sentChannel: outcome.deliveryChannel,
      intentType: intent.type,
    },
    'PRE_FORK_DEV_DELIVERY_REDIRECT',
  );

  // Prefix text body (message.send carries message.text; others may not have text).
  const origMessage = payload.message as Record<string, unknown> | undefined;
  const origText = typeof origMessage?.text === 'string' ? origMessage.text : undefined;
  const newText =
    origText !== undefined && !hasDevPrefix(origText)
      ? buildDevPrefix(originalId) + origText
      : origText;

  const newMessage =
    origMessage !== undefined
      ? { ...origMessage, ...(newText !== undefined ? { text: newText } : {}) }
      : undefined;

  // Preserve the channel; only rewrite delivery.channels[0] to the canonical wire value.
  const origDelivery = payload.delivery as Record<string, unknown> | undefined;
  const newDelivery =
    origDelivery !== undefined
      ? { ...origDelivery, channels: [outcome.deliveryChannel] }
      : { channels: [outcome.deliveryChannel] };

  return {
    ...intent,
    meta: {
      ...intent.meta,
      source: outcome.deliveryChannel,
    },
    payload: {
      ...payload,
      // Fresh recipient object containing ONLY this channel's id field(s) — no real
      // email/phone/pushUserId/userId from the original intent can survive.
      recipient: outcome.recipient,
      ...(newMessage !== undefined ? { message: newMessage } : {}),
      delivery: newDelivery,
    },
  };
}

/**
 * Builds unified dispatch pipeline with retries and fallback channels.
 * Channel order comes from domain-provided `payload.delivery.channels`.
 *
 * This port does not write a delivery-attempt record for any outcome (success, dev-redirect
 * suppression, or provider failure). Track D final cutover (#987), audit F5/F6: a delivery-attempt
 * row is allowed only after a real failed provider call, tied to the real
 * `outgoing_delivery_queue` row id, with a real increasing attempt number — none of which this
 * generic per-call chokepoint has (it is called for non-queue-backed sends too: OTP/booking/admin
 * relay routes). The queue-backed worker owns that row and records the one real failed attempt
 * itself, at the existing seam where it already has both facts —
 * see `handleDispatchFailure` in outgoingDeliveryWorker.ts.
 */
export function createDefaultDispatchPort(deps: {
  adapters: DeliveryAdapter[];
  readPort?: unknown;
  isPlatformIntegrationEnabled?: (integrationId: DispatchPlatformIntegrationId) => Promise<boolean>;
  /** Exact-org tariff + credential resolver. It never returns a platform fallback credential. */
  resolveClinicDeliveryCredential?: (
    channel: ClinicDeliveryChannel,
  ) => Promise<ClinicDeliveryCredential | null>;
}): DispatchPort {
  return {
    async dispatchOutgoing(intent: OutgoingIntent): Promise<DeliverySendResult> {
      // Policy is the first egress operation: denied payloads cannot be redirected, logged,
      // adapter-selected, or passed to a provider.
      assertOutboundMessagePolicy(intent);
      // PRIMARY DEV REDIRECT: override before the channel fork so no adapter can
      // ever be reached with a real recipient in non-production environments.
      const safeIntent = applyPreForkDevRedirect(intent);

      // SUPPRESS: the test user has no binding for this channel (or unknown channel).
      // No-op success — never reach an adapter, never a real client (D7). No provider was ever
      // called, so this is not a delivery attempt (F5) — the suppression itself is still fully
      // observable via the PRE_FORK_DEV_DELIVERY_REDIRECT_SUPPRESS warning above.
      if (safeIntent === SUPPRESS) {
        return {};
      }

      const channel = readChannel(safeIntent);
      if (!channel) throw new Error('CHANNEL_NOT_SPECIFIED');
      const integrationId = platformIntegrationIdForChannel(channel);
      if (
        integrationId &&
        deps.isPlatformIntegrationEnabled &&
        !(await deps.isPlatformIntegrationEnabled(integrationId))
      ) {
        throw new Error(`PLATFORM_INTEGRATION_DISABLED:${integrationId}`);
      }
      const intentForChannel = withChannel(safeIntent, channel);
      const adapter = deps.adapters.find((item) => item.canHandle(intentForChannel));
      if (!adapter) throw new Error(`CHANNEL_NOT_SUPPORTED:${channel}`);
      // A thrown providerError here is a real failed provider call. The caller (queue worker) is
      // the one that knows the real outgoing_delivery_queue row id and its current attempt count
      // — it records the one real attempt itself in handleDispatchFailure, after classifying
      // recipient_blocked_bot the same way this port used to (F5: a blocked-bot rejection is not a
      // delivery attempt either, it is an expected terminal state, same treatment as dev-redirect
      // suppression). This port propagates the error unchanged and writes nothing.
      let sendResult: DeliverySendResult | void;
      const clinicChannel = asClinicDeliveryChannel(channel);
      const senderScope = clinicSenderScope(intentForChannel);
      const clinicCredential =
        senderScope !== 'platform_required' && clinicChannel && deps.resolveClinicDeliveryCredential
          ? await deps.resolveClinicDeliveryCredential(clinicChannel)
          : null;
      if (senderScope === 'clinic_required' && !clinicCredential) {
        throw new Error(`CLINIC_CHANNEL_NOT_CONFIGURED:${channel}`);
      }
      if (clinicCredential) {
        try {
          sendResult = await adapter.send(withClinicCredential(intentForChannel, clinicCredential));
        } catch (clinicError) {
          // Essential traffic remains deliverable through the platform. Clinic-required flows
          // (broadcasts and bot support) must never silently assume the platform sender.
          if (senderScope === 'clinic_required') throw clinicError;
          sendResult = await adapter.send(intentForChannel);
        }
      } else {
        sendResult = await adapter.send(intentForChannel);
      }
      // Success, or a completed-but-skipped webPushOutcome, is not a delivery attempt (F5): the
      // surviving outgoing_delivery_queue row's own status/sent_at/failure_class is the lifecycle
      // fact; a duplicate success/skip journal entry is exactly the second journal Track D retired.
      return sendResult ?? {};
    },
  };
}
