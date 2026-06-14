/**
 * CloudPayments payment provider adapter.
 *
 * API docs: https://developers.cloudpayments.ru/
 *
 * Auth: HTTP Basic — Public ID as username, API Secret as password.
 * Webhook verification: HMAC-SHA256 of the raw request body with API Secret as key,
 *   the result is base64-encoded. Provider sends the signature in the
 *   `Content-HMAC` header.
 *
 * Create payment: POST /payments/charge (one-step) or POST /payments/auth + /payments/confirm
 *   (two-step). We use the "token" (crypto-pack) URL flow: CloudPayments Widget creates a
 *   cryptogram, but for redirect flow we use /payments/charge with Type=Widget redirect
 *   — or more commonly the hosted form via CheckoutURL (3DS/card form).
 *
 * For server-initiated flow the endpoint is POST /payments/charge.
 * For redirect (user-facing checkout), CloudPayments provides a widget JS embed or
 * a "Pay by link" approach. We expose the `checkoutUrl` from Pay by Link endpoint.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProviderPort } from "@/modules/payments/providerPort";
import type { PaymentProviderConfig } from "@/modules/payments/types";

const CLOUDPAYMENTS_API_BASE = "https://api.cloudpayments.ru";

function requireCloudpaymentsCredentials(config?: PaymentProviderConfig): {
  publicId: string;
  apiSecret: string;
} {
  // publicId can be stored in publicId or shopId; apiSecret in apiKey.
  const publicId = (config?.publicId ?? config?.shopId ?? "").trim();
  const apiSecret = (config?.apiKey ?? "").trim();
  if (!publicId || !apiSecret) throw new Error("cloudpayments_credentials_missing");
  return { publicId, apiSecret };
}

function basicAuth(publicId: string, apiSecret: string): string {
  return `Basic ${Buffer.from(`${publicId}:${apiSecret}`).toString("base64")}`;
}

/**
 * Compute CloudPayments HMAC-SHA256 signature over the raw body text.
 * The result is base64-encoded.
 * Provider sends it in the `Content-HMAC` header.
 */
export function computeCloudPaymentsHmac(body: string, apiSecret: string): string {
  return createHmac("sha256", apiSecret).update(body).digest("base64");
}

export function createCloudpaymentsPaymentProvider(): PaymentProviderPort {
  return {
    async createIntent({
      amountMinor,
      currency,
      idempotencyKey,
      metadata,
      providerConfig,
    }) {
      const { publicId, apiSecret } = requireCloudpaymentsCredentials(providerConfig);
      const amount = amountMinor / 100; // CloudPayments uses rubles (float string)

      const returnUrl =
        typeof metadata.returnUrl === "string" && metadata.returnUrl.trim()
          ? metadata.returnUrl.trim()
          : "https://cloudpayments.ru";

      // Create a pay-by-link order via CloudPayments Orders API
      const body: Record<string, unknown> = {
        Amount: amount,
        Currency: currency || "RUB",
        Description: typeof metadata.description === "string" ? metadata.description : idempotencyKey,
        Email: typeof metadata.email === "string" ? metadata.email : undefined,
        RequireConfirmation: false,
        SendEmail: false,
        InvoiceId: idempotencyKey,
        AccountId: typeof metadata.patientUserId === "string" ? metadata.patientUserId : undefined,
        SuccessRedirectUrl: returnUrl,
        JsonData: { idempotencyKey, ...metadata },
      };

      const res = await fetch(`${CLOUDPAYMENTS_API_BASE}/orders/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: basicAuth(publicId, apiSecret),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`cloudpayments_create_failed:${res.status}:${text.slice(0, 200)}`);
      }

      const json = (await res.json()) as {
        Success?: boolean;
        Message?: string | null;
        Model?: {
          Id?: string;
          Number?: string;
          Url?: string;
        };
      };

      if (!json.Success) {
        throw new Error(`cloudpayments_create_error:${json.Message ?? "unknown"}`);
      }

      const providerIntentRef = json.Model?.Id ?? json.Model?.Number ?? "";
      if (!providerIntentRef) throw new Error("cloudpayments_missing_order_id");

      return {
        providerIntentRef,
        checkoutUrl: json.Model?.Url,
      };
    },

    async refund({
      providerIntentRef,
      amountMinor,
      idempotencyKey,
      providerConfig,
    }) {
      const { publicId, apiSecret } = requireCloudpaymentsCredentials(providerConfig);
      const amount = amountMinor / 100;

      const res = await fetch(`${CLOUDPAYMENTS_API_BASE}/payments/refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: basicAuth(publicId, apiSecret),
        },
        body: JSON.stringify({
          TransactionId: providerIntentRef,
          Amount: amount,
          JsonData: { idempotencyKey },
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`cloudpayments_refund_failed:${res.status}:${text.slice(0, 200)}`);
      }

      const json = (await res.json()) as {
        Success?: boolean;
        Message?: string | null;
        Model?: { TransactionId?: number };
      };

      if (!json.Success) {
        throw new Error(`cloudpayments_refund_error:${json.Message ?? "unknown"}`);
      }

      return {
        providerRefundRef: String(json.Model?.TransactionId ?? idempotencyKey),
      };
    },

    verifyWebhook({ headers, bodyText, webhookSecret }) {
      // webhookSecret = CloudPayments API Secret
      const signatureHeader = headers.get("content-hmac")?.trim() ?? "";
      if (!signatureHeader) throw new Error("cloudpayments_webhook_missing_hmac");

      const expectedHmac = computeCloudPaymentsHmac(bodyText, webhookSecret);
      const a = Buffer.from(signatureHeader);
      const b = Buffer.from(expectedHmac);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new Error("invalid_webhook_signature");
      }

      // CloudPayments POSTs form-encoded data, but if bodyText is JSON, handle both.
      let payload: Record<string, unknown>;
      const contentType = headers.get("content-type") ?? "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams(bodyText);
        payload = Object.fromEntries(params.entries());
      } else {
        payload = JSON.parse(bodyText) as Record<string, unknown>;
      }

      const transactionId = String(payload["TransactionId"] ?? "");
      const invoiceId = String(payload["InvoiceId"] ?? "");
      const statusCode = Number(payload["Status"] ?? payload["StatusCode"] ?? 0);
      const amountRaw = payload["Amount"] ?? payload["PaymentAmount"];
      const amountMinor =
        amountRaw != null && !Number.isNaN(Number(amountRaw))
          ? Math.round(Number(amountRaw) * 100)
          : undefined;

      // InvoiceId is our idempotencyKey; StatusCode 3 = Completed/Succeeded
      const idempotencyKey = invoiceId || transactionId;
      // CloudPayments status codes: 3 = Completed, 4 = Cancelled
      const eventType =
        statusCode === 3 || payload["Status"] === "Completed"
          ? "payment.succeeded"
          : statusCode === 4 || payload["Status"] === "Cancelled"
            ? "payment.refunded"
            : `cloudpayments.${String(payload["Status"] ?? "unknown").toLowerCase()}`;

      return {
        idempotencyKey,
        eventType,
        payload,
        intentRef: transactionId,
        amountMinor,
      };
    },
  };
}
