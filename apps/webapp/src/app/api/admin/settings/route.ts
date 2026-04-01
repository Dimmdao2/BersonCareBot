/**
 * GET  /api/admin/settings — список настроек scope=admin
 * PATCH /api/admin/settings — обновить ключ scope=admin
 * Guard: role === 'admin'
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { ALLOWED_KEYS } from "@/modules/system-settings/types";
import { invalidateConfigKey } from "@/modules/system-settings/configAdapter";

const ADMIN_SCOPE_KEYS = [
  "sms_fallback_enabled",
  "debug_forward_to_admin",
  "dev_mode",
  "important_fallback_delay_minutes",
  "integration_test_ids",
  // Pack B1: non-secret runtime config keys
  "integrator_api_url",
  "booking_url",
  "support_contact_url",
  "booking_display_timezone",
  "telegram_bot_username",
  "google_calendar_enabled",
  "google_calendar_id",
  "google_client_id",
  "google_client_secret",
  "google_redirect_uri",
  "google_refresh_token",
  "yandex_oauth_redirect_uri",
  "yandex_oauth_client_id",
  "yandex_oauth_client_secret",
  "telegram_bot_token",
  "integrator_webhook_secret",
  "integrator_webapp_entry_secret",
  "rubitime_api_key",
  "rubitime_webhook_token",
  "rubitime_schedule_mapping",
  "rubitime_webhook_uri",
  "max_api_key",
  "max_webhook_secret",
  "max_webhook_uri",
  "smsc_api_key",
  "smsc_webhook_uri",
  // Pack B2: whitelist IDs
  "allowed_telegram_ids",
  "allowed_max_ids",
  "admin_telegram_ids",
  "doctor_telegram_ids",
  "admin_max_ids",
  "doctor_max_ids",
  "admin_phones",
  "doctor_phones",
  "allowed_phones",
] as const;

const patchSchema = z.object({
  key: z.enum(ADMIN_SCOPE_KEYS),
  value: z.unknown(),
});

const SECRET_LIKE_KEYS = new Set<string>([
  "telegram_bot_token",
  "integrator_webhook_secret",
  "integrator_webapp_entry_secret",
  "rubitime_api_key",
  "rubitime_webhook_token",
  "max_api_key",
  "max_webhook_secret",
  "smsc_api_key",
  "yandex_oauth_client_secret",
  "google_client_secret",
  "google_refresh_token",
]);

function normalizeValueJson(value: unknown): { value: unknown } {
  if (value !== null && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    return value as { value: unknown };
  }
  return { value };
}

function auditValueForLog(key: string, value: unknown): unknown {
  if (SECRET_LIKE_KEYS.has(key)) return "[REDACTED]";
  return value;
}

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const deps = buildAppDeps();
  const settings = await deps.systemSettings.listSettingsByScope("admin");
  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  // Проверка что ключ входит в глобальный whitelist
  if (!(ALLOWED_KEYS as readonly string[]).includes(parsed.data.key)) {
    return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
  }

  const deps = buildAppDeps();

  const normalizedValue = normalizeValueJson(parsed.data.value);

  // Audit log перед обновлением (секреты редактируются без вывода raw значения в logs).
  const oldSetting = await deps.systemSettings.getSetting(parsed.data.key, "admin");
  console.info("[admin-settings audit]", {
    key: parsed.data.key,
    oldValue: auditValueForLog(parsed.data.key, oldSetting?.valueJson ?? null),
    newValue: auditValueForLog(parsed.data.key, normalizedValue),
    updatedBy: session.user.userId,
    timestamp: new Date().toISOString(),
  });

  const setting = await deps.systemSettings.updateSetting(
    parsed.data.key,
    "admin",
    normalizedValue,
    session.user.userId
  );

  // Invalidate configAdapter cache for updated key
  invalidateConfigKey(parsed.data.key);

  return NextResponse.json({ ok: true, setting });
}
