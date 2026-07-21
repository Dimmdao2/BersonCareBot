import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePlatformOperationsApiContext } from "@/app-layer/guards/requireRole";
import { normalizeValueJson } from "@/modules/system-settings/adminSettingsPatchNormalize";
import { SYSTEM_SETTING_REGISTRY, type SystemSettingKey } from "@/modules/system-settings/registry";
import type { SystemSetting } from "@/modules/system-settings/types";
import {
  BOOKING_LOCATION_PALETTE_SETTING_KEY,
  bookingLocationPaletteEnvelope,
  normalizeBookingLocationPalette,
} from "@/modules/booking-engine/locationPalette";

/**
 * The platform API is deliberately not a mirror of `/api/admin/settings`.
 * Each key is an explicit platform-global operator action; N1A now includes
 * its four boolean auth-channel policy keys.
 */
export const PLATFORM_GLOBAL_SETTINGS_API_KEYS = [
  "debug_forward_to_admin",
  "specialist_signup_enabled",
  "patient_unsupported_client_fallback_enabled",
  "patient_app_maintenance_enabled",
  "patient_app_maintenance_message",
  "auth_email_enabled",
  "auth_sms_enabled",
  "auth_telegram_enabled",
  "auth_max_enabled",
  "booking_location_default_palette",
] as const satisfies readonly SystemSettingKey[];

const platformKeySchema = z.enum(PLATFORM_GLOBAL_SETTINGS_API_KEYS);
const patchSchema = z.object({ key: platformKeySchema, value: z.unknown() });

function isPlatformGlobalSetting(setting: SystemSetting): boolean {
  return (
    (PLATFORM_GLOBAL_SETTINGS_API_KEYS as readonly string[]).includes(setting.key) &&
    setting.organizationId == null &&
    SYSTEM_SETTING_REGISTRY[setting.key].ownership === "global"
  );
}

function normalizePlatformValue(key: (typeof PLATFORM_GLOBAL_SETTINGS_API_KEYS)[number], value: unknown): unknown | null {
  const normalized = normalizeValueJson(value);
  if (key === BOOKING_LOCATION_PALETTE_SETTING_KEY) {
    const palette = normalizeBookingLocationPalette(normalized);
    return palette ? bookingLocationPaletteEnvelope(palette) : null;
  }
  if (key === "patient_app_maintenance_message") {
    if (typeof normalized.value !== "string" || normalized.value.length > 2_000) return null;
    return { value: normalized.value.trim() };
  }
  return typeof normalized.value === "boolean" ? { value: normalized.value } : null;
}

export async function GET() {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const settings = (await buildAppDeps().systemSettings.listSettingsByScope("admin", { organizationId: null }))
    .filter(isPlatformGlobalSetting);
  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(request: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const valueJson = normalizePlatformValue(parsed.data.key, parsed.data.value);
  if (valueJson === null) {
    return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });
  }

  const setting = await buildAppDeps().systemSettings.updateSetting(
    parsed.data.key,
    "admin",
    valueJson,
    gate.session.user.userId,
    { organizationId: null },
  );
  return NextResponse.json({ ok: true, setting });
}
