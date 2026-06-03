import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { exerciseTitleFromSnapshot } from "@/modules/messaging/programNoteReplyContext";
import { getDiscussionSummaryForItem } from "@/modules/program-item-discussion/listDiscussionPage";

function parseRequestedStageItemIds(raw: string | null): string[] | null {
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
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const instance = await deps.treatmentProgramInstance.getInstanceById(instanceId);
  if (!instance) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const identity = await deps.doctorClientsPort.getClientIdentity(instance.patientUserId);
  if (!identity) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  if (instance.assignmentSource !== "doctor") {
    return NextResponse.json({ ok: false, error: "program_not_doctor_assigned" }, { status: 400 });
  }

  const allItems = instance.stages.flatMap((stage) => stage.items);
  const byId = new Map(allItems.map((item) => [item.id, item]));
  const requested = parseRequestedStageItemIds(new URL(request.url).searchParams.get("stageItemIds"));
  const stageItemIds = requested ?? allItems.map((item) => item.id);

  for (const id of stageItemIds) {
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ ok: false, error: "invalid_stage_item_id" }, { status: 400 });
    }
    if (!byId.has(id)) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
  }

  const summaryByStageItemIdEntries = await Promise.all(
    stageItemIds.map(async (stageItemId) => {
      const item = byId.get(stageItemId)!;
      const summary = await getDiscussionSummaryForItem({
        discussion: deps.programItemDiscussion,
        stageItemId,
        patientUserId: instance.patientUserId,
        exerciseTitle: exerciseTitleFromSnapshot(item.snapshot),
      });
      return [stageItemId, summary] as const;
    }),
  );

  return NextResponse.json({
    ok: true,
    summaryByStageItemId: Object.fromEntries(summaryByStageItemIdEntries),
  });
}
