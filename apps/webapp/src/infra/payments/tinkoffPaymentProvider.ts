/**
 * Tinkoff Касса (Т-Банк) payment provider adapter.
 *
 * API docs: https://www.tbank.ru/kassa/dev/payments/
 *
 * Webhook signature: SHA-256 of concatenated sorted param values + TerminalKey/Password.
 * Tinkoff sends webhook notifications with a Token field which equals
 * SHA-256( value1 + value2 + ... ) where values are taken from the sorted JSON
 * (by key, alphabetically) excluding Token itself, plus Password appended as if it
 * were a field named "Password".
 *
 * Auth: Basic (TerminalKey:SecretKey) via ShopId/ApiKey convention.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { PaymentProviderPort } from "@/modules/payments/providerPort";
import type { PaymentProviderConfig } from "@/modules/payments/types";

function requireTinkoffCredentials(config?: PaymentProviderConfig): {
  terminalKey: string;
  password: string;
} {
  // terminalKey can be stored in either terminalKey or shopId (both parsed); password in apiKey.
  const terminalKey = (config?.terminalKey ?? config?.shopId ?? "").trim();
  const password = (config?.apiKey ?? "").trim();
  if (!terminalKey || !password) throw new Error("tinkoff_credentials_missing");
  return { terminalKey, password };
}

/**
 * Compute Tinkoff Token: SHA-256 of sorted (alphabetically by key) param values
 * with Password injected and Token excluded.
 *
 * Algorithm per official docs:
 *  1. Add Password field to the params object.
 *  2. Remove Token field.
 *  3. Sort keys alphabetically.
 *  4. Concatenate values (cast to string).
 *  5. SHA-256 of the concatenated string (hex).
 */
export function computeTinkoffToken(
  params: Record<string, unknown>,
  password: string,
): string {
  const merged: Record<string, unknown> = { ...params, Password: password };
  delete merged["Token"];
  const sorted = Object.keys(merged)
    .sort()
    .map((k) => String(merged[k] ?? ""))
    .join("");
  return createHash("sha256").update(sorted).digest("hex");
}

export function createTinkoffPaymentProvider(): PaymentProviderPort {
  return {
    async createIntent({
      amountMinor,
      currency,
      idempotencyKey,
      metadata,
      providerConfig,
    }) {
      const { terminalKey, password } = requireTinkoffCredentials(providerConfig);
      const returnUrl =
        typeof metadata.returnUrl === "string" && metadata.returnUrl.trim()
          ? metadata.returnUrl.trim()
          : "https://www.tbank.ru";

      const params: Record<string, unknown> = {
        TerminalKey: terminalKey,
        Amount: amountMinor, // Tinkoff uses kopecks (minor units) — matches our convention
        OrderId: idempotencyKey,
        Description: typeof metadata.description === "string" ? metadata.description : undefined,
        SuccessURL: returnUrl,
        DATA: { idempotencyKey, ...metadata },
      };
      const token = computeTinkoffToken(params, password);

      const res = await fetch("https://securepay.tinkoff.ru/v2/Init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, Token: token }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`tinkoff_create_failed:${res.status}:${text.slice(0, 200)}`);
      }

      const body = (await res.json()) as {
        Success?: boolean;
        PaymentId?: string | number;
        PaymentURL?: string;
        Message?: string;
      };

      if (!body.Success) {
        throw new Error(`tinkoff_create_error:${body.Message ?? "unknown"}`);
      }

      const providerIntentRef = String(body.PaymentId ?? "");
      if (!providerIntentRef) throw new Error("tinkoff_missing_payment_id");

      return {
        providerIntentRef,
        checkoutUrl: body.PaymentURL,
      };
    },

    async refund({
      providerIntentRef,
      amountMinor,
      idempotencyKey,
      providerConfig,
    }) {
      const { terminalKey, password } = requireTinkoffCredentials(providerConfig);

      const params: Record<string, unknown> = {
        TerminalKey: terminalKey,
        PaymentId: providerIntentRef,
        Amount: amountMinor,
      };
      const token = computeTinkoffToken(params, password);

      const res = await fetch("https://securepay.tinkoff.ru/v2/Cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, Token: token }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`tinkoff_refund_failed:${res.status}:${text.slice(0, 200)}`);
      }

      const body = (await res.json()) as {
        Success?: boolean;
        PaymentId?: string | number;
        Message?: string;
      };

      if (!body.Success) {
        throw new Error(`tinkoff_refund_error:${body.Message ?? "unknown"}`);
      }

      return {
        providerRefundRef: `tinkoff_cancel:${String(body.PaymentId ?? providerIntentRef)}:${idempotencyKey}`,
      };
    },

    verifyWebhook({ bodyText, webhookSecret }) {
      // webhookSecret = Tinkoff terminal password (same as apiKey / password used for Token)
      const payload = JSON.parse(bodyText) as Record<string, unknown>;
      const incomingToken = String(payload["Token"] ?? "");
      if (!incomingToken) throw new Error("tinkoff_webhook_missing_token");

      const expectedToken = computeTinkoffToken(payload, webhookSecret);
      const a = Buffer.from(incomingToken.toLowerCase());
      const b = Buffer.from(expectedToken.toLowerCase());
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new Error("invalid_webhook_signature");
      }

      const paymentId = String(payload["PaymentId"] ?? "");
      const orderId = String(payload["OrderId"] ?? "");
      const status = String(payload["Status"] ?? "");
      const amountRaw = payload["Amount"];
      const amountMinor =
        amountRaw != null && !Number.isNaN(Number(amountRaw))
          ? Math.round(Number(amountRaw))
          : undefined;

      // OrderId is our idempotencyKey
      const idempotencyKey = orderId || paymentId;
      const eventType =
        status === "CONFIRMED"
          ? "payment.succeeded"
          : status === "REFUNDED" || status === "PARTIAL_REFUNDED"
            ? "payment.refunded"
            : `tinkoff.${status.toLowerCase()}`;

      return {
        idempotencyKey,
        eventType,
        payload: payload as Record<string, unknown>,
        intentRef: paymentId,
        amountMinor,
      };
    },
  };
}
