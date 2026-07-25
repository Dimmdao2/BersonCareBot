import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from "@/modules/auth/authChannelPolicy";
import {
  consumeEmailChallengeCode,
  consumeLatestEmailChallengeCodeForUser,
  normalizeEmail,
} from "@/modules/auth/emailAuth";
import { hashPin } from "@/modules/auth/pinHash";
import { enterStaffSecuritySelfPrincipal } from "@/app-layer/principal/staffSecuritySelfPrincipal";

const bodySchema = z.object({
  email: z.string().email(),
  /** Опционально: после forgot-password без `challengeId` в ответе используется {@link consumeLatestEmailChallengeCodeForUser}. */
  challengeId: z.string().uuid().optional(),
  code: z.string().min(4).max(32),
  newPassword: z.string().min(8).max(128),
});

const DUMMY_RESET_USER_ID = "00000000-0000-4000-8000-000000000000";

function resetNeutralFailureResponse() {
  return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 400 });
}

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/auth/email-password/reset:POST", request);
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

  const emailNorm = normalizeEmail(parsed.data.email);
  const deps = buildAppDeps();
  const userId = await deps.userPasswordCredentials.findVerifiedUserIdWithPassword(emailNorm);
  if (!userId) {
    if (parsed.data.challengeId) {
      await consumeEmailChallengeCode(DUMMY_RESET_USER_ID, parsed.data.challengeId, parsed.data.code);
    } else {
      await consumeLatestEmailChallengeCodeForUser(DUMMY_RESET_USER_ID, parsed.data.code);
    }
    return resetNeutralFailureResponse();
  }

  const consumed = parsed.data.challengeId
    ? await consumeEmailChallengeCode(userId, parsed.data.challengeId, parsed.data.code)
    : await consumeLatestEmailChallengeCodeForUser(userId, parsed.data.code);
  if (!consumed.ok) {
    return resetNeutralFailureResponse();
  }

  const passwordHash = await hashPin(parsed.data.newPassword);
  try {
    enterStaffSecuritySelfPrincipal(userId, "api/auth/email-password/reset:challenge-verified-self");
    const security = await deps.staffSecurity.getStatus();
    // Revoke first: if the credential write fails, existing staff sessions still
    // fail closed and the user can request a fresh reset challenge.
    if (security) await deps.staffSecurity.revokeSessions();
    await deps.userPasswordCredentials.updatePasswordHash(userId, passwordHash);
  } catch {
    return NextResponse.json({ ok: false, error: "reset_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
