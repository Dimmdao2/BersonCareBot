/**
 * GET  /api/doctor/settings — список настроек scope=doctor
 * PATCH /api/doctor/settings — обновить ключ scope=doctor
 * Guard: role === 'doctor' | 'admin'
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { ALLOWED_KEYS } from "@/modules/system-settings/types";

const DOCTOR_SCOPE_KEYS = ["patient_label", "sms_fallback_enabled"] as const;

const patchSchema = z.object({
  key: z.enum(DOCTOR_SCOPE_KEYS),
  value: z.unknown(),
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "doctor" && session.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const deps = buildAppDeps();
  const settings = await deps.systemSettings.listSettingsByScope("doctor");
  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "doctor" && session.user.role !== "admin") {
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
  const setting = await deps.systemSettings.updateSetting(
    parsed.data.key,
    "doctor",
    parsed.data.value,
    session.user.userId
  );
  return NextResponse.json({ ok: true, setting });
}
