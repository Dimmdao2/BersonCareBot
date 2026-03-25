import { NextResponse } from "next/server";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function POST(req: Request) {
  const session = await requirePatientAccess().catch(() => null);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { occurrenceIds?: unknown; all?: unknown };
  try {
    body = (await req.json()) as { occurrenceIds?: unknown; all?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json body" }, { status: 400 });
  }

  const deps = buildAppDeps();

  // Mark ALL unseen for the user
  if (body.all === true) {
    await deps.reminderProjection.markAllSeen(session.user.userId);
    return NextResponse.json({ ok: true });
  }

  // Mark specific occurrences
  const ids = body.occurrenceIds;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    !ids.every((id) => typeof id === "string")
  ) {
    return NextResponse.json(
      { ok: false, error: "provide occurrenceIds (string[]) or all: true" },
      { status: 400 },
    );
  }

  await deps.reminderProjection.markSeen(session.user.userId, ids as string[]);
  return NextResponse.json({ ok: true });
}
