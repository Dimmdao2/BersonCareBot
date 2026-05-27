import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { PRODUCT_ANALYTICS_ENTRY_CHANNELS } from "@/modules/product-analytics/types";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";

const bodySchema = z.object({
  pushTrackingId: z.string().uuid(),
  entryChannel: z.enum(PRODUCT_ANALYTICS_ENTRY_CHANNELS).optional(),
});

/** POST /api/patient/analytics/push-open — idempotent push click (SW / PWA). */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const session = await getCurrentSession();
  const sessionUserId = session?.user.userId;
  const userId =
    sessionUserId && isPlatformUserUuid(sessionUserId) ? sessionUserId : null;

  try {
    const deps = buildAppDeps();
    const result = await deps.productAnalytics.recordPushOpen({
      pushTrackingId: parsed.data.pushTrackingId,
      userId,
      entryChannel: parsed.data.entryChannel ?? "pwa",
    });
    return NextResponse.json({ ok: true, deduped: result.deduped });
  } catch {
    return NextResponse.json({ ok: false, error: "ingest_failed" }, { status: 500 });
  }
}
