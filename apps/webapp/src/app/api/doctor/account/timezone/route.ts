import { NextRequest, NextResponse } from "next/server";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { getPool } from "@/app-layer/db/client";
import { isValidIanaTimeZoneId } from "@/shared/timezone/ianaTimezonesForAdminUi";

export async function GET() {
  const guard = await requireDoctorApiSession();
  if (!guard.ok) return guard.response;

  const pool = getPool();
  const r = await pool.query<{ calendar_timezone: string | null }>(
    `SELECT calendar_timezone FROM platform_users WHERE id = $1::uuid`,
    [guard.session.user.userId],
  );
  const timezone = r.rows[0]?.calendar_timezone ?? null;
  return NextResponse.json({ ok: true, timezone });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireDoctorApiSession();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const timezone = (body as Record<string, unknown>)?.timezone;
  if (typeof timezone !== "string" || !isValidIanaTimeZoneId(timezone)) {
    return NextResponse.json({ ok: false, error: "invalid_timezone" }, { status: 400 });
  }

  const pool = getPool();
  await pool.query(
    `UPDATE platform_users SET calendar_timezone = $2, updated_at = now() WHERE id = $1::uuid`,
    [guard.session.user.userId, timezone],
  );
  return NextResponse.json({ ok: true });
}
