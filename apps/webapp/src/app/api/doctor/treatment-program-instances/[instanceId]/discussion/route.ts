import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { exerciseTitleFromSnapshot } from "@/modules/messaging/programNoteReplyContext";
import { listInstanceDiscussionPageMerged } from "@/modules/program-item-discussion/listInstanceDiscussionPage";
import { doctorTreatmentProgramInstanceRouteErrorStatus } from "@/modules/treatment-program/doctorInstanceRouteErrorStatus";

const directionSchema = z.enum(["backward", "forward"]);

const cursorPayloadSchema = z.object({
  createdAt: z.string().min(1),
  id: z.string().min(1),
});

function decodeCursor(raw: string): z.infer<typeof cursorPayloadSchema> | null {
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as unknown;
    const validated = cursorPayloadSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

function normalizeLimit(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return 30;
  if (!/^\d+$/.test(raw.trim())) return null;
  return Math.min(100, Math.max(1, Number.parseInt(raw, 10)));
}

async function resolveDoctorInstanceContext(instanceId: string) {
  const deps = buildAppDeps();
  const instance = await deps.treatmentProgramInstance.getInstanceById(instanceId);
  if (!instance) return { error: NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }) };

  const identity = await deps.doctorClientsPort.getClientIdentity(instance.patientUserId);
  if (!identity) {
    return { error: NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }) };
  }

  if (instance.assignmentSource !== "doctor") {
    return {
      error: NextResponse.json({ ok: false, error: "program_not_doctor_assigned" }, { status: 400 }),
    };
  }

  const items = instance.stages.flatMap((stage) =>
    stage.items.map((item) => ({
      stageItemId: item.id,
      exerciseTitle: exerciseTitleFromSnapshot(item.snapshot),
    })),
  );

  return { deps, instance, items };
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

  const url = new URL(request.url);
  const limit = normalizeLimit(url.searchParams.get("limit"));
  if (limit == null) {
    return NextResponse.json({ ok: false, error: "invalid_limit" }, { status: 400 });
  }

  const directionParsed = directionSchema.safeParse(url.searchParams.get("direction") ?? "backward");
  if (!directionParsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_direction" }, { status: 400 });
  }
  const direction = directionParsed.data;

  const rawCursor = url.searchParams.get("cursor");
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) {
    return NextResponse.json({ ok: false, error: "invalid_cursor" }, { status: 400 });
  }

  const stageItemIdRaw = url.searchParams.get("stageItemId");
  const stageItemIdFilter =
    stageItemIdRaw != null && stageItemIdRaw.trim() !== "" ? stageItemIdRaw.trim() : null;
  if (stageItemIdFilter && !z.string().uuid().safeParse(stageItemIdFilter).success) {
    return NextResponse.json({ ok: false, error: "invalid_stage_item_id" }, { status: 400 });
  }

  try {
    const resolved = await resolveDoctorInstanceContext(instanceId);
    if ("error" in resolved && resolved.error) return resolved.error;

    const { deps, instance, items } = resolved;
    if (stageItemIdFilter && !items.some((item) => item.stageItemId === stageItemIdFilter)) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const pageResult = await listInstanceDiscussionPageMerged({
      discussion: deps.programItemDiscussion,
      items,
      patientUserId: instance.patientUserId,
      stageItemIdFilter,
      limit,
      direction,
      cursor,
    });

    const stageItemIdsForPeerRead =
      stageItemIdFilter != null ? [stageItemIdFilter] : [...new Set(items.map((item) => item.stageItemId))];
    const peerLastReadAtByStageItemId = Object.fromEntries(
      await Promise.all(
        stageItemIdsForPeerRead.map(async (stageItemId) => [
          stageItemId,
          await deps.programItemDiscussion.getLastReadAtForViewer({
            viewerUserId: instance.patientUserId,
            stageItemId,
          }),
        ]),
      ),
    );

    return NextResponse.json({
      ok: true,
      messages: pageResult.page,
      pageInfo: {
        direction,
        limit,
        nextCursor: pageResult.nextCursor,
        hasMore: pageResult.hasMore,
        stageItemIdFilter,
      },
      totalCount: pageResult.totalCount,
      peerLastReadAtByStageItemId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (doctorTreatmentProgramInstanceRouteErrorStatus(msg) === 404) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
