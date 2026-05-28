import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  newRegistrationAttemptId,
  recordAuthRegistrationAttempt,
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
} from "@/app-layer/product-analytics/recordAuthRegistration";
import { normalizeEmail, startEmailChallenge } from "@/modules/auth/emailAuth";
import { requestEmailSetupAccessForUser } from "@/modules/auth/emailPasswordLookup/requestSetupAccess";
import { hashPin } from "@/modules/auth/pinHash";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().max(200).optional(),
});

const LOG_BASE = {
  authMethod: "email_password" as const,
  entryChannel: "browser" as const,
  contactType: "email" as const,
};

/** Регистрация email+password: строка канона + пароль; подтверждение почты через существующий email challenge. */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  const attemptId = newRegistrationAttemptId();

  if (!parsed.success) {
    await recordAuthRegistrationFailure({
      ...LOG_BASE,
      attemptId,
      stage: "start",
      contactValue: null,
      errorCode: "invalid_body",
    });
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  const displayName = (parsed.data.displayName?.trim() || emailNorm.split("@")[0] || "Пациент").slice(0, 500);

  await recordAuthRegistrationAttempt({
    ...LOG_BASE,
    attemptId,
    stage: "start",
    contactValue: emailNorm,
  });

  const deps = buildAppDeps();
  const passwordHash = await hashPin(parsed.data.password);

  const reg = await deps.userPasswordCredentials.registerPendingVerification({
    emailNormalized: emailNorm,
    passwordHash,
    displayName,
  });

  async function respondWithChallenge(userId: string, rollbackOnSendFail: boolean) {
    const challenge = await startEmailChallenge(userId, emailNorm);
    if (!challenge.ok) {
      if (rollbackOnSendFail) {
        await deps.userPasswordCredentials.deleteUnverifiedEmailPasswordRegistration(userId);
      }
      await recordAuthRegistrationFailure({
        ...LOG_BASE,
        attemptId,
        stage: "challenge_sent",
        contactValue: emailNorm,
        userId,
        errorCode: challenge.code,
      });
      return NextResponse.json(
        { ok: false, error: challenge.code, retryAfterSeconds: challenge.retryAfterSeconds },
        { status: challenge.code === "rate_limited" ? 429 : 400 },
      );
    }
    await recordAuthRegistrationSuccess({
      ...LOG_BASE,
      attemptId,
      stage: "challenge_sent",
      contactValue: emailNorm,
      userId,
      challengeId: challenge.challengeId,
      isNewAccount: true,
    });
    return NextResponse.json({
      ok: true,
      attemptId,
      challengeId: challenge.challengeId,
      retryAfterSeconds: challenge.retryAfterSeconds,
    });
  }

  if (reg.ok) {
    return respondWithChallenge(reg.userId, true);
  }

  if (reg.reason === "duplicate_email") {
    const state = await deps.emailPasswordLookup.resolveAuthState(emailNorm);

    if (state.kind === "needs_email_setup") {
      const sent = await requestEmailSetupAccessForUser(deps.emailSetupAccess, {
        userId: state.userId,
        emailNormalized: emailNorm,
        source: "registration_claim",
      });
      if (!sent.ok) {
        await recordAuthRegistrationFailure({
          ...LOG_BASE,
          attemptId,
          stage: "start",
          contactValue: emailNorm,
          userId: state.userId,
          errorCode: sent.error,
        });
        return NextResponse.json({ ok: false, error: sent.error }, { status: 503 });
      }
      await recordAuthRegistrationFailure({
        ...LOG_BASE,
        attemptId,
        stage: "start",
        contactValue: emailNorm,
        userId: state.userId,
        errorCode: "existing_account_needs_email_setup",
      });
      return NextResponse.json({
        ok: true,
        attemptId,
        error: "existing_account_needs_email_setup",
        setupLinkSent: true,
      });
    }

    if (state.kind === "email_conflict") {
      await recordAuthRegistrationFailure({
        ...LOG_BASE,
        attemptId,
        stage: "start",
        contactValue: emailNorm,
        errorCode: "email_conflict",
      });
      return NextResponse.json({ ok: false, error: "email_conflict" }, { status: 409 });
    }

    if (state.kind === "verified_with_password") {
      await recordAuthRegistrationFailure({
        ...LOG_BASE,
        attemptId,
        stage: "start",
        contactValue: emailNorm,
        errorCode: "duplicate_email",
      });
      return NextResponse.json({ ok: false, error: "duplicate_email" }, { status: 409 });
    }

    if (state.kind === "pending_registration") {
      const resent = await deps.userPasswordCredentials.tryResendRegistrationChallenge({
        emailNormalized: emailNorm,
        plainPassword: parsed.data.password,
      });
      if (!resent.ok) {
        await recordAuthRegistrationFailure({
          ...LOG_BASE,
          attemptId,
          stage: "start",
          contactValue: emailNorm,
          errorCode: "duplicate_email",
        });
        return NextResponse.json({ ok: false, error: "duplicate_email" }, { status: 409 });
      }
      return respondWithChallenge(resent.userId, false);
    }

    await recordAuthRegistrationFailure({
      ...LOG_BASE,
      attemptId,
      stage: "start",
      contactValue: emailNorm,
      errorCode: "duplicate_email",
    });
    return NextResponse.json({ ok: false, error: "duplicate_email" }, { status: 409 });
  }

  await recordAuthRegistrationFailure({
    ...LOG_BASE,
    attemptId,
    stage: "start",
    contactValue: emailNorm,
    errorCode: "duplicate_email",
  });
  return NextResponse.json({ ok: false, error: "duplicate_email" }, { status: 409 });
}
