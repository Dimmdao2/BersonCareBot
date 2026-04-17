import { NextResponse } from "next/server";
import { assertIntegratorGetRequest } from "@/app-layer/integrator/assertIntegratorGetRequest";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> }
) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const { conversationId } = await context.params;
  if (!conversationId?.trim()) {
    return NextResponse.json({ ok: false, error: "conversation id required" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.supportCommunication) {
    return NextResponse.json({ ok: false, error: "support communication not available" }, { status: 503 });
  }
  const question = await deps.supportCommunication.getQuestionByIntegratorConversationId(
    conversationId.trim()
  );
  return NextResponse.json({ ok: true, question: question ?? null }, { status: 200 });
}
