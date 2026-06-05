import type { ClientIdentity } from "./ports";

/** Delivery context for channel cards from canonical client identity. */
export function clientChannelDeliveryContext(
  identity: Pick<ClientIdentity, "phone" | "emailVerifiedAt">,
): { phone: string | null; emailVerified: boolean } {
  return {
    phone: identity.phone,
    emailVerified: Boolean(identity.emailVerifiedAt),
  };
}
