import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const mediaItemSchema = z.object({
  mediaUrl: z.string().min(1),
  mediaType: z.enum(["image", "video", "gif"]),
  sortOrder: z.number().int().optional(),
});

const patchBodySchema = z.object({
  title: z.string().min(1).max(2000).optional(),
  bodyMd: z.string().max(100000).optional(),
  media: z.array(mediaItemSchema).nullable().optional(),
  tags: z.array(z.string()).optional().nullable(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const deps = buildAppDeps();
  const item = await deps.recommendations.getRecommendation(id);
  if (!item) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const item = await deps.recommendations.updateRecommendation(id, {
      ...parsed.data,
      media:
        parsed.data.media === undefined
          ? undefined
          : parsed.data.media?.map((m, i) => ({
              ...m,
              sortOrder: m.sortOrder ?? i,
            })),
    });
    return NextResponse.json({ ok: true, item });
  } catch {
    return NextResponse.json({ ok: false, error: "not_found_or_invalid" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const deps = buildAppDeps();
  try {
    await deps.recommendations.archiveRecommendation(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}
