import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { exerciseTitleFromSnapshot } from "@/modules/messaging/programNoteReplyContext";
import { listDiscussionPageMerged } from "@/modules/program-item-discussion/listDiscussionPage";

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

export async function GET(
  request: Request,
  context: { params: Promise<{ instanceId: string; stageItemId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { instanceId, stageItemId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success || !z.string().uuid().safeParse(stageItemId).success) {
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

  const deps = buildAppDeps();
  try {
    const instance = await deps.treatmentProgramInstance.getInstanceById(instanceId);
    if (!instance) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const identity = await deps.doctorClientsPort.getClientIdentity(instance.patientUserId);
    if (!identity) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    if (instance.assignmentSource !== "doctor") {
      return NextResponse.json({ ok: false, error: "program_not_doctor_assigned" }, { status: 400 });
    }

    const item = instance.stages.flatMap((s) => s.items).find((x) => x.id === stageItemId) ?? null;
    if (!item) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const pageResult = await listDiscussionPageMerged({
      discussion: deps.programItemDiscussion,
      stageItemId,
      patientUserId: instance.patientUserId,
      exerciseTitle: exerciseTitleFromSnapshot(item.snapshot),
      limit,
      direction,
      cursor,
    });

    const { page, nextCursor, hasMore, totalCount } = pageResult;

    return NextResponse.json({
      ok: true,
      messages: page,
      pageInfo: {
        direction,
        limit,
        nextCursor,
        hasMore,
      },
      totalCount,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}
