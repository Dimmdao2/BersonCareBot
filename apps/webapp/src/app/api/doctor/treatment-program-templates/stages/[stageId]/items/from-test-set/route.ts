import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  isTreatmentProgramExpandNotFoundError,
  isTreatmentProgramTemplateAlreadyArchivedError,
} from "@/modules/treatment-program/errors";

const bodySchema = z.object({
  templateId: z.string().uuid(),
  testSetId: z.string().uuid(),
});

export async function POST(request: Request, ctx: { params: Promise<{ stageId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { stageId } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const result = await deps.treatmentProgram.expandTestSetIntoTemplateStageItems(
      parsed.data.templateId,
      stageId,
      parsed.data.testSetId,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (isTreatmentProgramTemplateAlreadyArchivedError(e)) {
      return NextResponse.json({ ok: false, error: "already_archived" }, { status: 400 });
    }
    if (isTreatmentProgramExpandNotFoundError(e)) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 404 });
    }
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
