import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { TREATMENT_PROGRAM_ITEM_TYPES } from "@/modules/treatment-program/types";

const postBodySchema = z.object({
  itemType: z.enum(TREATMENT_PROGRAM_ITEM_TYPES),
  itemRefId: z.string().uuid(),
  sortOrder: z.number().int().optional(),
  comment: z.string().max(5000).optional().nullable(),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
  groupId: z.string().uuid().optional().nullable(),
});

export async function POST(request: Request, ctx: { params: Promise<{ stageId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { stageId } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const item = await deps.treatmentProgram.addStageItem(stageId, {
      itemType: parsed.data.itemType,
      itemRefId: parsed.data.itemRefId,
      sortOrder: parsed.data.sortOrder,
      comment: parsed.data.comment ?? null,
      settings: parsed.data.settings ?? null,
      groupId: parsed.data.groupId ?? undefined,
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
