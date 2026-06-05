import { NextResponse } from "next/server";

import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import type { AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";
import { z } from "zod";

const dayParam = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/** Legacy `today` и неизвестные значения → `week`. */
function parsePreset(raw: string | null): AdminStatsTimePreset {
  if (raw === "month" || raw === "custom") return raw;
  return "week";
}

export async function GET(req: Request) {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const preset = parsePreset(url.searchParams.get("preset"));

  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  if (preset === "custom") {
    const fp = dayParam.safeParse(fromRaw ?? "");
    const tp = dayParam.safeParse(toRaw ?? "");
    if (!fp.success || !tp.success) {
      return NextResponse.json({ ok: false, error: "custom_range_required" }, { status: 400 });
    }
  } else if (fromRaw || toRaw) {
    return NextResponse.json({ ok: false, error: "unexpected_from_to" }, { status: 400 });
  }

  const iana = await getAppDisplayTimeZone();
  const deps = buildAppDeps();
  const audience = await loadDoctorAnalyticsAudience();

  try {
    const body = await deps.adminPlatformUserStats.getRegistrationStats({
      iana,
      preset,
      customFrom: fromRaw ?? undefined,
      customTo: toRaw ?? undefined,
      excludedUserIds: audience.excludedUserIds,
    });
    return NextResponse.json({ ok: true as const, ...body });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (
      msg === "custom_range_required" ||
      msg === "range_inverted" ||
      msg === "range_too_long" ||
      msg === "range_too_short" ||
      msg === "invalid_date"
    ) {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    throw e;
  }
}
