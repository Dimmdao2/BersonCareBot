import { runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { getPaymentProviderAdapter } from '@/infra/payments/paymentProviderRegistry';
import type { PaymentsService } from '@/modules/payments/service';
import {
  jsonError,
  jsonOk,
  mapApiError,
  type ApiErrorLiteralRules,
} from '@/shared/http/apiResponse';

type RouteContext = { params: Promise<{ provider: string }> };
type WebhookPayments = Pick<
  PaymentsService,
  'resolveProviderWebhookOrganizationId' | 'processProviderWebhook'
>;

const PAYMENT_WEBHOOK_ERROR_RULES = {
  invalid_webhook_signature: { status: 401, code: 'invalid_webhook_signature' },
} as const satisfies ApiErrorLiteralRules;

export function createPaymentsWebhookPost(deps: {
  buildDeps: () => { payments: WebhookPayments | null };
  runWithOrganization: <T>(organizationId: string, fn: () => Promise<T>) => Promise<T>;
}) {
  return async function paymentsWebhookPost(request: Request, context: RouteContext) {
    stampBootstrapPrincipal('api/payments/webhook:POST:pre-routing', request);
    const { provider } = await context.params;
    const appDeps = deps.buildDeps();
    if (!appDeps.payments) {
      return jsonError('payments_unavailable', {}, { status: 503 });
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
        return jsonError('invalid_webhook_signature', {}, { status: 401 });
      }
      const result = await deps.runWithOrganization(organizationId, () =>
        payments.processProviderWebhook({
          organizationId,
          providerId: provider,
          headers: request.headers,
          bodyText,
        }),
      );
      return jsonOk({ duplicate: result.duplicate ?? false });
    } catch (error) {
      const mapped = mapApiError(error, PAYMENT_WEBHOOK_ERROR_RULES, {
        status: 400,
        code: 'webhook_failed',
      });
      return jsonError(mapped.code, mapped.publicFields ?? {}, {
        status: mapped.status,
        headers: mapped.headers,
      });
    }
  };
}

export const POST = createPaymentsWebhookPost({
  buildDeps: buildAppDeps,
  runWithOrganization: (organizationId, fn) => runWithDbOrganizationPrincipal(organizationId, fn),
});
