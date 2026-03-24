import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyIntegratorSignature } from "@/infra/webhooks/verifyIntegratorSignature";
import { completeChannelLinkFromIntegrator } from "@/modules/auth/channelLink";

const bodySchema = z.object({
  linkToken: z.string().min(4).max(500),
  channelCode: z.literal("telegram"),
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
    return NextResponse.json({ ok: false, error: result.code }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
