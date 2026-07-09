import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import {
  GROUP_DESCRIPTION_CONFLICT,
  isTreatmentProgramExpandNotFoundError,
  isTreatmentProgramTemplateAlreadyArchivedError,
  isTreatmentProgramTemplateGroupDescriptionConflictError,
} from "@/modules/treatment-program/errors";

const expandBodySchema = z.discriminatedUnion("mode", [
  z.object({
    templateId: z.string().uuid(),
    complexTemplateId: z.string().uuid(),
    copyComplexDescriptionToGroup: z.boolean(),
    mode: z.literal("new_group"),
    newGroupTitle: z.string().min(1).max(2000),
  }),
  z.object({
    templateId: z.string().uuid(),
    complexTemplateId: z.string().uuid(),
    copyComplexDescriptionToGroup: z.boolean(),
    mode: z.literal("ungrouped"),
  }),
  z.object({
    templateId: z.string().uuid(),
    complexTemplateId: z.string().uuid(),
    copyComplexDescriptionToGroup: z.boolean(),
    mode: z.literal("existing_group"),
    existingGroupId: z.string().uuid(),
  }),
]);

export async function POST(request: Request, ctx: { params: Promise<{ stageId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { stageId } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = expandBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const result = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgram.expandLfkComplexIntoTemplateStageItems(
        parsed.data.templateId,
        stageId,
        parsed.data,
      ),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (isTreatmentProgramTemplateGroupDescriptionConflictError(e)) {
      return NextResponse.json(
        { ok: false, code: GROUP_DESCRIPTION_CONFLICT, error: e.message },
        { status: 409 },
      );
    }
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
