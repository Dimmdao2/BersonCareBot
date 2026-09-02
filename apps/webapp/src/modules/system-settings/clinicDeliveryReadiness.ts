export const CLINIC_DELIVERY_READINESS_FIELD = 'deliveryReadiness';

export type ClinicDeliveryReadiness =
  | { status: 'pending' }
  | { status: 'enabled'; checkedAt: string }
  | { status: 'failed'; checkedAt: string; reason: string };

const PENDING: ClinicDeliveryReadiness = { status: 'pending' };

function envelope(valueJson: unknown): Record<string, unknown> | null {
  return valueJson !== null && typeof valueJson === 'object' && !Array.isArray(valueJson)
    ? (valueJson as Record<string, unknown>)
    : null;
}

export function parseClinicDeliveryReadiness(valueJson: unknown): ClinicDeliveryReadiness {
  const raw = envelope(valueJson)?.[CLINIC_DELIVERY_READINESS_FIELD];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return PENDING;
  const record = raw as Record<string, unknown>;
  if (record.status === 'enabled' && typeof record.checkedAt === 'string') {
    return { status: 'enabled', checkedAt: record.checkedAt };
  }
  if (
    record.status === 'failed' &&
    typeof record.checkedAt === 'string' &&
    typeof record.reason === 'string' &&
    record.reason.trim()
  ) {
    return { status: 'failed', checkedAt: record.checkedAt, reason: record.reason.trim() };
  }
  return PENDING;
}

/**
 * Rewrites ONLY the readiness sibling. Every other sibling of `value` survives — the dedicated
 * bot keys keep their public half (`botPublicId`, `inboundForwarding`) here, so a live channel
 * probe cannot silently erase the clinic's forwarding настройки.
 */
export function withClinicDeliveryReadiness(
  valueJson: unknown,
  readiness: ClinicDeliveryReadiness,
): { value: unknown; deliveryReadiness: ClinicDeliveryReadiness } & Record<string, unknown> {
  const current = envelope(valueJson);
  return {
    ...(current ?? {}),
    value: current && 'value' in current ? current.value : valueJson,
    deliveryReadiness: readiness,
  };
}

export function withPendingClinicDeliveryReadiness(valueJson: unknown) {
  return withClinicDeliveryReadiness(valueJson, PENDING);
}
