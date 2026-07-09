import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import {
  isTreatmentProgramExpandNotFoundError,
  isTreatmentProgramTemplateAlreadyArchivedError,
} from "@/modules/treatment-program/errors";

const bodySchema = z.object({
  templateId: z.string().uuid(),
  testSetId: z.string().uuid(),
});

export async function POST(request: Request, ctx: { params: Promise<{ stageId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { stageId } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const result = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgram.expandTestSetIntoTemplateStageItems(
        parsed.data.templateId,
        stageId,
        parsed.data.testSetId,
      ),
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
