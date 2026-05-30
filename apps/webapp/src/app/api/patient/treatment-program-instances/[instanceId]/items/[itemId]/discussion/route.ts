import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { exerciseTitleFromSnapshot } from "@/modules/messaging/programNoteReplyContext";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";

const directionSchema = z.enum(["backward", "forward"]);
const postBodySchema = z.object({
  body: z.string().min(1).max(4000),
});

const cursorPayloadSchema = z.object({
  createdAt: z.string().min(1),
  id: z.string().min(1),
});

type DiscussionDirection = z.infer<typeof directionSchema>;
type CursorPayload = z.infer<typeof cursorPayloadSchema>;

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

function encodeCursor(message: Pick<ProgramItemDiscussionMessage, "createdAt" | "id">): string {
  return Buffer.from(JSON.stringify({ createdAt: message.createdAt, id: message.id }), "utf8").toString("base64url");
}

function decodeCursor(raw: string): CursorPayload | null {
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

function paginateMessages(params: {
  messages: ProgramItemDiscussionMessage[];
  limit: number;
  direction: DiscussionDirection;
  cursor: CursorPayload | null;
}) {
  const { messages, limit, direction, cursor } = params;
  const sorted = [...messages].sort(compareByPosition);
  if (sorted.length === 0) {
    return {
      page: [] as ProgramItemDiscussionMessage[],
      nextCursor: null as string | null,
      hasMore: false,
    };
  }

  if (direction === "forward") {
    let start = 0;
    if (cursor) {
      while (
        start < sorted.length &&
        compareByPosition(sorted[start]!, { createdAt: cursor.createdAt, id: cursor.id }) <= 0
      ) {
        start += 1;
      }
    }
    const end = Math.min(sorted.length, start + limit);
    const page = sorted.slice(start, end);
    const hasMore = end < sorted.length;
    const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]!) : null;
    return { page, nextCursor, hasMore };
  }

  let endExclusive = sorted.length;
  if (cursor) {
    endExclusive = 0;
    while (
      endExclusive < sorted.length &&
      compareByPosition(sorted[endExclusive]!, { createdAt: cursor.createdAt, id: cursor.id }) < 0
    ) {
      endExclusive += 1;
    }
  }
  const start = Math.max(0, endExclusive - limit);
  const page = sorted.slice(start, endExclusive);
  const hasMore = start > 0;
  const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[0]!) : null;
  return { page, nextCursor, hasMore };
}

function getLastDoneSummary(params: {
  actionLogRows: Array<{
    instanceStageItemId: string;
    actionType: string;
    createdAt: string;
    payload: Record<string, unknown> | null;
  }>;
  itemId: string;
}) {
  const row = params.actionLogRows.find(
    (x) => x.instanceStageItemId === params.itemId && x.actionType === "done",
  );
  if (!row) return null;
  const payload = row.payload ?? {};
  const reps = typeof payload.reps === "number" && Number.isFinite(payload.reps) ? payload.reps : null;
  const weightKg =
    typeof payload.weightKg === "number" && Number.isFinite(payload.weightKg) ? payload.weightKg : null;
  const perceivedDifficulty =
    payload.perceivedDifficulty === "easy" ||
    payload.perceivedDifficulty === "medium" ||
    payload.perceivedDifficulty === "hard"
      ? payload.perceivedDifficulty
      : null;
  return {
    createdAt: row.createdAt,
    reps,
    weightKg,
    perceivedDifficulty,
  };
}

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
  return {
    ok: true as const,
    deps,
    exerciseTitle: exerciseTitleFromSnapshot(item.snapshot),
    item,
  };
}

async function assertDiscussionUiEnabled(deps: ReturnType<typeof buildAppDeps>): Promise<boolean> {
  const row = await deps.systemSettings.getSetting("patient_program_discussion_ui_enabled", "admin");
  return parseFeatureEnabled(row?.valueJson ?? null);
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
  context: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { instanceId, itemId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success || !z.string().uuid().safeParse(itemId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const limit = normalizeLimit(url.searchParams.get("limit"));
  if (limit == null) {
    return NextResponse.json({ ok: false, error: "invalid_limit" }, { status: 400 });
  }

  const directionRaw = url.searchParams.get("direction");
  const directionParsed = directionSchema.safeParse(directionRaw ?? "backward");
  if (!directionParsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_direction" }, { status: 400 });
  }
  const direction = directionParsed.data;

  const rawCursor = url.searchParams.get("cursor");
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) {
    return NextResponse.json({ ok: false, error: "invalid_cursor" }, { status: 400 });
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

  if (!(await assertDiscussionUiEnabled(itemContext.deps))) {
    return NextResponse.json({ ok: false, error: "feature_disabled" }, { status: 403 });
  }

  const [messages, unreadCount, actionLogRows] = await Promise.all([
    listAllDiscussionMessages(itemContext.deps, itemId),
    itemContext.deps.programItemDiscussion.getUnreadCount({
      patientUserId: gate.session.user.userId,
      stageItemId: itemId,
      exerciseTitle: itemContext.exerciseTitle,
    }),
    itemContext.deps.programActionLog.listForInstance({ instanceId, limit: 500 }),
  ]);

  const supportIds = messages
    .map((x) => x.supportMessageId)
    .filter((x): x is string => typeof x === "string" && x.length > 0);

  const legacy = await listAllLegacyAdminReplies({
    deps: itemContext.deps,
    patientUserId: gate.session.user.userId,
    stageItemId: itemId,
    exerciseTitle: itemContext.exerciseTitle,
    excludeSupportMessageIds: supportIds,
  });

  const merged = [...messages, ...legacy].sort(compareByPosition);
  const { page, nextCursor, hasMore } = paginateMessages({
    messages: merged,
    limit,
    direction,
    cursor,
  });

  return NextResponse.json({
    ok: true,
    messages: page,
    pageInfo: {
      direction,
      limit,
      nextCursor,
      hasMore,
    },
    totalCount: merged.length,
    unreadCount,
    lastMessage: merged.length > 0 ? merged[merged.length - 1] : null,
    lastDoneSummary: getLastDoneSummary({ actionLogRows, itemId }),
  });
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

  if (!(await assertDiscussionUiEnabled(itemContext.deps))) {
    return NextResponse.json({ ok: false, error: "feature_disabled" }, { status: 403 });
  }

  try {
    await itemContext.deps.treatmentProgramPatientActions.patientAppendObservationNote({
      patientUserId: gate.session.user.userId,
      instanceId,
      stageItemId: itemId,
      note: parsed.data.body,
    });
    const latestRows = await listAllDiscussionMessages(itemContext.deps, itemId);
    const latest = latestRows.sort(compareByPosition).at(-1) ?? null;
    return NextResponse.json({ ok: true, message: latest });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("не найден") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
