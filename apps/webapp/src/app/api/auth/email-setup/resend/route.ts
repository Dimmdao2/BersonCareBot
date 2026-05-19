import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const bodySchema = z.object({
  token: z.string().min(1).max(512),
});

/** Новая setup-ссылка по истёкшему (но не использованному) token. */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const result = await buildAppDeps().emailSetupFlow.resendFromExpiredToken(parsed.data.token);
  if (!result.ok) {
    const status = result.error === "not_configured" ? 503 : result.error === "already_has_login" ? 409 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
