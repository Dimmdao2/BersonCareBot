import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { TREATMENT_PROGRAM_ITEM_TYPES } from "@/modules/treatment-program/types";

const patchBodySchema = z.object({
  itemType: z.enum(TREATMENT_PROGRAM_ITEM_TYPES).optional(),
  itemRefId: z.string().uuid().optional(),
  sortOrder: z.number().int().optional(),
  comment: z.string().max(5000).optional().nullable(),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
  /** Группа этапа; `null` — вне групп. */
  groupId: z.string().uuid().nullable().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { itemId } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const item = await deps.treatmentProgram.updateStageItem(itemId, parsed.data);
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: msg.includes("не найден") ? 404 : 400 });
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { itemId } = await ctx.params;
  const deps = buildAppDeps();
  try {
    await deps.treatmentProgram.deleteStageItem(itemId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 404 });
  }
}
