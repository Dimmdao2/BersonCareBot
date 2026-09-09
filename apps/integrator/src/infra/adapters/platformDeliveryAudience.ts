/**
 * One typed platform-brand selector for every outbound delivery chokepoint.
 * Clinic credentials remain a patient-only override and are resolved separately by dispatchPort.
 */
import type { OutgoingIntent } from '../../kernel/contracts/index.js';

export type PlatformDeliveryAudience = 'staff' | 'patient';

type DeliveryPayload = {
  delivery?: { audience?: unknown; senderScope?: unknown };
};

export function resolvePlatformDeliveryAudience(intent: OutgoingIntent): PlatformDeliveryAudience {
  if (intent.type !== 'message.send') return 'patient';
  const delivery = (intent.payload as DeliveryPayload).delivery;
  if (delivery?.audience === 'staff') return 'staff';
  if (delivery?.audience === 'patient') return 'patient';
  // Clinic-owned senders are only a patient-facing override. Existing patient producers already
  // carry this scope, while legacy unmarked traffic remains on the patient-safe platform brand.
  if (
    delivery?.senderScope === 'clinic_if_configured' ||
    delivery?.senderScope === 'clinic_required'
  ) {
    return 'patient';
  }
  return 'patient';
}

export function platformCredentialKey(
  audience: PlatformDeliveryAudience,
  channel: 'email' | 'telegram' | 'max',
):
  | 'therapygo_smtp_outbound'
  | 'therapysto_smtp_outbound'
  | 'therapygo_telegram_bot_token'
  | 'therapysto_telegram_bot_token'
  | 'therapygo_max_bot_api_key'
  | 'therapysto_max_bot_api_key' {
  if (channel === 'email') {
    return audience === 'staff' ? 'therapysto_smtp_outbound' : 'therapygo_smtp_outbound';
  }
  if (channel === 'telegram') {
    return audience === 'staff' ? 'therapysto_telegram_bot_token' : 'therapygo_telegram_bot_token';
  }
  return audience === 'staff' ? 'therapysto_max_bot_api_key' : 'therapygo_max_bot_api_key';
}
