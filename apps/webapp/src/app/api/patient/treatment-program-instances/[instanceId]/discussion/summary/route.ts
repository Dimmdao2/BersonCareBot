import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { exerciseTitleFromSnapshot } from "@/modules/messaging/programNoteReplyContext";
import { assertPatientProgramCommentsAllowed } from "@/modules/doctor-clients/assertPatientProgramInteraction";
import { getDiscussionSummaryForItem } from "@/modules/program-item-discussion/listDiscussionPage";

function parseFeatureEnabled(valueJson: unknown): boolean {
  return (
    valueJson !== null &&
    typeof valueJson === "object" &&
    (valueJson as Record<string, unknown>).value === true
  );
}

function parseRequestedItemIds(raw: string | null): string[] | null {
  if (raw == null || raw.trim() === "") return null;
  const chunks = raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  if (chunks.length === 0) return null;
  return chunks;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ instanceId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
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

  const supportGate = await assertPatientProgramCommentsAllowed(deps, gate.session.user.userId);
  if (!supportGate.ok) {
    return NextResponse.json({ ok: false, error: supportGate.error }, { status: 403 });
  }

  const allItems = detail.stages.flatMap((stage) => stage.items);
  const byId = new Map(allItems.map((item) => [item.id, item]));
  const requested = parseRequestedItemIds(new URL(request.url).searchParams.get("itemIds"));
  const itemIds = requested ?? allItems.map((item) => item.id);
  for (const id of itemIds) {
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ ok: false, error: "invalid_item_id" }, { status: 400 });
    }
    if (!byId.has(id)) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
  }

  const summaryByItemIdEntries = await Promise.all(
    itemIds.map(async (itemId) => {
      const item = byId.get(itemId)!;
      const exerciseTitle = exerciseTitleFromSnapshot(item.snapshot);
      const [summary, unreadCount] = await Promise.all([
        getDiscussionSummaryForItem({
          discussion: deps.programItemDiscussion,
          stageItemId: itemId,
          patientUserId: gate.session.user.userId,
          exerciseTitle,
        }),
        deps.programItemDiscussion.getUnreadCount({
          patientUserId: gate.session.user.userId,
          stageItemId: itemId,
          exerciseTitle,
        }),
      ]);
      return [
        itemId,
        {
          totalCount: summary.totalCount,
          unreadCount,
          lastMessage: summary.lastMessage,
        },
      ] as const;
    }),
  );

  return NextResponse.json({
    ok: true,
    summaryByItemId: Object.fromEntries(summaryByItemIdEntries),
  });
}
