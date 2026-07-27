/** Booking merchant remains org-scoped and may never resolve from SaaS config. */
export type BookingMerchantIdentity = Readonly<{
  kind: "booking_org_merchant";
  organizationId: string;
  settingsKey: "booking_payment_providers";
}>;

/** Platform merchant remains global and may never resolve from org booking config. */
export type SaasMerchantIdentity = Readonly<{
  kind: "saas_global_merchant";
  settingsKey: "saas_billing_payment_provider";
  activation: "active";
}>;

export function bookingMerchantIdentity(organizationId: string): BookingMerchantIdentity {
  return { kind: "booking_org_merchant", organizationId, settingsKey: "booking_payment_providers" };
}

export function saasMerchantIdentity(): SaasMerchantIdentity {
  return { kind: "saas_global_merchant", settingsKey: "saas_billing_payment_provider", activation: "active" };
}
