import { NextResponse } from "next/server";
import { verifyIntegratorSignature } from "@/app-layer/integrator/verifyIntegratorSignature";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getPool } from "@/app-layer/db/client";
import { findCanonicalUserIdByIntegratorId } from "@/infra/repos/pgCanonicalPlatformUser";
import { disableReminderMessengerTopicForOccurrence } from "@/modules/reminders/disableReminderMessengerTopic";

type Body = {
  integratorUserId?: unknown;
  occurrenceId?: unknown;
  channel?: unknown;
};

function parseBody(raw: unknown): { ok: true; data: Body } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "invalid payload" };
  const o = raw as Body;
  const integratorUserId =
    typeof o.integratorUserId === "string" && o.integratorUserId.trim().length > 0 ?
      o.integratorUserId.trim()
    : null;
  const occurrenceId =
    typeof o.occurrenceId === "string" && o.occurrenceId.trim().length > 0 ?
      o.occurrenceId.trim()
    : null;
  const channel = typeof o.channel === "string" ? o.channel.trim().toLowerCase() : "";
  if (!integratorUserId || !occurrenceId) {
    return { ok: false, error: "integratorUserId and occurrenceId required" };
  }
  if (channel !== "telegram" && channel !== "max") {
    return { ok: false, error: "channel must be telegram or max" };
  }
  return { ok: true, data: { integratorUserId, occurrenceId, channel } };
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

  const { integratorUserId, occurrenceId, channel } = parsed.data as {
    integratorUserId: string;
    occurrenceId: string;
    channel: "telegram" | "max";
  };

  const pool = getPool();
  const platformUserId = await findCanonicalUserIdByIntegratorId(pool, integratorUserId);
  if (!platformUserId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const deps = buildAppDeps();

  const r = await disableReminderMessengerTopicForOccurrence(
    {
      pool,
      channelPreferences: deps.channelPreferencesPort,
      topicChannelPrefs: deps.topicChannelPrefs,
      webPushSubscriptions: deps.webPushSubscriptions,
    },
    {
      platformUserId,
      integratorOccurrenceId: occurrenceId,
      messengerChannel: channel,
    },
  );

  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      persisted: r.persisted,
      paragraphs: r.paragraphs,
    },
    { status: 200 },
  );
}
