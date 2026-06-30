import type { PaymentProviderPort } from "@/modules/payments/providerPort";
import { createMockPaymentProvider } from "./mockPaymentProvider";
import { createYookassaPaymentProvider } from "./yookassaPaymentProvider";
import { createTinkoffPaymentProvider } from "./tinkoffPaymentProvider";
import { createCloudpaymentsPaymentProvider } from "./cloudpaymentsPaymentProvider";
import { createAlfabankPaymentProvider } from "./alfabankPaymentProvider";

const adapters = new Map<string, PaymentProviderPort>();

/**
 * Resolve a PaymentProviderPort adapter by provider ID.
 *
 * Supported provider IDs:
 *   - "mock"           — in-memory test adapter
 *   - "yookassa"       — ЮKassa (YooKassa)
 *   - "tinkoff"        — Тинькофф Касса
 *   - "cloudpayments"  — CloudPayments
 *   - "alfabank"       — Альфа-Банк Acquiring
 */
export function getPaymentProviderAdapter(providerId: string): PaymentProviderPort {
  const id = providerId.trim();
  let adapter = adapters.get(id);
  if (!adapter) {
    switch (id) {
      case "mock":
        adapter = createMockPaymentProvider();
        break;
      case "yookassa":
        adapter = createYookassaPaymentProvider();
        break;
      case "tinkoff":
        adapter = createTinkoffPaymentProvider();
        break;
      case "cloudpayments":
        adapter = createCloudpaymentsPaymentProvider();
        break;
      case "alfabank":
        adapter = createAlfabankPaymentProvider();
        break;
      default:
        throw new Error(`unsupported_payment_provider:${id}`);
    }
    adapters.set(id, adapter);
  }
  return adapter;
}
