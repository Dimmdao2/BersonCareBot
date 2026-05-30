import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { exerciseTitleFromSnapshot } from "@/modules/messaging/programNoteReplyContext";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";

function parseFeatureEnabled(valueJson: unknown): boolean {
  return (
    valueJson !== null &&
    typeof valueJson === "object" &&
    (valueJson as Record<string, unknown>).value === true
  );
}

function compareByPosition(
  a: Pick<ProgramItemDiscussionMessage, "createdAt" | "id">,
  b: Pick<ProgramItemDiscussionMessage, "createdAt" | "id">,
): number {
  const byDate = a.createdAt.localeCompare(b.createdAt);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
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

async function listAllDiscussionMessages(
  deps: ReturnType<typeof buildAppDeps>,
  stageItemId: string,
): Promise<ProgramItemDiscussionMessage[]> {
  const pageSize = 1000;
  const out: ProgramItemDiscussionMessage[] = [];
  let offset = 0;
  while (true) {
    const batch = await deps.programItemDiscussion.listMessagesForStageItem(stageItemId, pageSize, offset);
    if (batch.length === 0) break;
    out.push(...batch);
    offset += batch.length;
    if (batch.length < pageSize) break;
  }
  return out;
}

async function listAllLegacyAdminReplies(params: {
  deps: ReturnType<typeof buildAppDeps>;
  patientUserId: string;
  stageItemId: string;
  exerciseTitle: string;
  excludeSupportMessageIds: string[];
}): Promise<ProgramItemDiscussionMessage[]> {
  const pageSize = 500;
  const out: ProgramItemDiscussionMessage[] = [];
  let offset = 0;
  while (true) {
    const batch = await params.deps.programItemDiscussion.mergeLegacyAdminReplies({
      patientUserId: params.patientUserId,
      stageItemId: params.stageItemId,
      exerciseTitle: params.exerciseTitle,
      excludeSupportMessageIds: params.excludeSupportMessageIds,
      limit: pageSize,
      offset,
    });
    if (batch.length === 0) break;
    out.push(...batch);
    offset += batch.length;
    if (batch.length < pageSize) break;
  }
  return out;
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
      const [messages, unreadCount] = await Promise.all([
        listAllDiscussionMessages(deps, itemId),
        deps.programItemDiscussion.getUnreadCount({
          patientUserId: gate.session.user.userId,
          stageItemId: itemId,
          exerciseTitle: exerciseTitleFromSnapshot(item.snapshot),
        }),
      ]);
      const supportIds = messages
        .map((x) => x.supportMessageId)
        .filter((x): x is string => typeof x === "string" && x.length > 0);
      const legacy = await listAllLegacyAdminReplies({
        deps,
        patientUserId: gate.session.user.userId,
        stageItemId: itemId,
        exerciseTitle: exerciseTitleFromSnapshot(item.snapshot),
        excludeSupportMessageIds: supportIds,
      });
      const merged = [...messages, ...legacy].sort(compareByPosition);
      return [
        itemId,
        {
          totalCount: merged.length,
          unreadCount,
          lastMessage: merged.length > 0 ? merged[merged.length - 1] : null,
        },
      ] as const;
    }),
  );

  return NextResponse.json({
    ok: true,
    summaryByItemId: Object.fromEntries(summaryByItemIdEntries),
  });
}
