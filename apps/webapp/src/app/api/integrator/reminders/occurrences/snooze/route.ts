import { NextResponse } from "next/server";
import { verifyIntegratorSignature } from "@/infra/webhooks/verifyIntegratorSignature";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getPool } from "@/infra/db/client";
import { findCanonicalUserIdByIntegratorId } from "@/infra/repos/pgCanonicalPlatformUser";

const MINUTES = new Set([30, 60, 120]);

type Body = {
  integratorUserId?: unknown;
  occurrenceId?: unknown;
  minutes?: unknown;
};

function parseBody(raw: unknown): { ok: true; data: Body } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "invalid payload" };
  const o = raw as Body;
  const integratorUserId =
    typeof o.integratorUserId === "string" && o.integratorUserId.trim().length > 0
      ? o.integratorUserId.trim()
      : null;
  const occurrenceId =
    typeof o.occurrenceId === "string" && o.occurrenceId.trim().length > 0
      ? o.occurrenceId.trim()
      : null;
  const minutes = typeof o.minutes === "number" && Number.isFinite(o.minutes) ? o.minutes : NaN;
  if (!integratorUserId || !occurrenceId) return { ok: false, error: "integratorUserId and occurrenceId required" };
  if (!MINUTES.has(minutes as 30 | 60 | 120)) return { ok: false, error: "minutes must be 30, 60, or 120" };
  return { ok: true, data: { integratorUserId, occurrenceId, minutes } };
}

export async function POST(request: Request) {
  const timestamp = request.headers.get("x-bersoncare-timestamp");
  const signature = request.headers.get("x-bersoncare-signature");
  const rawBody = await request.text();

  if (!timestamp || !signature) {
    return NextResponse.json({ ok: false, error: "missing webhook headers" }, { status: 400 });
  }

  if (!verifyIntegratorSignature(timestamp, rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const parsed = parseBody(json);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const { integratorUserId, occurrenceId, minutes } = parsed.data as {
    integratorUserId: string;
    occurrenceId: string;
    minutes: number;
  };

  const deps = buildAppDeps();
  const pool = getPool();
  const platformUserId = await findCanonicalUserIdByIntegratorId(pool, integratorUserId);
  if (!platformUserId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const res = await deps.reminders.snoozeOccurrence(platformUserId, occurrenceId, minutes as 30 | 60 | 120);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      occurrenceId: res.data.occurrenceId,
      snoozedUntil: res.data.snoozedUntil,
    },
    { status: 200 },
  );
}
