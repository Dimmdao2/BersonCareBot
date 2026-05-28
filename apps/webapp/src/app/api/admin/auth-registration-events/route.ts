import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";
import { resolveAdminStatsLocalRange } from "@/modules/admin-platform-stats/registrationTimeRange";
import type { AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";
import { AUTH_REGISTRATION_EVENT_TYPES } from "@/modules/product-analytics/types";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

const dayParam = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const querySchema = z.object({
  preset: z.enum(["week", "month", "custom"]).default("week"),
  from: dayParam.optional(),
  to: dayParam.optional(),
  eventType: z.enum(AUTH_REGISTRATION_EVENT_TYPES).optional(),
  errorClass: z.enum(["user", "system"]).optional(),
  authMethod: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** GET /api/admin/auth-registration-events — журнал попыток регистрации (product analytics recent). */
export async function GET(req: Request) {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const q = parsed.data;
  if (q.preset === "custom") {
    if (!q.from || !q.to) {
      return NextResponse.json({ ok: false, error: "custom_range_required" }, { status: 400 });
    }
  } else if (q.from || q.to) {
    return NextResponse.json({ ok: false, error: "unexpected_from_to" }, { status: 400 });
  }

  const iana = await getAppDisplayTimeZone();
  let range;
  try {
    range = resolveAdminStatsLocalRange(
      iana,
      q.preset as AdminStatsTimePreset,
      q.from,
      q.to,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "custom_range_required" || msg === "range_inverted" || msg === "range_too_long" || msg === "invalid_date") {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    throw e;
  }

  const deps = buildAppDeps();
  const result = await deps.productAnalytics.listRegistrationEvents({
    startIso: range.startUtcIso,
    endExclusiveIso: range.endExclusiveUtcIso,
    eventType: q.eventType,
    errorClass: q.errorClass,
    authMethod: q.authMethod,
    page: q.page,
    limit: q.limit,
  });

  return NextResponse.json({
    ok: true,
    iana,
    fromDay: range.fromDay,
    toDay: range.toDay,
    ...result,
  });
}
