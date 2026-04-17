import { NextResponse } from "next/server";
import { assertIntegratorGetRequest } from "@/app-layer/integrator/assertIntegratorGetRequest";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "conversation id required" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.supportCommunication) {
    return NextResponse.json({ ok: false, error: "support communication not available" }, { status: 503 });
  }
  const conversation = await deps.supportCommunication.getConversationByIntegratorId(id.trim());
  if (!conversation) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, conversation }, { status: 200 });
}
