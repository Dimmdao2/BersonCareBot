import type { ModesFormKey } from './modesFormKeys';
import { normalizeTestAccountIdentifiersValue } from './testAccounts';

export function normalizeValueJson(value: unknown): { value: unknown } {
  if (
    value !== null &&
    typeof value === 'object' &&
    'value' in (value as Record<string, unknown>)
  ) {
    return value as { value: unknown };
  }
  return { value };
}

/**
 * Normalizes one «Режимы» form key the same way as PATCH /api/admin/settings for that key.
 * `rawBodyValue` is the request `value` field (same as single PATCH `parsed.data.value`).
 */
export function normalizeModesFormPatchItem(
  key: ModesFormKey,
  rawBodyValue: unknown,
): { ok: true; valueJson: { value: unknown } } | { ok: false } {
  let normalizedValue = normalizeValueJson(rawBodyValue);

  if (
    key === 'patient_app_maintenance_enabled' ||
    key === 'patient_program_discussion_doctor_reply_from_log_enabled' ||
    key === 'patient_program_discussion_ui_enabled' ||
    key === 'patient_program_discussion_media_submission_enabled'
  ) {
    const inner = normalizedValue.value;
    const b =
      typeof inner === 'boolean'
        ? inner
        : inner === 'true' || inner === 1
          ? true
          : inner === 'false' || inner === 0
            ? false
            : null;
    if (b === null) return { ok: false };
    normalizedValue = { value: b };
    return { ok: true, valueJson: normalizedValue };
  }

  if (key === 'patient_app_maintenance_message') {
    const inner = normalizedValue.value;
    if (inner !== null && typeof inner !== 'string') return { ok: false };
    const s = typeof inner === 'string' ? inner.trim() : '';
    if (s.length > 500) return { ok: false };
    normalizedValue = { value: s };
    return { ok: true, valueJson: normalizedValue };
  }

  if (key === 'patient_booking_url') {
    const inner = normalizedValue.value;
    if (inner !== null && typeof inner !== 'string') return { ok: false };
    const raw = typeof inner === 'string' ? inner.trim() : '';
    if (raw.length === 0) {
      normalizedValue = { value: '' };
    } else {
      try {
        const u = new URL(raw);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false };
      } catch {
        return { ok: false };
      }
      normalizedValue = { value: raw };
    }
    return { ok: true, valueJson: normalizedValue };
  }

  if (key === 'test_account_identifiers') {
    const inner = normalizedValue.value;
    const cleaned = normalizeTestAccountIdentifiersValue(inner);
    if (cleaned === null) return { ok: false };
    normalizedValue = { value: cleaned };
    return { ok: true, valueJson: normalizedValue };
  }

  return { ok: true, valueJson: normalizedValue };
}

export type ModesFormBatchItem = { key: ModesFormKey; value: unknown };

/**
 * Normalizes a full «Режимы» batch in request order (one pass; first invalid index stops).
 */
export function normalizeModesFormBatchItems(
  items: ModesFormBatchItem[],
):
  | { ok: true; rows: { key: ModesFormKey; valueJson: { value: unknown } }[] }
  | { ok: false; atIndex: number; key?: ModesFormKey } {
  const rows: { key: ModesFormKey; valueJson: { value: unknown } }[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const r = normalizeModesFormPatchItem(it.key, it.value);
    if (!r.ok) return { ok: false, atIndex: i, key: it.key };
    rows.push({ key: it.key, valueJson: r.valueJson });
  }
  return { ok: true, rows };
}
