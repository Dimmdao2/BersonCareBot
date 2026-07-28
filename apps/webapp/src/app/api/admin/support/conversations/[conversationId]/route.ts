import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePlatformOperationsApiContext } from "@/app-layer/guards/requireRole";

const paramsSchema = z.object({
  conversationId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_conversation_id" },
      { status: 400 },
    );
  }

  const result =
    await buildAppDeps().messaging.platformSupport.getConversation(
      parsed.data.conversationId,
    );
  if (!result) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, ...result });
}
