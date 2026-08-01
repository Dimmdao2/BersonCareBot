import type { PaymentProviderConfig } from '@/modules/payments/types';
import type { PaymentProviderPort } from '@/modules/payments/providerPort';
import { fetchWithTimeout, PAYMENT_PROVIDER_FETCH_TIMEOUT_MS } from '@/shared/lib/externalFetch';
import { BlockList } from 'node:net';

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

/**
 * ЮKassa "Уведомления" doc, authenticity section: notifications come only from these published
 * IP ranges. This is a coarse first gate; the real barrier is the payment-object refetch below.
 */
const YOOKASSA_IPV4_ALLOWLIST: ReadonlyArray<readonly [string, number]> = [
  ['185.71.76.0', 27],
  ['185.71.77.0', 27],
  ['77.75.153.0', 25],
  ['77.75.156.11', 32],
  ['77.75.156.35', 32],
  ['77.75.154.128', 25],
];
const YOOKASSA_IPV6_ALLOWLIST: ReadonlyArray<readonly [string, number]> = [['2a02:5180::', 32]];

function buildYookassaIpAllowlist(): BlockList {
  const list = new BlockList();
  for (const [address, prefix] of YOOKASSA_IPV4_ALLOWLIST) list.addSubnet(address, prefix, 'ipv4');
  for (const [address, prefix] of YOOKASSA_IPV6_ALLOWLIST) list.addSubnet(address, prefix, 'ipv6');
  return list;
}

const yookassaIpAllowlist = buildYookassaIpAllowlist();

/** Trusted `X-Real-Ip` only (nginx-set `$remote_addr`) — see `modules/auth/realIpRateLimitClientKey.ts`. */
function isYookassaSenderIpAllowed(headers: Headers): boolean {
  const ip = headers.get('x-real-ip')?.trim();
  if (!ip) return false;
  const family = ip.includes(':') ? 'ipv6' : 'ipv4';
  try {
    return yookassaIpAllowlist.check(ip, family);
  } catch {
    return false;
  }
}

type YookassaObjectResponse = {
  id?: string;
  status?: string;
  amount?: { value?: string; currency?: string };
  metadata?: Record<string, unknown>;
};

async function fetchYookassaObject(
  path: 'payments' | 'refunds',
  objectId: string,
  shopId: string,
  secretKey: string,
): Promise<YookassaObjectResponse> {
  return fetchWithTimeout(
    `https://api.yookassa.ru/v3/${path}/${encodeURIComponent(objectId)}`,
    {
      method: 'GET',
      headers: { Authorization: basicAuth(shopId, secretKey) },
    },
    { timeoutMs: PAYMENT_PROVIDER_FETCH_TIMEOUT_MS },
    async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`yookassa_${path}_fetch_failed:${res.status}:${text.slice(0, 200)}`);
      }
      return (await res.json()) as YookassaObjectResponse;
    },
  );
}

/**
 * К2 — ЮKassa sends `payment.*` and `refund.*` notifications through the same channel; `event`
 * carries which domain fired (`object.status` alone is ambiguous, since both domains use
 * `"succeeded"`). This body is untrusted until `verifyWebhook`'s API refetch confirms it — the
 * domain read here only picks WHICH object endpoint (`/v3/payments/` vs `/v3/refunds/`) to refetch,
 * never a final status.
 */
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
  const domain = event.startsWith('refund.') ? 'refund' : 'payment';
  const eventType =
    event === `${domain}.succeeded` || object.status === 'succeeded'
      ? `${domain}.succeeded`
      : event || `${domain}.unknown`;
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
    domain,
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

    async verifyWebhook({ headers, bodyText, providerConfig }) {
      if (!isYookassaSenderIpAllowed(headers)) throw new Error('invalid_webhook_signature');

      const { shopId, secretKey } = requireYookassaCredentials(providerConfig);
      const untrusted = inspectYookassaWebhook(bodyText);
      const objectId = untrusted.intentRef;
      if (!objectId) throw new Error('invalid_webhook_payload');

      // Barrier: status/amount/currency come from the API response, never from the notification
      // body — the body is only used above to learn which object (payment or refund) to look up,
      // and from which endpoint (K2: a refund notification's `object.id` is a refund id, not a
      // payment id — refetching it from `/v3/payments/` would look up the wrong thing).
      const remote = await fetchYookassaObject(
        untrusted.domain === 'refund' ? 'refunds' : 'payments',
        objectId,
        shopId,
        secretKey,
      );
      if (!remote.id) throw new Error('invalid_webhook_signature');

      const idempotencyKey =
        typeof remote.metadata?.idempotencyKey === 'string'
          ? remote.metadata.idempotencyKey
          : remote.id;
      const eventType =
        remote.status === 'succeeded'
          ? `${untrusted.domain}.succeeded`
          : `${untrusted.domain}.${remote.status ?? 'unknown'}`;
      const amountMinor =
        remote.amount?.value != null
          ? Math.round(Number.parseFloat(String(remote.amount.value)) * 100)
          : undefined;

      return {
        idempotencyKey,
        eventType,
        payload: { event: eventType, object: remote, currency: remote.amount?.currency },
        intentRef: remote.id,
        amountMinor,
      };
    },
  };
}
