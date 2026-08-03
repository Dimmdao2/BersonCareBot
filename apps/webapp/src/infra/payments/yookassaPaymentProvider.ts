import type { PaymentProviderConfig } from '@/modules/payments/types';
import {
  assertReceiptMatchesOperation,
  PaymentProviderRequestRefusedError,
  type PaymentProviderPort,
  type PaymentReceipt,
} from '@/modules/payments/providerPort';
import { fetchWithTimeout, PAYMENT_PROVIDER_FETCH_TIMEOUT_MS } from '@/shared/lib/externalFetch';
import { createHash } from 'node:crypto';
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

function toYookassaReceipt(receipt: PaymentReceipt, currency: string) {
  return {
    customer: { email: receipt.customer.email.trim() },
    items: receipt.items.map((item) => ({
      description: item.description,
      quantity: item.quantity.toFixed(3),
      amount: { value: (item.amountMinor / 100).toFixed(2), currency },
      vat_code: item.vatCode,
      payment_subject: item.paymentSubject,
      payment_mode: item.paymentMode,
      measure: item.measure,
    })),
    ...(receipt.taxSystemCode ? { tax_system_code: receipt.taxSystemCode } : {}),
  };
}

const YOOKASSA_IDEMPOTENCE_KEY_MAX_LENGTH = 64;

/** YooKassa limits the outgoing Idempotence-Key header to 64 characters. */
function toYookassaIdempotenceKey(idempotencyKey: string): string {
  if (idempotencyKey.length <= YOOKASSA_IDEMPOTENCE_KEY_MAX_LENGTH) return idempotencyKey;
  return createHash('sha256').update(idempotencyKey).digest('hex');
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
  /** К4 — present on a payment created by paying a YooKassa invoice; points back at that invoice's
   *  own id (`in-...`), which is NOT the same id as the payment object itself (`remote.id`). */
  invoice_details?: { id?: string };
  /** К6 — present when `save_payment_method: true` (or an existing saved method) was used; `saved`
   *  is only `true` once the provider actually persisted it for reuse. */
  payment_method?: { id?: string; saved?: boolean };
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

type YookassaListResponse = {
  type?: string;
  items?: Array<{ id?: string; status?: string; amount?: { value?: string; currency?: string } }>;
  next_cursor?: string;
};

/** ЮKassa's own page size ceiling for `GET /v3/payments`. */
const YOOKASSA_LIST_PAGE_LIMIT = 100;
/** Backstop against an unbounded reconciliation call — 100 pages is 10 000 payments per period. */
const YOOKASSA_LIST_MAX_PAGES = 100;

async function fetchYookassaPaymentsPage(
  shopId: string,
  secretKey: string,
  params: { periodFromIso: string; periodToIso: string; cursor?: string },
): Promise<YookassaListResponse> {
  const query = new URLSearchParams({
    'created_at.gte': params.periodFromIso,
    'created_at.lte': params.periodToIso,
    limit: String(YOOKASSA_LIST_PAGE_LIMIT),
  });
  if (params.cursor) query.set('cursor', params.cursor);
  return fetchWithTimeout(
    `https://api.yookassa.ru/v3/payments?${query.toString()}`,
    { method: 'GET', headers: { Authorization: basicAuth(shopId, secretKey) } },
    { timeoutMs: PAYMENT_PROVIDER_FETCH_TIMEOUT_MS },
    async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`yookassa_payments_list_failed:${res.status}:${text.slice(0, 200)}`);
      }
      return (await res.json()) as YookassaListResponse;
    },
  );
}

export function createYookassaPaymentProvider(): PaymentProviderPort {
  return {
    supportsInvoice: true,

    async createIntent({
      amountMinor,
      currency,
      idempotencyKey,
      payerRef,
      purpose,
      subjectRef,
      metadata,
      returnUrl,
      invoice,
      receipt,
      providerConfig,
      savePaymentMethod,
      paymentMethodId,
    }) {
      const { shopId, secretKey } = requireYookassaCredentials(providerConfig);
      const value = (amountMinor / 100).toFixed(2);
      const yookassaIdempotenceKey = toYookassaIdempotenceKey(idempotencyKey);
      const paymentMetadata = { ...metadata, idempotencyKey, payerRef, purpose, subjectRef };
      if (receipt) assertReceiptMatchesOperation(receipt, amountMinor, currency);

      if (invoice) {
        const body = await fetchWithTimeout(
          'https://api.yookassa.ru/v3/invoices',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: basicAuth(shopId, secretKey),
              'Idempotence-Key': yookassaIdempotenceKey,
            },
            body: JSON.stringify({
              payment_data: {
                amount: { value, currency },
                capture: true,
                confirmation: { type: 'redirect', return_url: returnUrl },
                description: invoice.description,
                metadata: paymentMetadata,
                ...(receipt ? { receipt: toYookassaReceipt(receipt, currency) } : {}),
              },
              cart: [{ description: invoice.description, price: { value, currency }, quantity: 1 }],
              delivery_method_data: { type: 'self' },
              expires_at: invoice.expiresAt,
              description: invoice.description,
              metadata: paymentMetadata,
            }),
          },
          { timeoutMs: PAYMENT_PROVIDER_FETCH_TIMEOUT_MS },
          async (res) => {
            if (!res.ok) {
              const text = await res.text().catch(() => '');
              throw new Error(`yookassa_create_invoice_failed:${res.status}:${text.slice(0, 500)}`);
            }
            return (await res.json()) as {
              id?: string;
              delivery_method?: { url?: string };
            };
          },
        );
        const providerIntentRef = String(body.id ?? '');
        const checkoutUrl = body.delivery_method?.url ?? '';
        if (!providerIntentRef || !checkoutUrl) throw new Error('yookassa_missing_invoice_fields');
        return { providerIntentRef, checkoutUrl };
      }

      // К6 — off-session autopay charges a saved method directly: no `confirmation` (there is no
      // payer to redirect) and no repeated `save_payment_method` (the method is already saved).
      const requestBody = paymentMethodId
        ? {
            amount: { value, currency },
            capture: true,
            payment_method_id: paymentMethodId,
            metadata: paymentMetadata,
            ...(receipt ? { receipt: toYookassaReceipt(receipt, currency) } : {}),
          }
        : {
            amount: { value, currency },
            capture: true,
            confirmation: { type: 'redirect', return_url: returnUrl },
            ...(savePaymentMethod ? { save_payment_method: true } : {}),
            metadata: paymentMetadata,
            ...(receipt ? { receipt: toYookassaReceipt(receipt, currency) } : {}),
          };

      const body = await fetchWithTimeout(
        'https://api.yookassa.ru/v3/payments',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: basicAuth(shopId, secretKey),
            'Idempotence-Key': yookassaIdempotenceKey,
          },
          body: JSON.stringify(requestBody),
        },
        { timeoutMs: PAYMENT_PROVIDER_FETCH_TIMEOUT_MS },
        async (res) => {
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            const message = `yookassa_create_failed:${res.status}:${text.slice(0, 200)}`;
            // B0.3 — ЮKassa answers a 4xx (bad params, a reused Idempotence-Key, auth, rate limit)
            // BEFORE any payment object exists — nothing was created, safe to retry under a fresh
            // key. A 5xx/network/timeout is ambiguous (the request may have reached processing) and
            // falls through to the plain `Error` below, which callers must retry under the SAME key.
            if (res.status >= 400 && res.status < 500) {
              throw new PaymentProviderRequestRefusedError(message);
            }
            throw new Error(message);
          }
          return (await res.json()) as {
            id?: string;
            status?: string;
            confirmation?: { confirmation_url?: string };
          };
        },
      );
      const providerIntentRef = String(body.id ?? '');
      if (!providerIntentRef) throw new Error('yookassa_missing_payment_id');
      // К6 — an off-session charge can be declined SYNCHRONOUSLY (e.g. the saved card no longer
      // works): the HTTP call itself still returns `200`, only `status` says so. Surface it as a
      // thrown error, the same shape every other adapter failure already takes, so the renewal
      // tick's existing try/catch marks the invoice `failed` instead of leaving it `draft` forever.
      if (body.status === 'canceled') {
        throw new Error(`yookassa_payment_canceled:${providerIntentRef}`);
      }
      return {
        providerIntentRef,
        checkoutUrl: body.confirmation?.confirmation_url,
      };
    },

    async refund({
      providerIntentRef,
      amountMinor,
      currency,
      idempotencyKey,
      receipt,
      providerConfig,
    }) {
      const { shopId, secretKey } = requireYookassaCredentials(providerConfig);
      const value = (amountMinor / 100).toFixed(2);
      const yookassaIdempotenceKey = toYookassaIdempotenceKey(idempotencyKey);
      if (receipt) assertReceiptMatchesOperation(receipt, amountMinor, currency);
      const body = await fetchWithTimeout(
        'https://api.yookassa.ru/v3/refunds',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: basicAuth(shopId, secretKey),
            'Idempotence-Key': yookassaIdempotenceKey,
          },
          body: JSON.stringify({
            payment_id: providerIntentRef,
            amount: { value, currency },
            ...(receipt ? { receipt: toYookassaReceipt(receipt, currency) } : {}),
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
        // К4: a payment created by paying an invoice carries the INVOICE's id here, never its own
        // — that invoice id is what `attachSaasBillingInvoiceProviderIntent` stored as our
        // `providerInvoiceRef` at invoice-creation time, before any payment existed to have an id
        // of its own. Direct payments (createIntent, no invoice involved) have no `invoice_details`
        // and fall back to the payment's own id, unchanged from before.
        intentRef: remote.invoice_details?.id ?? remote.id,
        amountMinor,
        savedPaymentMethodId:
          remote.payment_method?.saved === true && remote.payment_method.id
            ? remote.payment_method.id
            : undefined,
      };
    },

    async listPayments({ periodFromIso, periodToIso, providerConfig }) {
      const { shopId, secretKey } = requireYookassaCredentials(providerConfig);
      const items: {
        providerPaymentRef: string;
        status: string;
        amountMinor: number;
        currency: string;
      }[] = [];
      let cursor: string | undefined;
      let truncated = false;
      for (let page = 0; page < YOOKASSA_LIST_MAX_PAGES; page += 1) {
        const response = await fetchYookassaPaymentsPage(shopId, secretKey, {
          periodFromIso,
          periodToIso,
          cursor,
        });
        for (const item of response.items ?? []) {
          if (!item.id) continue;
          items.push({
            providerPaymentRef: item.id,
            status: item.status ?? 'unknown',
            amountMinor:
              item.amount?.value != null
                ? Math.round(Number.parseFloat(String(item.amount.value)) * 100)
                : 0,
            currency: item.amount?.currency ?? '',
          });
        }
        if (!response.next_cursor) break;
        cursor = response.next_cursor;
        if (page === YOOKASSA_LIST_MAX_PAGES - 1) truncated = true;
      }
      return { items, truncated };
    },
  };
}
