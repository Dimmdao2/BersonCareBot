import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

const bodySchema = z.object({
  endpoint: z.string().min(10),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/** POST /api/patient/web-push/subscribe */
export async function POST(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const uid = gate.session.user.userId;
  const ua = request.headers.get("user-agent");
  await deps.webPushSubscriptions.saveSubscription(
    uid,
    {
      endpoint: parsed.data.endpoint,
      expirationTime: parsed.data.expirationTime ?? null,
      keys: parsed.data.keys,
    },
    { userAgent: ua },
  );

  const card = (await deps.channelPreferences.getChannelCards(uid, gate.session.user.bindings, {})).find(
    (c) => c.code === "web_push",
  );
  await deps.channelPreferences.updatePreference(uid, "web_push", {
    isEnabledForMessages: card?.isEnabledForMessages ?? true,
    isEnabledForNotifications: true,
  });

  return NextResponse.json({ ok: true });
}
