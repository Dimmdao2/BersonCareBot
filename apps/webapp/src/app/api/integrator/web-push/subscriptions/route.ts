/**
 * Integrator M2M GET — active web-push subscriptions for a user.
 *
 * PLAN S13 Model β: integrator reads webapp subscriptions at send time (no mirror table, no migration).
 * N3 decision: Model β approved by orchestrator (2026-06-17); VAPID private over M2M is acceptable
 * (already server-side in system_settings; no new exposure surface).
 *
 * Auth: standard integrator GET HMAC signature (assertIntegratorGetRequest).
 *
 * GET /api/integrator/web-push/subscriptions?userId=<platformUserId>
 * Response: { ok: true, subscriptions: WebPushSubscriptionPayloadV1[] }
 */
import { NextResponse } from "next/server";
import { assertIntegratorGetRequest } from "@/app-layer/integrator/assertIntegratorGetRequest";
import { listActiveWebPushSubscriptionsForIntegrator } from "@/app-layer/integrator/webPushSubscriptions";

export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }

  const subscriptions = await listActiveWebPushSubscriptionsForIntegrator(userId);
  return NextResponse.json({ ok: true, subscriptions }, { status: 200 });
}
