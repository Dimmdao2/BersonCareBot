import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { normalizeEmail } from "@/modules/auth/emailAuth";
import { requestEmailSetupAccessForUser } from "@/modules/auth/emailPasswordLookup/requestSetupAccess";

const bodySchema = z.object({
  email: z.string().email(),
});

/** Повторная отправка setup-link для contact-only / verified без пароля (явный запрос UI). */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  const deps = buildAppDeps();
  const state = await deps.emailPasswordLookup.resolveAuthState(emailNorm);

  if (state.kind !== "needs_email_setup") {
    return NextResponse.json({ ok: false, error: "not_eligible" }, { status: 400 });
  }

  const sent = await requestEmailSetupAccessForUser(deps.emailSetupAccess, {
    userId: state.userId,
    emailNormalized: emailNorm,
    source: "manual_resend",
  });

  if (!sent.ok) {
    return NextResponse.json({ ok: false, error: sent.error }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
