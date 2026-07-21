import { NextResponse } from "next/server";
import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { getPaymentProviderAdapter } from "@/infra/payments/paymentProviderRegistry";
import type { PaymentsService } from "@/modules/payments/service";

type RouteContext = { params: Promise<{ provider: string }> };
type WebhookPayments = Pick<
  PaymentsService,
  "resolveProviderWebhookOrganizationId" | "processProviderWebhook"
>;

export function createPaymentsWebhookPost(deps: {
  buildDeps: () => { payments: WebhookPayments | null };
  runWithOrganization: <T>(organizationId: string, fn: () => Promise<T>) => Promise<T>;
}) {
  return async function paymentsWebhookPost(request: Request, context: RouteContext) {
    stampBootstrapPrincipal("api/payments/webhook:POST:pre-routing", request);
    const { provider } = await context.params;
    const appDeps = deps.buildDeps();
    if (!appDeps.payments) {
      return NextResponse.json({ ok: false, error: "payments_unavailable" }, { status: 503 });
    }
    const payments = appDeps.payments;
    const bodyText = await request.text();
    try {
      const inspected = getPaymentProviderAdapter(provider).inspectWebhook({
        headers: request.headers,
        bodyText,
      });
      const organizationId = await payments.resolveProviderWebhookOrganizationId({
        providerId: provider,
        idempotencyKey: inspected.idempotencyKey,
        eventType: inspected.eventType,
      });
      if (!organizationId) {
        return NextResponse.json(
          { ok: false, error: "invalid_webhook_signature" },
          { status: 401 },
        );
      }
      const result = await deps.runWithOrganization(organizationId, () =>
        payments.processProviderWebhook({
          organizationId,
          providerId: provider,
          headers: request.headers,
          bodyText,
        }),
      );
      return NextResponse.json({ ok: true, duplicate: result.duplicate ?? false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "webhook_failed";
      if (message === "invalid_webhook_signature") {
        return NextResponse.json({ ok: false, error: message }, { status: 401 });
      }
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
  };
}

export const POST = createPaymentsWebhookPost({
  buildDeps: buildAppDeps,
  runWithOrganization: (organizationId, fn) =>
    runWithDbOrganizationPrincipal(organizationId, fn),
});
