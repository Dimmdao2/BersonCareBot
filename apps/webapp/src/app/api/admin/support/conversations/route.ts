import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePlatformOperationsApiContext } from "@/app-layer/guards/requireRole";

const querySchema = z.object({
  unanswered: z.enum(["0", "1"]).default("0"),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

export async function GET(request: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    unanswered: url.searchParams.get("unanswered") ?? "0",
    limit: url.searchParams.get("limit") ?? "100",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_query" },
      { status: 400 },
    );
  }

  const conversations =
    await buildAppDeps().messaging.platformSupport.listConversations({
      unansweredOnly: parsed.data.unanswered === "1",
      limit: parsed.data.limit,
    });
  return NextResponse.json({ ok: true, conversations });
}
