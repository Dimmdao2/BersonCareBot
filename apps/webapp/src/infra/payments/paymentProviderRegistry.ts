import type { PaymentProviderPort } from "@/modules/payments/providerPort";
import { createMockPaymentProvider } from "./mockPaymentProvider";
import { createYookassaPaymentProvider } from "./yookassaPaymentProvider";

const adapters = new Map<string, PaymentProviderPort>();

export function getPaymentProviderAdapter(providerId: string): PaymentProviderPort {
  const id = providerId.trim();
  let adapter = adapters.get(id);
  if (!adapter) {
    if (id === "mock") adapter = createMockPaymentProvider();
    else if (id === "yookassa") adapter = createYookassaPaymentProvider();
    else throw new Error(`unsupported_payment_provider:${id}`);
    adapters.set(id, adapter);
  }
  return adapter;
}
