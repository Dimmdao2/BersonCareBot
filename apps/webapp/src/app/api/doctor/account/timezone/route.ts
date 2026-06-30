import { NextRequest, NextResponse } from "next/server";
import { getDoctorAccountTimezone, setDoctorAccountTimezone } from "@/app-layer/doctor/accountTimezone";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { isValidIanaTimeZoneId } from "@/shared/timezone/ianaTimezonesForAdminUi";

export async function GET() {
  const guard = await requireDoctorApiSession();
  if (!guard.ok) return guard.response;

  const timezone = await getDoctorAccountTimezone(guard.session.user.userId);
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

  await setDoctorAccountTimezone(guard.session.user.userId, timezone);
  return NextResponse.json({ ok: true });
}
