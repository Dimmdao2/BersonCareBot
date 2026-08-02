import type {
  OutboundMessageCapability,
  OutboundMessageClass,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';
import { readChannel } from './channelRouting.js';

export const OUTBOUND_MESSAGE_POLICY_DENIED = 'OUTBOUND_MESSAGE_POLICY_DENIED';

type OutboundPolicyDenialReason =
  | 'channel_missing_or_unknown'
  | 'missing_or_invalid_marker'
  | 'capability_not_allowed_for_channel';

export class OutboundMessagePolicyError extends Error {
  readonly code = OUTBOUND_MESSAGE_POLICY_DENIED;

  constructor(readonly reason: OutboundPolicyDenialReason) {
    super(OUTBOUND_MESSAGE_POLICY_DENIED);
    this.name = 'OutboundMessagePolicyError';
  }
}

export function isOutboundMessagePolicyDenied(error: unknown): error is OutboundMessagePolicyError {
  return (
    error instanceof OutboundMessagePolicyError ||
    (error instanceof Error && error.message === OUTBOUND_MESSAGE_POLICY_DENIED)
  );
}

function hasMarker(
  intent: OutgoingIntent,
  messageClass: OutboundMessageClass,
  capability: OutboundMessageCapability,
): boolean {
  return (
    intent.meta.outboundMessageClass === messageClass &&
    intent.meta.outboundCapability === capability
  );
}

/**
 * The single central external-egress matrix. It intentionally does not infer trust from
 * event ids, sources, caller metadata, or legacy queue shape: only a typed marker created by
 * a dedicated trusted path may cross this boundary.
 */
export function assertOutboundMessagePolicy(intent: OutgoingIntent): string {
  // N1 confines only external message sends. Callback/edit/delete retirement belongs to N4.
  if (intent.type !== 'message.send') return '';
  const channel = readChannel(intent);
  if (!channel || !['telegram', 'max', 'email', 'smsc', 'web_push'].includes(channel)) {
    throw new OutboundMessagePolicyError('channel_missing_or_unknown');
  }
  const hasRecognizedMarker =
    hasMarker(intent, 'auth_code', 'auth_code') ||
    hasMarker(intent, 'auth_code', 'contact_handshake') ||
    hasMarker(intent, 'routine_product', 'app_push') ||
    hasMarker(intent, 'conversation_event', 'app_push') ||
    hasMarker(intent, 'broadcast_event', 'app_push') ||
    hasMarker(intent, 'account_service', 'app_push') ||
    hasMarker(intent, 'operator_security', 'app_push') ||
    hasMarker(intent, 'routine_product', 'essential_delivery') ||
    hasMarker(intent, 'broadcast_event', 'clinic_delivery') ||
    hasMarker(intent, 'operator_security', 'operator_alert');
  if (!hasRecognizedMarker) {
    throw new OutboundMessagePolicyError('missing_or_invalid_marker');
  }

  if (
    hasMarker(intent, 'operator_security', 'operator_alert') &&
    ['telegram', 'max', 'email', 'smsc', 'web_push'].includes(channel)
  )
    return channel;

  if (channel === 'telegram' || channel === 'max') {
    if (
      hasMarker(intent, 'auth_code', 'auth_code') ||
      hasMarker(intent, 'auth_code', 'contact_handshake')
    ) {
      return channel;
    }
    if (
      hasMarker(intent, 'routine_product', 'essential_delivery') ||
      hasMarker(intent, 'broadcast_event', 'clinic_delivery')
    ) {
      return channel;
    }
    throw new OutboundMessagePolicyError('capability_not_allowed_for_channel');
  }
  if (channel === 'email' || channel === 'smsc') {
    if (
      hasMarker(intent, 'auth_code', 'auth_code') ||
      hasMarker(intent, 'routine_product', 'essential_delivery') ||
      hasMarker(intent, 'broadcast_event', 'clinic_delivery')
    )
      return channel;
    throw new OutboundMessagePolicyError('capability_not_allowed_for_channel');
  }
  if (
    hasMarker(intent, 'routine_product', 'app_push') ||
    hasMarker(intent, 'conversation_event', 'app_push') ||
    hasMarker(intent, 'broadcast_event', 'app_push') ||
    hasMarker(intent, 'account_service', 'app_push') ||
    hasMarker(intent, 'operator_security', 'app_push')
  )
    return channel;
  throw new OutboundMessagePolicyError('capability_not_allowed_for_channel');
}
