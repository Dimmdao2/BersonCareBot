/**
 * Integrator M2M POST — delete a dead web-push subscription by endpoint.
 *
 * Called by the integrator's `WebPushDeliveryAdapter` (S14) after a 410/404
 * response from the push provider, to clean up stale subscriptions.
 * Mirrors webapp-side `onSubscriptionDead` callback in `sendWebPushToSubscriptions`.
 *
 * Auth: standard integrator POST HMAC signature (verifyIntegratorSignature).
 *
 * POST /api/integrator/web-push/subscriptions/delete
 * Body: { endpoint: string }
 * Response: { ok: true } | { ok: false, error: string }
 */
import { NextResponse } from "next/server";
import { verifyIntegratorSignature } from "@/app-layer/integrator/verifyIntegratorSignature";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { enterVerifiedIntegratorOrganizationPrincipal } from "@/app-layer/principal/integratorOrganizationPrincipal";

export async function POST(request: Request) {
  const timestamp = request.headers.get("x-bersoncare-timestamp");
  const signature = request.headers.get("x-bersoncare-signature");
  const rawBody = await request.text();

  if (!timestamp || !signature) {
    return NextResponse.json({ ok: false, error: "missing webhook headers" }, { status: 400 });
  }

  if (!verifyIntegratorSignature(timestamp, rawBody, signature, request)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json body" }, { status: 400 });
  }

  const endpoint = typeof parsed.endpoint === "string" ? parsed.endpoint.trim() : "";
  const pushUserId = typeof parsed.pushUserId === "string" ? parsed.pushUserId.trim() : "";
  const organizationId = typeof parsed.organizationId === "string" ? parsed.organizationId.trim() : "";
  if (!endpoint || !pushUserId) {
    return NextResponse.json({ ok: false, error: "endpoint and pushUserId required" }, { status: 400 });
  }
  if (!enterVerifiedIntegratorOrganizationPrincipal(organizationId, "integrator-web-push-subscription-delete")) {
    return NextResponse.json({ ok: false, error: "valid organizationId required" }, { status: 400 });
  }

  const { organizationMembership, patientOrganization, webPushSubscriptions } = buildAppDeps();
  const [isPatient, isStaff] = await Promise.all([
    patientOrganization?.hasActiveEnrollment(pushUserId, organizationId) ?? false,
    organizationMembership?.hasActiveMembership(pushUserId, organizationId) ?? false,
  ]);
  if (!isPatient && !isStaff) {
    return NextResponse.json({ ok: false, error: "notification target is outside organization" }, { status: 403 });
  }
  await webPushSubscriptions.deleteByEndpointIfExists(pushUserId, endpoint);
  return NextResponse.json({ ok: true }, { status: 200 });
}
