import { NextResponse } from "next/server";
import { loadAdminProductAnalytics } from "@/app-layer/product-analytics/loadAdminProductAnalytics";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";
import { parseProductAnalyticsWindowHours } from "@/modules/product-analytics/timeRange";

export async function GET(req: Request) {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const windowHours = parseProductAnalyticsWindowHours(url.searchParams.get("windowHours"));
  const body = await loadAdminProductAnalytics({ windowHours });
  return NextResponse.json(body);
}
