import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from "@/modules/auth/authChannelPolicy";
import { startEmailChallenge, normalizeEmail } from "@/modules/auth/emailAuth";

const bodySchema = z.object({
  token: z.string().trim().min(16),
  email: z.string().optional(),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/clinic/invites/accept/start:POST");
  if (!(await isAuthChannelEnabled("email"))) {
    return NextResponse.json(
      { ok: false, error: AUTH_CHANNEL_DISABLED_ERROR },
      { status: 503 },
    );
  }
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

  const user = await deps.emailOtpPublicDb.findOrCreatePublicEmailUser(lookup.invite.invitedEmail);
  const challenge = await startEmailChallenge(user.userId, lookup.invite.invitedEmail);
  if (!challenge.ok) {
    const status = challenge.code === "rate_limited" || challenge.code === "too_many_attempts" ? 429 : 503;
    return NextResponse.json(
      { ok: false, error: challenge.code, retryAfterSeconds: challenge.retryAfterSeconds },
      {
        status,
        ...(challenge.retryAfterSeconds != null
          ? { headers: { "Retry-After": String(challenge.retryAfterSeconds) } }
          : {}),
      },
    );
  }

  return NextResponse.json({
    ok: true,
    challengeId: challenge.challengeId,
    retryAfterSeconds: challenge.retryAfterSeconds,
  });
}
