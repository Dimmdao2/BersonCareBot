import { NextResponse } from "next/server";
import { getPool } from "@/infra/db/client";
import { verifyIntegratorSignature } from "@/infra/webhooks/verifyIntegratorSignature";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

type Body = {
  integratorUserId?: unknown;
  occurrenceId?: unknown;
  reason?: unknown;
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
  if (!integratorUserId || !occurrenceId) return { ok: false, error: "integratorUserId and occurrenceId required" };
  let reason: string | null = null;
  if (o.reason === null || o.reason === undefined) {
    reason = null;
  } else if (typeof o.reason === "string") {
    const t = o.reason.trim();
    reason = t.length === 0 ? null : t.slice(0, 500);
  } else {
    return { ok: false, error: "reason must be string or null" };
  }
  return { ok: true, data: { integratorUserId, occurrenceId, reason } };
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

  const { integratorUserId, occurrenceId, reason } = parsed.data as {
    integratorUserId: string;
    occurrenceId: string;
    reason: string | null;
  };

  const deps = buildAppDeps();
  const pool = getPool();
  const pu = await pool.query<{ id: string }>("SELECT id FROM platform_users WHERE integrator_user_id = $1 LIMIT 1", [
    integratorUserId,
  ]);
  const platformUserId = pu.rows[0]?.id;
  if (!platformUserId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const res = await deps.reminders.skipOccurrence(platformUserId, occurrenceId, reason);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      occurrenceId: res.data.occurrenceId,
      skippedAt: res.data.skippedAt,
    },
    { status: 200 },
  );
}
