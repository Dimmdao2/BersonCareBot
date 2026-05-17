import { NextResponse } from "next/server";
import { loadContentEngagementStats, parseReminderStatsWindowHours } from "@/app-layer/stats/loadAdminReminderStats";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const windowHours = parseReminderStatsWindowHours(url.searchParams.get("windowHours"));
  const body = await loadContentEngagementStats({ windowHours });
  return NextResponse.json(body);
}
