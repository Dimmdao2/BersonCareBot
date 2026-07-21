import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
import { runInDrizzleMutationTransaction } from "@/infra/db/drizzleMutationTx";
import type { PaymentCaptureUnitOfWork } from "@/modules/payments/ports";

/**
 * One database transaction for the durable payment-capture consequences.
 * Provider verification and post-commit delivery stay outside this boundary.
 */
export function createPgPaymentCaptureUnitOfWork(): PaymentCaptureUnitOfWork {
  return {
    run(organizationId, fn) {
      return runWithDbOrganizationPrincipal(organizationId, () => runInDrizzleMutationTransaction(fn));
    },
  };
}
