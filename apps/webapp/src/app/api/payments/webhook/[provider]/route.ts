import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

type RouteContext = { params: Promise<{ provider: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  const deps = buildAppDeps();
  if (!deps.payments || !deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "payments_unavailable" }, { status: 503 });
  }
  const organizationId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const bodyText = await request.text();
  try {
    const result = await deps.payments.processProviderWebhook({
      organizationId,
      providerId: provider,
      headers: request.headers,
      bodyText,
    });
    return NextResponse.json({ ok: true, duplicate: result.duplicate ?? false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook_failed";
    if (message === "invalid_webhook_signature") {
      return NextResponse.json({ ok: false, error: message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
