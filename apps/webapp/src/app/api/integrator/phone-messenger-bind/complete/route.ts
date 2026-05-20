import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { verifyIntegratorSignature } from "@/app-layer/integrator/verifyIntegratorSignature";
import { normalizePhone } from "@/modules/auth/phoneNormalize";

const bodySchema = z.object({
  setupToken: z.string().min(4).max(500),
  channelCode: z.enum(["telegram", "max"]),
  externalId: z.string().min(1).max(64),
  phoneNormalized: z.string().min(1).max(32),
});

export async function POST(request: Request) {
  const timestamp = request.headers.get("x-bersoncare-timestamp");
  const signature = request.headers.get("x-bersoncare-signature");
  const rawBody = await request.text();

  if (!timestamp || !signature) {
    return NextResponse.json({ ok: false, error: "missing webhook headers" }, { status: 400 });
  }

  if (!verifyIntegratorSignature(timestamp, rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const result = await buildAppDeps().phoneMessengerBind.completeFromIntegrator(
    {
      setupToken: parsed.data.setupToken,
      channelCode: parsed.data.channelCode,
      externalId: parsed.data.externalId,
      contactPhoneNormalized: normalizePhone(parsed.data.phoneNormalized),
    },
  );

  if (!result.ok) {
    if (result.code === "phone_mismatch") {
      return NextResponse.json({ ok: false, error: "phone_mismatch" }, { status: 409 });
    }
    if (result.code === "phone_owned_by_other_user" || result.code === "channel_owned_by_other_user") {
      return NextResponse.json({ ok: false, error: "conflict", mergeReason: result.code }, { status: 409 });
    }
    if (result.code === "used_token") {
      return NextResponse.json({ ok: true, status: "already_used" });
    }
    return NextResponse.json({ ok: false, error: result.code }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    otpCode: result.otpCode,
    accountCreated: result.accountCreated,
    challengeId: result.challengeId,
    ...(result.replay ? { replay: true } : {}),
  });
}
