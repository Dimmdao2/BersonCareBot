import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { confirmEmailChallenge } from "@/modules/auth/emailAuth";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { setSessionFromUser } from "@/modules/auth/service";

const bodySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().min(4).max(12),
});

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  let userId = await deps.userPasswordCredentials.findUserIdByEmailChallengeId(parsed.data.challengeId);
  let shouldVerifyCode = true;
  if (!userId) {
    const intent = await deps.organizationProvisioning.getSpecialistSignupIntentByChallengeId(parsed.data.challengeId);
    if (!intent) {
      return NextResponse.json({ ok: false, error: "expired_code" }, { status: 400 });
    }
    const emailState = await deps.userProjection.getProfileEmailFields(intent.userId);
    if (!emailState.emailVerifiedAt) {
      return NextResponse.json({ ok: false, error: "expired_code" }, { status: 400 });
    }
    userId = intent.userId;
    shouldVerifyCode = false;
  }

  if (shouldVerifyCode) {
    const verifiedUserId = userId;
    if (!verifiedUserId) {
      return NextResponse.json({ ok: false, error: "expired_code" }, { status: 400 });
    }
    const result = await confirmEmailChallenge(verifiedUserId, parsed.data.challengeId, parsed.data.code);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.code, retryAfterSeconds: result.retryAfterSeconds },
        {
          status: result.code === "too_many_attempts" ? 429 : 400,
          ...(result.retryAfterSeconds != null && {
            headers: { "Retry-After": String(result.retryAfterSeconds) },
          }),
        },
      );
    }
  }

  let provisioned: Awaited<ReturnType<typeof deps.organizationProvisioning.provisionSpecialistOwner>>;
  try {
    const provisionUserId = userId;
    if (!provisionUserId) {
      return NextResponse.json({ ok: false, error: "expired_code" }, { status: 400 });
    }
    provisioned = await deps.organizationProvisioning.provisionSpecialistOwner({
      userId: provisionUserId,
      challengeId: parsed.data.challengeId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "specialist_signup_intent_not_found") {
      return NextResponse.json({ ok: false, error: "signup_intent_not_found" }, { status: 400 });
    }
    throw error;
  }

  const sessionLookupUserId = userId;
  if (!sessionLookupUserId) {
    return NextResponse.json({ ok: false, error: "expired_code" }, { status: 400 });
  }
  const sessionUser = await deps.userByPhone.findByUserId(sessionLookupUserId);
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }

  await setSessionFromUser({ ...sessionUser, role: "doctor" });

  return NextResponse.json({
    ok: true,
    redirectTo: getRedirectPathForRole("doctor"),
    organizationId: provisioned.organizationId,
    specialistId: provisioned.specialistId,
    membershipId: provisioned.membershipId,
  });
}
