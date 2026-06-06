import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { assertPatientProgramCommentsAllowed } from "@/modules/doctor-clients/assertPatientProgramInteraction";

function parseFeatureEnabled(valueJson: unknown): boolean {
  return (
    valueJson !== null &&
    typeof valueJson === "object" &&
    (valueJson as Record<string, unknown>).value === true
  );
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { instanceId, itemId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success || !z.string().uuid().safeParse(itemId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const featureRow = await deps.systemSettings.getSetting("patient_program_discussion_ui_enabled", "admin");
  if (!parseFeatureEnabled(featureRow?.valueJson ?? null)) {
    return NextResponse.json({ ok: false, error: "feature_disabled" }, { status: 403 });
  }

  const detail = await deps.treatmentProgramInstance.getInstanceForPatient(gate.session.user.userId, instanceId);
  if (!detail) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (detail.assignmentSource !== "doctor") {
    return NextResponse.json({ ok: false, error: "program_not_doctor_assigned" }, { status: 400 });
  }
  const hasItem = detail.stages.some((stage) => stage.items.some((item) => item.id === itemId));
  if (!hasItem) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const supportGate = await assertPatientProgramCommentsAllowed(deps, gate.session.user.userId);
  if (!supportGate.ok) {
    return NextResponse.json({ ok: false, error: supportGate.error }, { status: 403 });
  }

  await deps.programItemDiscussion.markRead({
    patientUserId: gate.session.user.userId,
    stageItemId: itemId,
  });

  const linkedSupportMessageIds = await deps.programItemDiscussion.listLinkedSupportMessageIdsForStageItem(itemId);
  if (linkedSupportMessageIds.length > 0) {
    await deps.supportCommunication.markInboundMessagesReadForUser(
      gate.session.user.userId,
      linkedSupportMessageIds,
    );
  }
  return NextResponse.json({ ok: true });
}
