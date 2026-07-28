import type { PaymentProviderConfig } from '@/modules/payments/types';
import type { PaymentProviderPort } from '@/modules/payments/providerPort';
import { fetchWithTimeout, PAYMENT_PROVIDER_FETCH_TIMEOUT_MS } from '@/shared/lib/externalFetch';
import { createHmac, timingSafeEqual } from 'node:crypto';

function requireYookassaCredentials(config?: PaymentProviderConfig): {
  shopId: string;
  secretKey: string;
} {
  const shopId = config?.shopId?.trim() ?? '';
  const secretKey = config?.apiKey?.trim() ?? '';
  if (!shopId || !secretKey) throw new Error('yookassa_credentials_missing');
  return { shopId, secretKey };
}

function basicAuth(shopId: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;
}

function safeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function inspectYookassaWebhook(bodyText: string) {
  const payload = JSON.parse(bodyText) as {
    event?: string;
    object?: {
      id?: string;
      status?: string;
      amount?: { value?: string; currency?: string };
      metadata?: Record<string, unknown>;
    };
  };
  const event = String(payload.event ?? '');
  const object = payload.object;
  if (!object?.id) throw new Error('invalid_webhook_payload');
  const metaKey =
    typeof object.metadata?.idempotencyKey === 'string'
      ? object.metadata.idempotencyKey
      : object.id;
  const eventType =
    event === 'payment.succeeded' || object.status === 'succeeded'
      ? 'payment.succeeded'
      : event || 'payment.unknown';
  const amountMinor =
    object.amount?.value != null
      ? Math.round(Number.parseFloat(String(object.amount.value)) * 100)
      : undefined;
  return {
    idempotencyKey: metaKey,
    eventType,
    payload: payload as Record<string, unknown>,
    intentRef: object.id,
    amountMinor,
  };
}

export function createYookassaPaymentProvider(): PaymentProviderPort {
  return {
    async createIntent({ amountMinor, currency, idempotencyKey, metadata, providerConfig }) {
      const { shopId, secretKey } = requireYookassaCredentials(providerConfig);
      const value = (amountMinor / 100).toFixed(2);
      const returnUrl =
        typeof metadata.returnUrl === 'string' && metadata.returnUrl.trim()
          ? metadata.returnUrl.trim()
          : 'https://yookassa.ru';

      const body = await fetchWithTimeout(
        'https://api.yookassa.ru/v3/payments',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: basicAuth(shopId, secretKey),
            'Idempotence-Key': idempotencyKey,
          },
          body: JSON.stringify({
            amount: { value, currency },
            capture: true,
            confirmation: { type: 'redirect', return_url: returnUrl },
            metadata: {
              idempotencyKey,
              ...metadata,
            },
          }),
        },
        { timeoutMs: PAYMENT_PROVIDER_FETCH_TIMEOUT_MS },
        async (res) => {
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`yookassa_create_failed:${res.status}:${text.slice(0, 200)}`);
          }
          return (await res.json()) as {
            id?: string;
            confirmation?: { confirmation_url?: string };
          };
        },
      );
      const providerIntentRef = String(body.id ?? '');
      if (!providerIntentRef) throw new Error('yookassa_missing_payment_id');
      return {
        providerIntentRef,
        checkoutUrl: body.confirmation?.confirmation_url,
      };
    },

    async refund({ providerIntentRef, amountMinor, currency, idempotencyKey, providerConfig }) {
      const { shopId, secretKey } = requireYookassaCredentials(providerConfig);
      const value = (amountMinor / 100).toFixed(2);
      const body = await fetchWithTimeout(
        'https://api.yookassa.ru/v3/refunds',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: basicAuth(shopId, secretKey),
            'Idempotence-Key': idempotencyKey,
          },
          body: JSON.stringify({
            payment_id: providerIntentRef,
            amount: { value, currency },
          }),
        },
        { timeoutMs: PAYMENT_PROVIDER_FETCH_TIMEOUT_MS },
        async (res) => {
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`yookassa_refund_failed:${res.status}:${text.slice(0, 200)}`);
          }
          return (await res.json()) as { id?: string };
        },
      );
      return { providerRefundRef: String(body.id ?? idempotencyKey) };
    },

    inspectWebhook({ bodyText }) {
      return inspectYookassaWebhook(bodyText);
    },

    verifyWebhook({ headers, bodyText, webhookSecret, providerConfig }) {
      const webhookSecretTrimmed = webhookSecret.trim();
      const authHeader = headers.get('authorization')?.trim() ?? '';
      const signatureHeader = headers.get('x-yookassa-signature')?.trim() ?? '';

      let verified = false;
      if (providerConfig?.shopId?.trim() && providerConfig?.apiKey?.trim() && authHeader) {
        const expectedAuth = basicAuth(providerConfig.shopId.trim(), providerConfig.apiKey.trim());
        verified = safeEqualText(authHeader, expectedAuth);
      }
      if (!verified && signatureHeader && webhookSecretTrimmed) {
        const expectedSignature = createHmac('sha256', webhookSecretTrimmed)
          .update(bodyText)
          .digest('hex');
        verified = safeEqualText(signatureHeader, expectedSignature);
      }
      if (!verified) throw new Error('invalid_webhook_signature');

      return inspectYookassaWebhook(bodyText);
    },
  };
}
