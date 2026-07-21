import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from "@/modules/auth/authChannelPolicy";
import { normalizeEmail, startEmailChallenge } from "@/modules/auth/emailAuth";
import { hashPin } from "@/modules/auth/pinHash";
import { getSpecialistSignupEnabled } from "@/modules/auth/specialistSignupRollout";
import { enterStaffSecuritySelfPrincipal } from "@/app-layer/principal/staffSecuritySelfPrincipal";
import { formatDoctorFio, normalizeFioPart } from "@/shared/lib/fio";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  lastName: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(100),
  patronymic: z.string().trim().max(100).optional(),
  organizationTitle: z.string().trim().min(1).max(200),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/auth/specialist-signup/start:POST");
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

  const specialistSignupEnabled = await getSpecialistSignupEnabled();
  if (!specialistSignupEnabled) {
    return NextResponse.json({ ok: false, error: "specialist_signup_disabled" }, { status: 423 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  const lastName = normalizeFioPart(parsed.data.lastName);
  const firstName = normalizeFioPart(parsed.data.firstName);
  const patronymic = normalizeFioPart(parsed.data.patronymic);
  const organizationTitle = parsed.data.organizationTitle.trim();
  if (!lastName || !firstName) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const specialistFullName = formatDoctorFio({ lastName, firstName, patronymic });
  const deps = buildAppDeps();
  const passwordHash = await hashPin(parsed.data.password);

  const reg = await deps.userPasswordCredentials.registerPendingSpecialistVerification({
    emailNormalized: emailNorm,
    passwordHash,
    lastName,
    firstName,
    patronymic,
  });

  if (!reg.ok) {
    const resend = await deps.userPasswordCredentials.tryResendRegistrationChallenge({
      emailNormalized: emailNorm,
      plainPassword: parsed.data.password,
    });
    if (!resend.ok) {
      return NextResponse.json({ ok: false, error: "duplicate_email" }, { status: 409 });
    }
    const challenge = await startEmailChallenge(resend.userId, emailNorm);
    if (!challenge.ok) {
      return NextResponse.json(
        { ok: false, error: challenge.code, retryAfterSeconds: challenge.retryAfterSeconds },
        { status: challenge.code === "rate_limited" ? 429 : 400 },
      );
    }
    enterStaffSecuritySelfPrincipal(resend.userId, "api/auth/specialist-signup/start:resend-self");
    const replaced = await deps.organizationProvisioning.replacePendingSpecialistSignupChallenge({
      challengeId: challenge.challengeId,
    });
    if (!replaced) {
      return NextResponse.json({ ok: false, error: "signup_recovery_required" }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      challengeId: challenge.challengeId,
      retryAfterSeconds: challenge.retryAfterSeconds,
    });
  }

  const challenge = await startEmailChallenge(reg.userId, emailNorm);
  if (!challenge.ok) {
    await deps.userPasswordCredentials.deleteUnverifiedEmailPasswordRegistration(reg.userId);
    return NextResponse.json(
      { ok: false, error: challenge.code, retryAfterSeconds: challenge.retryAfterSeconds },
      { status: challenge.code === "rate_limited" ? 429 : 400 },
    );
  }

  try {
    enterStaffSecuritySelfPrincipal(reg.userId, "api/auth/specialist-signup/start:new-self");
    await deps.organizationProvisioning.createSpecialistSignupIntent({
      challengeId: challenge.challengeId,
      emailNormalized: emailNorm,
      organizationTitle,
      specialistFullName,
    });
  } catch {
    await deps.userPasswordCredentials.deleteUnverifiedEmailPasswordRegistration(reg.userId);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    challengeId: challenge.challengeId,
    retryAfterSeconds: challenge.retryAfterSeconds,
  });
}
