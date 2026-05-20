import { NextResponse } from "next/server";
import { z } from "zod";
import { getPhoneMessengerBindStatus } from "@/modules/auth/phoneMessengerBind";

const bodySchema = z.object({
  setupToken: z.string().min(4),
});

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Укажите setupToken" },
      { status: 400 },
    );
  }

  const result = await getPhoneMessengerBindStatus(parsed.data.setupToken);
  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.code }, { status });
  }

  if (result.status === "otp_ready") {
    return NextResponse.json({
      ok: true,
      status: result.status,
      challengeId: result.challengeId,
      retryAfterSeconds: result.retryAfterSeconds ?? 60,
    });
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    ...(result.status === "failed" && result.error ? { error: result.error } : {}),
  });
}
