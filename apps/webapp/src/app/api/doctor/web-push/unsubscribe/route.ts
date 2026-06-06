import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

const bodySchema = z.union([
  z.object({ endpoint: z.string().min(10) }),
  z.object({ all: z.literal(true) }),
]);

/** POST /api/doctor/web-push/unsubscribe */
export async function POST(request: Request) {
  const gate = await requireDoctorApiSession();
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

  if ("all" in parsed.data) {
    await deps.webPushSubscriptions.removeSubscriptionsForUser(uid);
  } else {
    await deps.webPushSubscriptions.removeSubscriptionByEndpoint(uid, parsed.data.endpoint);
  }

  const remaining = await deps.webPushSubscriptions.hasAnyForUserId(uid);
  if (!remaining) {
    const card = (await deps.channelPreferences.getChannelCards(uid, gate.session.user.bindings, {})).find(
      (c) => c.code === "web_push",
    );
    await deps.channelPreferences.updatePreference(uid, "web_push", {
      isEnabledForMessages: card?.isEnabledForMessages ?? false,
      isEnabledForNotifications: false,
    });
  }

  revalidatePath(routePaths.settings);
  revalidatePath(routePaths.doctorInstall);

  return NextResponse.json({ ok: true });
}
