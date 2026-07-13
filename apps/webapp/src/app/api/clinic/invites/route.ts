import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
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

  const deps = buildAppDeps();
  const invites = await deps.organizationInvites.listPending(gate.ctx.organizationId);
  return NextResponse.json({ ok: true, invites });
}

export async function POST(request: Request) {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate.response;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
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
  if (!emailResult.ok) {
    return NextResponse.json({ ok: false, error: "email_send_failed" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    inviteId: result.invite.id,
    expiresAt: result.invite.expiresAt,
    ...(env.NODE_ENV !== "production" ? { inviteUrl } : {}),
  });
}
