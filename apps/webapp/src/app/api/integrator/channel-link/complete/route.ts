import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyIntegratorSignature } from "@/app-layer/integrator/verifyIntegratorSignature";
import { completeChannelLinkFromIntegrator } from "@/modules/auth/channelLink";

const bodySchema = z.object({
  linkToken: z.string().min(4).max(500),
  channelCode: z.enum(["telegram", "max"]),
  /** ID пользователя в мессенджере (Telegram id / MAX user_id), строка; не chat_id чата. */
  externalId: z.string().min(1).max(64),
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

  const result = await completeChannelLinkFromIntegrator({
    linkToken: parsed.data.linkToken,
    channelCode: parsed.data.channelCode,
    externalId: parsed.data.externalId,
  });

  if (!result.ok) {
    if (result.code === "used_token") {
      // Idempotent completion for repeated webhook deliveries; needsPhone — повторный запрос контакта в боте.
      return NextResponse.json({
        ok: true,
        status: "already_used",
        needsPhone: Boolean(result.needsPhone),
      });
    }
    if (result.code === "conflict") {
      return NextResponse.json(
        {
          ok: false,
          error: "conflict",
          ...(typeof result.mergeReason === "string" && result.mergeReason.length > 0
            ? { mergeReason: result.mergeReason }
            : {}),
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: result.code }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    needsPhone: result.needsPhone,
    ...(typeof result.phoneNormalized === "string" && result.phoneNormalized.trim().length > 0
      ? { phoneNormalized: result.phoneNormalized.trim() }
      : {}),
  });
}
