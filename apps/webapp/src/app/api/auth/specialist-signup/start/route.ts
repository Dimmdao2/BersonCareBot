import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { normalizeEmail, startEmailChallenge } from "@/modules/auth/emailAuth";
import { hashPin } from "@/modules/auth/pinHash";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  specialistName: z.string().trim().min(1).max(200),
  organizationTitle: z.string().trim().min(1).max(200),
});

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  const specialistName = parsed.data.specialistName.trim();
  const organizationTitle = parsed.data.organizationTitle.trim();
  const deps = buildAppDeps();
  const passwordHash = await hashPin(parsed.data.password);

  const reg = await deps.userPasswordCredentials.registerPendingSpecialistVerification({
    emailNormalized: emailNorm,
    passwordHash,
    displayName: specialistName,
  });

  if (!reg.ok) {
    return NextResponse.json({ ok: false, error: "duplicate_email" }, { status: 409 });
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
    await deps.organizationProvisioning.createSpecialistSignupIntent({
      userId: reg.userId,
      challengeId: challenge.challengeId,
      emailNormalized: emailNorm,
      organizationTitle,
      specialistFullName: specialistName,
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
