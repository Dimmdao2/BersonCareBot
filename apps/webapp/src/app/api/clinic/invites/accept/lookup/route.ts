import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const bodySchema = z.object({
  token: z.string().trim().min(16),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/clinic/invites/accept/lookup:POST");
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const result = await deps.organizationInvites.lookupPendingByToken(parsed.data.token);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.code }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    invited_email: result.invite.invitedEmail,
    invited_role: result.invite.invitedRole,
    organizationTitle: result.invite.organizationTitle,
  });
}
