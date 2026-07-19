/** Booking merchant remains org-scoped and may never resolve from SaaS config. */
export type BookingMerchantIdentity = Readonly<{
  kind: "booking_org_merchant";
  organizationId: string;
  settingsKey: "booking_payment_providers";
}>;

/** S4-0 declares this only; S4-4 owns its DB setting and activation. */
export type DormantSaasMerchantIdentity = Readonly<{
  kind: "saas_global_merchant";
  settingsKey: "saas_billing_payment_provider";
  activation: "dormant_until_s4_4";
}>;

export function bookingMerchantIdentity(organizationId: string): BookingMerchantIdentity {
  return { kind: "booking_org_merchant", organizationId, settingsKey: "booking_payment_providers" };
}

export function dormantSaasMerchantIdentity(): DormantSaasMerchantIdentity {
  return { kind: "saas_global_merchant", settingsKey: "saas_billing_payment_provider", activation: "dormant_until_s4_4" };
}
