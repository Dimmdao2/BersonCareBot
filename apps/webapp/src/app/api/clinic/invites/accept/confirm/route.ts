import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { confirmPublicEmailOtpChallenge } from "@/modules/auth/emailOtpPublic";
import { normalizeEmail } from "@/modules/auth/emailAuth";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { setSessionFromUser } from "@/modules/auth/service";

const bodySchema = z.object({
  token: z.string().trim().min(16),
  code: z.string().trim().min(1).max(12),
  email: z.string().optional(),
});

function errorStatus(code: string): number {
  if (code === "too_many_attempts") return 429;
  if (code === "server_error") return 500;
  return 400;
}

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/clinic/invites/accept/confirm:POST");
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const lookup = await deps.organizationInvites.lookupPendingByToken(parsed.data.token);
  if (!lookup.ok) {
    return NextResponse.json({ ok: false, error: lookup.code }, { status: 400 });
  }

  const suppliedEmail = parsed.data.email ? normalizeEmail(parsed.data.email) : null;
  if (suppliedEmail && suppliedEmail !== lookup.invite.invitedEmail) {
    return NextResponse.json({ ok: false, error: "email_mismatch" }, { status: 400 });
  }

  const otp = await confirmPublicEmailOtpChallenge(
    lookup.invite.invitedEmail,
    parsed.data.code,
    deps.emailOtpPublicDb,
  );
  if (!otp.ok) {
    return NextResponse.json(
      { ok: false, error: otp.code, retryAfterSeconds: otp.retryAfterSeconds },
      {
        status: errorStatus(otp.code),
        ...(otp.retryAfterSeconds != null
          ? { headers: { "Retry-After": String(otp.retryAfterSeconds) } }
          : {}),
      },
    );
  }

  const accepted = await deps.organizationInvites.acceptInvite({
    token: parsed.data.token,
    platformUserId: otp.userId,
    expectedEmail: lookup.invite.invitedEmail,
  });
  if (!accepted.ok) {
    return NextResponse.json({ ok: false, error: accepted.code }, { status: 400 });
  }

  const user = await deps.userByPhone.findByUserId(accepted.platformUserId);
  if (!user) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }

  await setSessionFromUser({ ...user, role: "doctor" });

  return NextResponse.json({
    ok: true,
    redirectTo: getRedirectPathForRole("doctor"),
    organizationId: accepted.organizationId,
    membershipId: accepted.membershipId,
    specialistId: accepted.specialistId,
    invitedRole: accepted.role,
  });
}
