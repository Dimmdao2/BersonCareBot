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
import { normalizeNotificationsTopicsForAdminPatch } from "@/modules/patient-notifications/notificationsTopics";
import {
  normalizeModesFormBatchItems,
  normalizeModesFormPatchItem,
  normalizeValueJson,
} from "@/modules/system-settings/adminSettingsPatchNormalize";
import { isModesFormKey, MODES_FORM_KEYS } from "@/modules/system-settings/modesFormKeys";
import { VIDEO_PRESIGN_TTL_MAX_SEC, VIDEO_PRESIGN_TTL_MIN_SEC } from "@/modules/media/videoPresignTtlConstants";

const ADMIN_SCOPE_KEYS = [
  "sms_fallback_enabled",
  "debug_forward_to_admin",
  "max_debug_page_enabled",
  "dev_mode",
  "platform_user_merge_v2_enabled",
  "integrator_linked_phone_source",
  "important_fallback_delay_minutes",
  "integration_test_ids",
  "test_account_identifiers",
  "app_base_url",
  "support_contact_url",
  "telegram_login_bot_username",
  "max_login_bot_nickname",
  "max_bot_api_key",
  "vk_web_login_url",
  "app_display_timezone",
  "patient_app_maintenance_enabled",
  "patient_app_maintenance_message",
  "video_hls_pipeline_enabled",
  "video_hls_new_uploads_auto_transcode",
  "video_playback_api_enabled",
  "video_default_delivery",
  "video_presign_ttl_seconds",
  "video_watermark_enabled",
  "patient_booking_url",
  "patient_home_daily_practice_target",
  "patient_home_morning_ping_enabled",
  "patient_home_morning_ping_local_time",
  "patient_home_mood_icons",
  "notifications_topics",
  "yandex_oauth_client_id",
  "yandex_oauth_client_secret",
  "yandex_oauth_redirect_uri",
  // Google Calendar OAuth + integration
  "google_client_id",
  "google_client_secret",
  "google_redirect_uri",
  "google_refresh_token",
  "google_calendar_id",
  "google_calendar_enabled",
  "google_connected_email",
  "google_oauth_login_redirect_uri",
  "apple_oauth_client_id",
  "apple_oauth_team_id",
  "apple_oauth_key_id",
  "apple_oauth_private_key",
  "apple_oauth_redirect_uri",
  // Whitelist IDs
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

const batchBodySchema = z.object({
  items: z
    .array(
      z.object({
        key: z.enum(MODES_FORM_KEYS),
        value: z.unknown(),
      }),
    )
    .min(1),
});

const SECRET_LIKE_KEYS = new Set<string>([
  "max_bot_api_key",
  "yandex_oauth_client_secret",
  "google_client_secret",
  "google_refresh_token",
  "apple_oauth_private_key",
]);

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

  if (raw !== null && typeof raw === "object" && "items" in raw) {
    const body = raw as Record<string, unknown>;
    const itemsRaw = body.items;
    if (itemsRaw !== null && itemsRaw !== undefined && !Array.isArray(itemsRaw)) {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }
    if (Array.isArray(itemsRaw)) {
      if (typeof body.key === "string" && itemsRaw.length >= 1) {
        return NextResponse.json({ ok: false, error: "ambiguous_body" }, { status: 400 });
      }
      if (itemsRaw.length === 0) {
        return NextResponse.json({ ok: false, error: "empty_batch" }, { status: 400 });
      }
      const batchParsed = batchBodySchema.safeParse(raw);
      if (!batchParsed.success) {
        return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
      }
      const items = batchParsed.data.items;
      const seen = new Set<string>();
      for (let i = 0; i < items.length; i++) {
        const k = items[i]!.key;
        if (seen.has(k)) {
          return NextResponse.json(
            { ok: false, error: "duplicate_key_in_batch", atIndex: i, key: k },
            { status: 400 },
          );
        }
        seen.add(k);
      }
      for (let i = 0; i < items.length; i++) {
        if (!(ALLOWED_KEYS as readonly string[]).includes(items[i]!.key)) {
          return NextResponse.json(
            { ok: false, error: "invalid_key", atIndex: i, key: items[i]!.key },
            { status: 400 },
          );
        }
      }
      const norm = normalizeModesFormBatchItems(items);
      if (!norm.ok) {
        return NextResponse.json(
          { ok: false, error: "invalid_value", atIndex: norm.atIndex, key: norm.key },
          { status: 400 },
        );
      }
      const deps = buildAppDeps();
      for (const row of norm.rows) {
        const oldSetting = await deps.systemSettings.getSetting(row.key, "admin");
        console.info("[admin-settings audit]", {
          key: row.key,
          oldValue: auditValueForLog(row.key, oldSetting?.valueJson ?? null),
          newValue: auditValueForLog(row.key, row.valueJson),
          updatedBy: session.user.userId,
          timestamp: new Date().toISOString(),
        });
      }
      const settings = await deps.systemSettings.persistAdminModesBatch(norm.rows, session.user.userId);
      return NextResponse.json({ ok: true, settings });
    }
  }

  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  // Проверка что ключ входит в глобальный whitelist
  if (!(ALLOWED_KEYS as readonly string[]).includes(parsed.data.key)) {
    return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
  }

  const deps = buildAppDeps();

  let normalizedValue = normalizeValueJson(parsed.data.value);

  if (isModesFormKey(parsed.data.key)) {
    const checked = normalizeModesFormPatchItem(parsed.data.key, parsed.data.value);
    if (!checked.ok) {
      return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });
    }
    normalizedValue = checked.valueJson;
  }

  if (parsed.data.key === "video_watermark_enabled") {
    const inner = normalizedValue.value;
    const b =
      typeof inner === "boolean"
        ? inner
        : inner === "true" || inner === 1
          ? true
          : inner === "false" || inner === 0
            ? false
            : null;
    if (b === null) {
      return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });
    }
    normalizedValue = { value: b };
  }

  if (parsed.data.key === "video_presign_ttl_seconds") {
    const inner = normalizedValue.value;
    const n =
      typeof inner === "number" && Number.isInteger(inner)
        ? inner
        : typeof inner === "string" && /^\d+$/.test(inner.trim())
          ? Number.parseInt(inner.trim(), 10)
          : NaN;
    if (!Number.isFinite(n) || n < VIDEO_PRESIGN_TTL_MIN_SEC || n > VIDEO_PRESIGN_TTL_MAX_SEC) {
      return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });
    }
    normalizedValue = { value: n };
  }

  if (parsed.data.key === "patient_home_daily_practice_target") {
    const inner = normalizedValue.value;
    const n =
      typeof inner === "number" && Number.isInteger(inner)
        ? inner
        : typeof inner === "string" && /^\d+$/.test(inner.trim())
          ? Number.parseInt(inner.trim(), 10)
          : NaN;
    if (!Number.isFinite(n) || n < 1 || n > 10) {
      return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });
    }
    normalizedValue = { value: n };
  }

  if (parsed.data.key === "patient_home_morning_ping_enabled") {
    const inner = normalizedValue.value;
    const b =
      typeof inner === "boolean"
        ? inner
        : inner === "true" || inner === 1
          ? true
          : inner === "false" || inner === 0
            ? false
            : null;
    if (b === null) {
      return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });
    }
    normalizedValue = { value: b };
  }

  if (parsed.data.key === "patient_home_morning_ping_local_time") {
    const inner = normalizedValue.value;
    const s = typeof inner === "string" ? inner.trim() : null;
    if (s === null || !/^([01]?\d|2[0-3]):([0-5]\d)$/.test(s)) {
      return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });
    }
    const [hs, ms] = s.split(":");
    const pad = `${hs!.padStart(2, "0")}:${ms}`;
    normalizedValue = { value: pad };
  }

  if (parsed.data.key === "patient_home_mood_icons") {
    const inner = normalizedValue.value;
    if (!Array.isArray(inner) || inner.length !== 5) {
      return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });
    }
    const scores = new Set<number>();
    const cleaned: { score: number; label: string; imageUrl: string | null }[] = [];
    for (const row of inner) {
      if (row === null || typeof row !== "object") {
        return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });
      }
      const o = row as Record<string, unknown>;
      const score =
        typeof o.score === "number" && Number.isInteger(o.score) && o.score >= 1 && o.score <= 5
          ? o.score
          : null;
      if (score === null) {
        return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });
      }
      if (scores.has(score)) {
        return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });
      }
      scores.add(score);
      const label = typeof o.label === "string" ? o.label.trim() : "";
      if (!label || label.length > 200) {
        return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });
      }
      let imageUrl: string | null = null;
      if (o.imageUrl === null || o.imageUrl === undefined) {
        imageUrl = null;
      } else if (typeof o.imageUrl === "string" && o.imageUrl.trim() === "") {
        imageUrl = null;
      } else if (typeof o.imageUrl === "string" && o.imageUrl.startsWith("/api/media/")) {
        imageUrl = o.imageUrl.trim();
      } else {
        return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });
      }
      cleaned.push({ score, label, imageUrl });
    }
    for (const s of [1, 2, 3, 4, 5]) {
      if (!scores.has(s)) {
        return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });
      }
    }
    cleaned.sort((a, b) => a.score - b.score);
    normalizedValue = { value: cleaned };
  }

  if (parsed.data.key === "notifications_topics") {
    const inner = normalizedValue.value;
    const topics = await deps.subscriptionMailingProjection.listTopics();
    const knownTopicCodes = new Set(topics.map((t) => t.code));
    const checked = normalizeNotificationsTopicsForAdminPatch(inner, { knownTopicCodes });
    if (!checked.ok) {
      return NextResponse.json({ ok: false, error: "invalid_value" }, { status: 400 });
    }
    normalizedValue = { value: checked.value };
  }

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

  // Invalidate configAdapter cache for updated key (sync to integrator runs inside updateSetting)
  invalidateConfigKey(parsed.data.key);

  return NextResponse.json({ ok: true, setting });
}
