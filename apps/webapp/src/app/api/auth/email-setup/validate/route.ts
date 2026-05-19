import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const bodySchema = z.object({
  token: z.string().min(1).max(512),
});

/** Публичная проверка setup-token → email для формы (в т.ч. expired для resend UI). */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const result = await buildAppDeps().emailSetupFlow.validateTokenForForm(parsed.data.token);
  if (result.ok) {
    return NextResponse.json({ ok: true, email: result.email, status: result.status });
  }

  if (result.error === "expired") {
    return NextResponse.json({ ok: false, error: "expired", email: result.email }, { status: 410 });
  }

  const status =
    result.error === "already_has_login" ? 409 : result.error === "email_mismatch" ? 409 : 400;
  return NextResponse.json({ ok: false, error: result.error }, { status });
}
