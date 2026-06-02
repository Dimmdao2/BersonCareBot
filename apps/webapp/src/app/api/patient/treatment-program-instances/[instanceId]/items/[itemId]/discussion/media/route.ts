import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { getMediaRowForProgramSubmissionAttach } from "@/app-layer/media/s3MediaStorage";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";
import { assertPatientProgramMediaAllowed } from "@/modules/doctor-clients/assertPatientProgramInteraction";
import {
  isPatientProgramDiscussionMediaFlowEnabled,
} from "@/modules/program-item-discussion/discussionFeatureGates";

const postBodySchema = z.object({
  mediaFileId: z.string().uuid(),
});

async function resolveItemContext(params: {
  patientUserId: string;
  instanceId: string;
  itemId: string;
}) {
  const deps = buildAppDeps();
  const detail = await deps.treatmentProgramInstance.getInstanceForPatient(
    params.patientUserId,
    params.instanceId,
  );
  if (!detail) return { ok: false as const, error: "not_found" as const };
  if (detail.assignmentSource !== "doctor") {
    return { ok: false as const, error: "program_not_doctor_assigned" as const };
  }
  const item = detail.stages.flatMap((s) => s.items).find((x) => x.id === params.itemId) ?? null;
  if (!item) return { ok: false as const, error: "not_found" as const };
  return { ok: true as const, deps, item };
}

async function listLatestDiscussionMessage(
  deps: ReturnType<typeof buildAppDeps>,
  stageItemId: string,
): Promise<ProgramItemDiscussionMessage | null> {
  const batch = await deps.programItemDiscussion.listMessagesForStageItem(stageItemId, 1, 0);
  if (batch.length === 0) return null;
  const rows = await deps.programItemDiscussion.listMessagesForStageItem(stageItemId, 1000, 0);
  return rows.sort((a, b) => {
    const byDate = a.createdAt.localeCompare(b.createdAt);
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  }).at(-1) ?? null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { instanceId, itemId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success || !z.string().uuid().safeParse(itemId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = postBodySchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const itemContext = await resolveItemContext({
    patientUserId: gate.session.user.userId,
    instanceId,
    itemId,
  });
  if (!itemContext.ok) {
    const status = itemContext.error === "not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: itemContext.error }, { status });
  }

  if (!(await isPatientProgramDiscussionMediaFlowEnabled(itemContext.deps))) {
    return NextResponse.json({ ok: false, error: "feature_disabled" }, { status: 403 });
  }

  const supportGate = await assertPatientProgramMediaAllowed(
    itemContext.deps,
    gate.session.user.userId,
  );
  if (!supportGate.ok) {
    return NextResponse.json({ ok: false, error: supportGate.error }, { status: 403 });
  }

  const mediaRow = await getMediaRowForProgramSubmissionAttach(
    parsed.data.mediaFileId,
    gate.session.user.userId,
  );
  if (!mediaRow) {
    return NextResponse.json({ ok: false, error: "media_not_ready" }, { status: 400 });
  }

  try {
    await itemContext.deps.treatmentProgramPatientActions.patientAppendDiscussionMedia({
      patientUserId: gate.session.user.userId,
      instanceId,
      stageItemId: itemId,
      mediaFileId: parsed.data.mediaFileId,
    });
    const latest = await listLatestDiscussionMessage(itemContext.deps, itemId);
    return NextResponse.json({ ok: true, message: latest });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("не найден") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
