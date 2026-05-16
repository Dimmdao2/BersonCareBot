import { NextResponse } from "next/server";
import { z } from "zod";

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import type { MaterialRatingDetailPreset } from "@/modules/material-rating/detailTimeRange";
import { resolveMaterialRatingDetailLocalRange } from "@/modules/material-rating/detailTimeRange";
import { MaterialRatingAccessError } from "@/modules/material-rating/types";
import { canAccessDoctor } from "@/modules/roles/service";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

const dayParam = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

function parsePreset(raw: string | null): MaterialRatingDetailPreset {
  if (raw === "week" || raw === "month" || raw === "custom") return raw;
  return "week";
}

const querySchema = z.object({
  kind: z.enum(["content_page", "lfk_exercise", "lfk_complex"]),
  id: z.string().uuid(),
  preset: z.enum(["week", "month", "custom"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const preset = parsed.data.preset ?? parsePreset(searchParams.get("preset"));
  const fromRaw = parsed.data.from ?? searchParams.get("from");
  const toRaw = parsed.data.to ?? searchParams.get("to");

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

  let range: ReturnType<typeof resolveMaterialRatingDetailLocalRange>;
  try {
    range = resolveMaterialRatingDetailLocalRange(iana, preset, fromRaw ?? undefined, toRaw ?? undefined);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (
      msg === "custom_range_required" ||
      msg === "range_inverted" ||
      msg === "range_too_long" ||
      msg === "invalid_date"
    ) {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    throw e;
  }

  try {
    const detail = await deps.materialRating.getDoctorDetailForDoctor({
      targetKind: parsed.data.kind,
      targetId: parsed.data.id,
      iana,
      startUtcIso: range.startUtcIso,
      endExclusiveUtcIso: range.endExclusiveUtcIso,
      dayKeys: range.dayKeys,
    });
    return NextResponse.json({
      ok: true as const,
      iana,
      fromDay: range.fromDay,
      toDay: range.toDay,
      startUtcIso: range.startUtcIso,
      endExclusiveUtcIso: range.endExclusiveUtcIso,
      days: detail.days,
      raters: detail.raters,
    });
  } catch (e) {
    if (e instanceof MaterialRatingAccessError && e.accessCode === "not_found") {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}
