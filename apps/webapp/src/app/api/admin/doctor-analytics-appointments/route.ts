import { NextResponse } from "next/server";
import { z } from "zod";

import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";
import { resolveAppointmentStatsBounds } from "@/modules/doctor-appointments/resolveAppointmentStatsBounds";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { parseAdminStatsTimePreset } from "@/modules/admin-platform-stats/parseAdminStatsTimePreset";
import type { AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";

const dayParam = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

function parsePreset(raw: string | null): AdminStatsTimePreset {
  return parseAdminStatsTimePreset(raw);
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
    const bounds = resolveAppointmentStatsBounds(
      { kind: "preset", preset, customFrom: fromRaw ?? undefined, customTo: toRaw ?? undefined },
      iana,
    );
    const appointments = await deps.doctorAppointments.getAppointmentStats(
      {
        kind: "preset",
        preset,
        customFrom: fromRaw ?? undefined,
        customTo: toRaw ?? undefined,
      },
      { excludedUserIds: audience.excludedUserIds },
    );
    return NextResponse.json({
      ok: true as const,
      fromDay: bounds.fromDay,
      toDay: bounds.toDay,
      appointments,
    });
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
