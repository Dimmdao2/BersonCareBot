import type { SystemSettingKey } from '@/modules/system-settings/types';

export const BOOKING_LOCATION_PALETTE_SETTING_KEY =
  'booking_location_default_palette' as const satisfies SystemSettingKey;

export type BookingLocationPalette = Readonly<{
  physicalPalette: readonly string[];
  online: string;
}>;

export const DEFAULT_BOOKING_LOCATION_PALETTE: BookingLocationPalette = Object.freeze({
  physicalPalette: Object.freeze(['#2563EB', '#16A34A', '#F59E0B', '#DC2626', '#7C3AED']),
  online: '#7C3AED',
});

const HEX_COLOR_RE = /^#[0-9A-F]{6}$/;
const MIN_PHYSICAL_COLORS = 5;
const MAX_PHYSICAL_COLORS = 64;

export function normalizeLocationHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return HEX_COLOR_RE.test(normalized) ? normalized : null;
}

function unwrapSettingValue(valueJson: unknown): unknown {
  if (
    valueJson !== null &&
    typeof valueJson === 'object' &&
    !Array.isArray(valueJson) &&
    'value' in valueJson
  ) {
    return (valueJson as { value?: unknown }).value;
  }
  return valueJson;
}

/** Strict persisted-value validator. A partially invalid setting never leaks into branch creation. */
export function normalizeBookingLocationPalette(valueJson: unknown): BookingLocationPalette | null {
  const value = unwrapSettingValue(valueJson);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as { physicalPalette?: unknown; online?: unknown };
  if (!Array.isArray(candidate.physicalPalette)) return null;
  if (
    candidate.physicalPalette.length < MIN_PHYSICAL_COLORS ||
    candidate.physicalPalette.length > MAX_PHYSICAL_COLORS
  ) {
    return null;
  }
  const physicalPalette = candidate.physicalPalette.map(normalizeLocationHexColor);
  if (physicalPalette.some((color) => color === null)) return null;
  const online = normalizeLocationHexColor(candidate.online);
  if (!online) return null;
  return { physicalPalette: physicalPalette as string[], online };
}

export function resolveBookingLocationPalette(valueJson: unknown): BookingLocationPalette {
  return normalizeBookingLocationPalette(valueJson) ?? DEFAULT_BOOKING_LOCATION_PALETTE;
}

export function bookingLocationPaletteEnvelope(value: BookingLocationPalette): {
  value: BookingLocationPalette;
} {
  return { value };
}

export function physicalLocationColorAt(
  physicalLocationCount: number,
  palette: BookingLocationPalette,
): string {
  if (!Number.isSafeInteger(physicalLocationCount) || physicalLocationCount < 0) {
    throw new Error('invalid_physical_location_count');
  }
  return palette.physicalPalette[physicalLocationCount % palette.physicalPalette.length]!;
}
