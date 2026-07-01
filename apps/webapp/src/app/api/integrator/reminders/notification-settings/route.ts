import { NextResponse } from "next/server";
import { verifyIntegratorSignature } from "@/app-layer/integrator/verifyIntegratorSignature";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getPool } from "@/app-layer/db/client";
import { findCanonicalUserIdByIntegratorId } from "@/app-layer/platform-user/canonicalPlatformUser";
import { DEFAULT_NOTIFICATION_TOPICS } from "@/modules/patient-notifications/notificationsTopics";
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
  const channelRaw = typeof o.channel === "string" ? o.channel.trim().toLowerCase() : "";
  if (!integratorUserId || (channelRaw !== "telegram" && channelRaw !== "max")) {
    return NextResponse.json(
      { ok: false, error: "integratorUserId and channel (telegram|max) required" },
      { status: 400 },
    );
  }
  const channel = channelRaw as "telegram" | "max";

  const pool = getPool();
  const platformUserId = await findCanonicalUserIdByIntegratorId(pool, integratorUserId);
  if (!platformUserId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const deps = buildAppDeps();

  let topicList: Array<{ code: string; title: string }>;
  try {
    const rows = await deps.subscriptionMailingProjection.listTopics();
    topicList =
      rows.length > 0
        ? rows.map((r) => ({ code: r.code, title: r.title }))
        : DEFAULT_NOTIFICATION_TOPICS.map((r) => ({ code: r.id, title: r.title }));
  } catch {
    topicList = DEFAULT_NOTIFICATION_TOPICS.map((r) => ({ code: r.id, title: r.title }));
  }

  const filtered = topicList.filter((t) =>
    (allowedChannelsForTopic(t.code) as readonly string[]).includes(channel),
  );

  const prefs = await deps.topicChannelPrefs.listByUserId(platformUserId);
  const prefMap = new Map<string, boolean>();
  for (const pref of prefs) {
    if (pref.channelCode === channel) {
      prefMap.set(pref.topicCode, pref.isEnabled);
    }
  }

  const topics = filtered.map((t) => ({
    code: t.code,
    title: t.title,
    isEnabled: prefMap.has(t.code) ? (prefMap.get(t.code) as boolean) : true,
  }));

  return NextResponse.json({ ok: true, topics });
}
