import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";

const querySchema = z.object({
  contentPageId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(request: Request) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const limit = parsed.data.limit ?? 20;
  const offset = parsed.data.offset ?? 0;
  const deps = buildAppDeps();
  const [summary, rows] = await Promise.all([
    deps.materialRatingFeedback.getDoctorSummary(parsed.data.contentPageId),
    deps.materialRatingFeedback.listDoctorFeedbackForPage(parsed.data.contentPageId, limit, offset),
  ]);

  return NextResponse.json({
    ok: true as const,
    total: summary.total,
    rows,
    limit,
    offset,
  });
}
