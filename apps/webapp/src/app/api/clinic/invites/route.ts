import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireEntitlement, requireEntitlementForMutation } from "@/app-layer/guards/requireEntitlement";
import { requireClinicManagementApiContext } from "@/app-layer/guards/requireRole";
import { sendEmailSetupLinkViaIntegrator } from "@/infra/integrations/email/integratorEmailAdapter";
import { getAppBaseUrl } from "@/modules/system-settings/integrationRuntime";

const bodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "doctor"]),
});

function buildInviteUrl(baseUrl: string, token: string): string {
  const url = new URL("/app/clinic/invites/accept", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function GET() {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlement(gate.ctx, "clinic_team");
  if (!entitlement.ok) return entitlement.response;

  const deps = buildAppDeps();
  const [invites, seats] = await Promise.all([
    deps.organizationInvites.listPending(gate.ctx.organizationId),
    deps.clinicSeats.getSeatStatus(gate.ctx.organizationId),
  ]);
  return NextResponse.json({ ok: true, invites, seats });
}

export async function POST(request: Request) {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, "clinic_team");
  if (!entitlement.ok) return entitlement.response;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  // Seat capacity is enforced only inside the org-locked transaction of createInvite
  // (createReplacingPending) — a route-level pre-check here cannot know that a same-email
  // request replaces (rather than adds to) that email's own pending reservation, and would
  // wrongly reject a same-email replacement at the exact limit. See pgOrganizationInvites.ts.
  const result = await deps.organizationInvites.createInvite({
    organizationId: gate.ctx.organizationId,
    email: parsed.data.email,
    role: parsed.data.role,
    createdByPlatformUserId: gate.ctx.session.user.userId,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.code }, { status: 409 });
  }

  const token = result.token;
  if (!token) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }

  // Preview links are a non-production delivery aid. Never let a dev-auth flag reclassify a
  // production process: production must require successful delivery and must not return the token.
  const mayExposeInviteUrl = env.NODE_ENV !== "production";

  const baseUrl = await getAppBaseUrl();
  const inviteUrl = buildInviteUrl(baseUrl, token);
  const emailResult = await sendEmailSetupLinkViaIntegrator(
    result.invite.invitedEmail,
    "Приглашение в BersonCare",
    [
      `Вас пригласили в клинику ${result.invite.organizationTitle ?? ""}.`.trim(),
      "Откройте ссылку и подтвердите email кодом:",
      inviteUrl,
      "Ссылка действует 7 дней.",
    ].join("\n\n"),
  );
  // The invite row is already committed. On real production a failed email means the invitee
  // can't receive the link → surface it so the admin can retry. In a non-prod env (dev/test,
  // where email is redirected/stubbed) don't hard-fail — return the invite + link so the flow
  // stays usable/verifiable without an inbox.
  if (!emailResult.ok && !mayExposeInviteUrl) {
    return NextResponse.json({ ok: false, error: "email_send_failed" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    inviteId: result.invite.id,
    expiresAt: result.invite.expiresAt,
    emailDelivered: emailResult.ok,
    ...(mayExposeInviteUrl ? { inviteUrl } : {}),
  });
}
