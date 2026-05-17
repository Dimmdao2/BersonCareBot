import { NextResponse } from "next/server";
import { loadAdminReminderStats, parseReminderStatsWindowHours } from "@/app-layer/stats/loadAdminReminderStats";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

export async function GET(req: Request) {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const windowHours = parseReminderStatsWindowHours(url.searchParams.get("windowHours"));
  const body = await loadAdminReminderStats({ windowHours });
  return NextResponse.json(body);
}
