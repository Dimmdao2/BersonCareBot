/**
 * PATCH normalization for the EXISTING per-org dedicated bot keys
 * (`clinic_telegram_bot_token`, `clinic_max_bot_api_key`).
 *
 * One point, parameterised by channel (AGENTS.md §5 «Один общий проход»): Telegram and MAX differ
 * only in which registry key holds the envelope, so there is one normalizer, not two.
 *
 * It merges the public half (`botPublicId`, `inboundForwarding`) into the same envelope that
 * already carries the credential in `value` and `deliveryReadiness` as a sibling.
 */
import {
  normalizeClinicBotDestinationChatId,
  normalizeClinicBotPublicId,
  parseClinicBotPublicConfig,
  withClinicBotPublicConfig,
  type ClinicBotInboundForwarding,
} from './clinicBotConfig';

export type ClinicBotPatchError =
  | 'credential_required'
  | 'invalid_bot_public_id'
  | 'invalid_destination_chat_id'
  | 'forwarding_destination_required';

export type ClinicBotPatchResult =
  | {
      ok: true;
      valueJson: Record<string, unknown>;
      /** Only a real credential change invalidates the live provider probe. */
      credentialChanged: boolean;
    }
  | { ok: false; error: ClinicBotPatchError };

function storedCredential(valueJson: unknown): string {
  if (valueJson === null || typeof valueJson !== 'object' || Array.isArray(valueJson)) return '';
  const raw = (valueJson as Record<string, unknown>).value;
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * `patchEnvelope` is the route-normalized `{ value: … }` plus the optional public fields as
 * siblings — the same shape the settings UI sends and the same shape that is stored.
 */
export function parseClinicBotPatchValue(input: {
  patchEnvelope: unknown;
  existingValueJson: unknown;
}): ClinicBotPatchResult {
  const patch =
    input.patchEnvelope !== null &&
    typeof input.patchEnvelope === 'object' &&
    !Array.isArray(input.patchEnvelope)
      ? (input.patchEnvelope as Record<string, unknown>)
      : {};

  const submittedCredential = typeof patch.value === 'string' ? patch.value.trim() : '';
  const existingCredential = storedCredential(input.existingValueJson);
  // Write-only credential input: an empty field means «keep the stored token», exactly like the
  // clinic SMTP password field. A clinic that never saved one cannot configure a bot at all.
  const credential = submittedCredential || existingCredential;
  if (!credential) return { ok: false, error: 'credential_required' };

  const previous = parseClinicBotPublicConfig(input.existingValueJson);

  let botPublicId = previous.botPublicId;
  if (Object.prototype.hasOwnProperty.call(patch, 'botPublicId')) {
    const raw = patch.botPublicId;
    if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      botPublicId = null;
    } else {
      const normalized = normalizeClinicBotPublicId(raw);
      if (!normalized) return { ok: false, error: 'invalid_bot_public_id' };
      botPublicId = normalized;
    }
  }

  let inboundForwarding: ClinicBotInboundForwarding | null = previous.inboundForwarding;
  if (Object.prototype.hasOwnProperty.call(patch, 'inboundForwarding')) {
    const raw = patch.inboundForwarding;
    if (raw === null) {
      inboundForwarding = null;
    } else if (typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'invalid_destination_chat_id' };
    } else {
      const record = raw as Record<string, unknown>;
      if (
        !Object.prototype.hasOwnProperty.call(record, 'enabled') ||
        typeof record.enabled !== 'boolean' ||
        !Object.prototype.hasOwnProperty.call(record, 'destinationChatId')
      ) {
        return { ok: false, error: 'invalid_destination_chat_id' };
      }
      const enabled = record.enabled;
      const rawDestination = record.destinationChatId;
      const hasDestination =
        rawDestination !== null && rawDestination !== undefined && String(rawDestination).trim();
      const destinationChatId = hasDestination
        ? normalizeClinicBotDestinationChatId(rawDestination)
        : '';
      if (destinationChatId === null) return { ok: false, error: 'invalid_destination_chat_id' };
      // Owner 20.08: «id чата … без него пересылку включить нельзя».
      if (enabled && !destinationChatId) {
        return { ok: false, error: 'forwarding_destination_required' };
      }
      inboundForwarding = { enabled, destinationChatId };
    }
  }

  const merged = withClinicBotPublicConfig(
    { ...(typeof input.existingValueJson === 'object' && input.existingValueJson !== null &&
      !Array.isArray(input.existingValueJson)
        ? (input.existingValueJson as Record<string, unknown>)
        : {}),
      value: credential },
    { botPublicId, inboundForwarding },
  );

  return { ok: true, valueJson: merged, credentialChanged: credential !== existingCredential };
}
