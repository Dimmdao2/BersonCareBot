import { formatIsoInstantAsRubitimeRecordLocal } from '../../config/appTimezone.js';

function asIsoString(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return value.trim();
}

/** Map webapp canonical patch keys to Rubitime API2 update-record body fields. */
export function normalizeRubitimeUpdateRecordPatch(
  patch: Record<string, unknown>,
  timeZone: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const slotStart = asIsoString(patch.slotStart);
  const slotEnd = asIsoString(patch.slotEnd);
  const record = asIsoString(patch.record);
  const datetimeEnd = asIsoString(patch.datetime_end);

  if (record) {
    out.record = formatIsoInstantAsRubitimeRecordLocal(record, timeZone);
  } else if (slotStart) {
    out.record = formatIsoInstantAsRubitimeRecordLocal(slotStart, timeZone);
  }

  if (datetimeEnd) {
    out.datetime_end = formatIsoInstantAsRubitimeRecordLocal(datetimeEnd, timeZone);
  } else if (slotEnd) {
    out.datetime_end = formatIsoInstantAsRubitimeRecordLocal(slotEnd, timeZone);
  }

  for (const key of ['branch_id', 'service_id', 'cooperator_id', 'status'] as const) {
    const v = patch[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = Math.trunc(v);
      continue;
    }
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.trim());
      if (Number.isFinite(n)) out[key] = Math.trunc(n);
    }
  }

  return out;
}

export function isRubitimeUpdateRecordPatchEmpty(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).length === 0;
}
