import { NextResponse } from "next/server";
import { z } from "zod";
import { isChannelLinkStartRateLimited } from "@/modules/auth/channelLinkStartRateLimit";
import { getCurrentSession } from "@/modules/auth/service";
import { startChannelLink } from "@/modules/auth/channelLink";
import { getTelegramLoginBotUsername } from "@/modules/system-settings/telegramLoginBotUsername";

const bodySchema = z.object({
  channelCode: z.enum(["telegram", "max", "vk"]),
});

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const uid = session.user.userId?.trim();
  if (uid && (await isChannelLinkStartRateLimited(uid))) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Слишком много запросов. Попробуйте позже." },
      { status: 429 },
    );
  }

  const json = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const botUsername = await getTelegramLoginBotUsername();
  const result = await startChannelLink({
    userId: session.user.userId,
    channelCode: parsed.data.channelCode,
    botUsername,
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
