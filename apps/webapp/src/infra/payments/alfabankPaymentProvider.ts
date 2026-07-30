/**
 * Alfa-Bank Acquiring (Alfa Payment Gateway) adapter.
 *
 * API docs: https://pay.alfabank.ru/ecommerce/instructions/
 *
 * Two-stage flow:
 *   1. POST /payment/rest/register.do  → orderId + formUrl (checkout redirect URL)
 *   2. Provider calls our webhook with orderId + amount on completion.
 *   3. We call GET /payment/rest/getOrderStatusExtended.do to verify state.
 *
 * Auth: merchant login + password as query/body params.
 *
 * Webhook: Alfa-Bank sends a callback GET/POST with ?mdOrder=<orderId>&orderNumber=<our ref>
 *   The correct approach is to call getOrderStatusExtended to verify payment — do NOT trust
 *   the callback params alone. We verify by checking the orderStatus field = 2 (= APPROVED).
 *
 * Default base URL: https://pay.alfabank.ru/payment/rest/
 * Test base URL:    https://alfa.rbsuat.com/payment/rest/
 * Can be overridden via providerConfig.gatewayUrl.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { PaymentProviderPort } from '@/modules/payments/providerPort';
import type { PaymentProviderConfig } from '@/modules/payments/types';

const PROD_BASE = 'https://pay.alfabank.ru/payment/rest';

function requireAlfabankCredentials(config?: PaymentProviderConfig): {
  login: string;
  password: string;
  baseUrl: string;
} {
  // login can be stored in merchantLogin or shopId; password in apiKey.
  const login = (config?.merchantLogin ?? config?.shopId ?? '').trim();
  const password = (config?.apiKey ?? '').trim();
  if (!login || !password) throw new Error('alfabank_credentials_missing');
  const baseUrl = (config?.gatewayUrl ?? PROD_BASE).replace(/\/$/, '');
  return { login, password, baseUrl };
}

function buildFormBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function inspectAlfabankWebhook(headers: Headers, bodyText: string) {
  const contentType = headers.get('content-type') ?? '';
  let payload: Record<string, unknown>;
  if (contentType.includes('application/x-www-form-urlencoded')) {
    payload = Object.fromEntries(new URLSearchParams(bodyText).entries());
  } else if (bodyText.trim().startsWith('{')) {
    payload = JSON.parse(bodyText) as Record<string, unknown>;
  } else {
    payload = Object.fromEntries(new URLSearchParams(bodyText).entries());
  }
  const mdOrder = String(payload['mdOrder'] ?? payload['orderId'] ?? '');
  const orderNumber = String(payload['orderNumber'] ?? '');
  const orderStatus = Number(payload['orderStatus'] ?? payload['status'] ?? -1);
  const eventType =
    orderStatus === 2
      ? 'payment.succeeded'
      : orderStatus === 4 || orderStatus === 6
        ? 'payment.refunded'
        : `alfabank.status_${orderStatus}`;
  const amountRaw = payload['amount'] ?? payload['depositedAmount'];
  const amountMinor =
    amountRaw != null && !Number.isNaN(Number(amountRaw))
      ? Math.round(Number(amountRaw))
      : undefined;
  const idempotencyKey = orderNumber || mdOrder;
  if (!idempotencyKey || !mdOrder) throw new Error('invalid_webhook_payload');
  return { idempotencyKey, eventType, payload, intentRef: mdOrder, amountMinor };
}

export function createAlfabankPaymentProvider(): PaymentProviderPort {
  return {
    async createIntent({ amountMinor, currency, idempotencyKey, metadata, providerConfig }) {
      const { login, password, baseUrl } = requireAlfabankCredentials(providerConfig);

      const returnUrl =
        typeof metadata.returnUrl === 'string' && metadata.returnUrl.trim()
          ? metadata.returnUrl.trim()
          : 'https://pay.alfabank.ru';

      // Alfa-Bank expects amount in kopecks — matches our minor-unit convention
      const params: Record<string, string> = {
        userName: login,
        password,
        orderNumber: idempotencyKey, // our idempotency key as order number
        amount: String(amountMinor),
        currency: currency === 'RUB' ? '643' : currency, // ISO 4217 numeric
        returnUrl,
        description:
          typeof metadata.description === 'string' ? metadata.description : idempotencyKey,
        jsonParams: JSON.stringify({ idempotencyKey, ...metadata }),
      };

      const res = await fetch(`${baseUrl}/register.do`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: buildFormBody(params),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`alfabank_create_failed:${res.status}:${text.slice(0, 200)}`);
      }

      const body = (await res.json()) as {
        errorCode?: string;
        errorMessage?: string;
        orderId?: string;
        formUrl?: string;
      };

      if (body.errorCode && body.errorCode !== '0') {
        throw new Error(`alfabank_create_error:${body.errorCode}:${body.errorMessage ?? ''}`);
      }

      const providerIntentRef = body.orderId ?? '';
      if (!providerIntentRef) throw new Error('alfabank_missing_order_id');

      return {
        providerIntentRef,
        checkoutUrl: body.formUrl,
      };
    },

    async refund({ providerIntentRef, amountMinor, idempotencyKey, providerConfig }) {
      const { login, password, baseUrl } = requireAlfabankCredentials(providerConfig);

      const params: Record<string, string> = {
        userName: login,
        password,
        orderId: providerIntentRef,
        amount: String(amountMinor),
      };

      const res = await fetch(`${baseUrl}/refund.do`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: buildFormBody(params),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`alfabank_refund_failed:${res.status}:${text.slice(0, 200)}`);
      }

      const body = (await res.json()) as {
        errorCode?: string;
        errorMessage?: string;
      };

      if (body.errorCode && body.errorCode !== '0') {
        throw new Error(`alfabank_refund_error:${body.errorCode}:${body.errorMessage ?? ''}`);
      }

      return {
        providerRefundRef: `alfabank_refund:${providerIntentRef}:${idempotencyKey}`,
      };
    },

    inspectWebhook({ headers, bodyText }) {
      return inspectAlfabankWebhook(headers, bodyText);
    },

    /**
     * Alfa-Bank webhook verification strategy:
     *
     * Alfa-Bank sends a GET/POST callback to a URL you register. The callback includes:
     *   - mdOrder (Alfa's internal order ID = our providerIntentRef)
     *   - orderNumber (our orderNumber = idempotencyKey)
     *   - checksum — SHA-256(orderId + secret) hex
     *
     * This route has no getOrderStatusExtended follow-up, so unsigned callbacks must
     * fail closed instead of being trusted as payment state authority.
     */
    verifyWebhook({ headers, bodyText, webhookSecret }) {
      const inspected = inspectAlfabankWebhook(headers, bodyText);
      const payload = inspected.payload;
      const mdOrder = inspected.intentRef ?? '';
      const checksumField = String(payload['checksum'] ?? '');
      const checksumSecret = webhookSecret.trim();

      if (!checksumField || !checksumSecret) {
        throw new Error('invalid_webhook_signature');
      }

      const expected = createHash('sha256')
        .update(mdOrder + checksumSecret)
        .digest('hex');
      const a = Buffer.from(checksumField.toLowerCase());
      const b = Buffer.from(expected.toLowerCase());
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new Error('invalid_webhook_signature');
      }

      return inspected;
    },
  };
}
