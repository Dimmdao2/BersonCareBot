import { NextResponse } from "next/server";
import { assertIntegratorGetRequest } from "@/app-layer/integrator/assertIntegratorGetRequest";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { integratorSupportConversationsQuerySchema } from "@/modules/messaging/supportAdminListQuery";

export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const parsed = integratorSupportConversationsQuerySchema.safeParse({
    source: url.searchParams.get("source")?.trim() || undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid query" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.supportCommunication) {
    return NextResponse.json({ ok: false, error: "support communication not available" }, { status: 503 });
  }
  const conversations = await deps.supportCommunication.listOpenConversationsForAdmin({
    ...(parsed.data.source ? { source: parsed.data.source } : {}),
    limit: parsed.data.limit,
  });
  return NextResponse.json({ ok: true, conversations }, { status: 200 });
}
