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

const ADMIN_SCOPE_KEYS = [
  "sms_fallback_enabled",
  "debug_forward_to_admin",
  "dev_mode",
  "important_fallback_delay_minutes",
  "integration_test_ids",
] as const;

const patchSchema = z.object({
  key: z.enum(ADMIN_SCOPE_KEYS),
  value: z.unknown(),
});

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

  // Audit log перед обновлением
  const oldSetting = await deps.systemSettings.getSetting(parsed.data.key, "admin");
  console.info("[admin-settings audit]", {
    key: parsed.data.key,
    oldValue: oldSetting?.valueJson ?? null,
    newValue: parsed.data.value,
    updatedBy: session.user.userId,
    timestamp: new Date().toISOString(),
  });

  const setting = await deps.systemSettings.updateSetting(
    parsed.data.key,
    "admin",
    parsed.data.value,
    session.user.userId
  );
  return NextResponse.json({ ok: true, setting });
}
