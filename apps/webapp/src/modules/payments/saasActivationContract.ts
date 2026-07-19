/**
 * S4-0's dormant hand-off to SaaS billing. This does not create a subscription
 * or grant; it makes the future activation preconditions explicit so a raw or
 * merely well-shaped callback can never be treated as payment confirmation.
 */
export type FutureSaasPaymentConfirmation = Readonly<{
  signatureVerified: boolean;
  statusVerified: boolean;
  amountMatches: boolean;
  currencyMatches: boolean;
  eventType: string;
}>;

export function mayActivateFutureSaasAccess(event: FutureSaasPaymentConfirmation): boolean {
  return (
    event.signatureVerified &&
    event.statusVerified &&
    event.amountMatches &&
    event.currencyMatches &&
    event.eventType === "payment.succeeded"
  );
}
