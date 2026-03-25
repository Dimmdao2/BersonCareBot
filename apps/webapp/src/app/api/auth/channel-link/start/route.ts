import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { getCurrentSession } from "@/modules/auth/service";
import { startChannelLink } from "@/modules/auth/channelLink";

const bodySchema = z.object({
  channelCode: z.enum(["telegram", "max", "vk"]),
});

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const json = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const result = await startChannelLink({
    userId: session.user.userId,
    channelCode: parsed.data.channelCode,
    botUsername: env.TELEGRAM_BOT_USERNAME.replace(/^@/, ""),
  });

  if (!result.ok) {
    const status = result.code === "unsupported_channel" ? 400 : 500;
    return NextResponse.json({ ok: false, error: result.code }, { status });
  }

  return NextResponse.json({
    ok: true,
    url: result.url,
    expiresAt: result.expiresAtIso,
    ...(result.manualCommand ? { manualCommand: result.manualCommand } : {}),
  });
}
