import { NextResponse } from "next/server";
import { verifyIntegratorSignature } from "@/app-layer/integrator/verifyIntegratorSignature";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getPool } from "@/app-layer/db/client";
import { findCanonicalUserIdByIntegratorId } from "@/app-layer/platform-user/canonicalPlatformUser";
import { isValidNotificationTopicId } from "@/modules/patient-notifications/notificationsTopics";
import { allowedChannelsForTopic } from "@/modules/patient-notifications/topicChannelRules";

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

  const o = json as Record<string, unknown>;
  const integratorUserId = typeof o.integratorUserId === "string" ? o.integratorUserId.trim() : "";
  const topicCode = typeof o.topicCode === "string" ? o.topicCode.trim() : "";
  const channelRaw = typeof o.channel === "string" ? o.channel.trim().toLowerCase() : "";

  if (!integratorUserId || !topicCode || (channelRaw !== "telegram" && channelRaw !== "max")) {
    return NextResponse.json(
      { ok: false, error: "integratorUserId, topicCode, and channel required" },
      { status: 400 },
    );
  }
  if (!isValidNotificationTopicId(topicCode)) {
    return NextResponse.json({ ok: false, error: "invalid topicCode" }, { status: 400 });
  }
  const channel = channelRaw as "telegram" | "max";
  if (!(allowedChannelsForTopic(topicCode) as readonly string[]).includes(channel)) {
    return NextResponse.json({ ok: false, error: "channel not allowed for this topic" }, { status: 400 });
  }

  const pool = getPool();
  const platformUserId = await findCanonicalUserIdByIntegratorId(pool, integratorUserId);
  if (!platformUserId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const deps = buildAppDeps();
  const prefs = await deps.topicChannelPrefs.listByUserId(platformUserId);
  const existing = prefs.find((p) => p.topicCode === topicCode && p.channelCode === channel);
  const currentState = existing !== undefined ? existing.isEnabled : true;
  const newState = !currentState;

  await deps.topicChannelPrefs.upsert(platformUserId, topicCode, channel, newState);

  return NextResponse.json({ ok: true, newState });
}
