/**
 * H-4 (#818): five `mock-complete` routes let a caller mark a payment intent as captured with no
 * provider verification at all — they exist purely so booking/membership/product-purchase flows
 * can be exercised without a bank in development and in automated tests. Owner ruling 2026-07-26
 * ("да"): keep them for dev/test, make them unreachable everywhere else, including the frozen
 * production server.
 *
 * Fail-closed by construction: this is an ALLOWLIST of the two runtimes that are meant to see the
 * mock path (`development`, and the automated-test runtime). Any other value of `NODE_ENV` —
 * `production`, or anything not on the allowlist — disables it. There is no separate opt-in flag
 * to leave unset-and-therefore-on; the only inputs are the runtime classification the app already
 * computes at startup (`config/env.ts`'s `NODE_ENV` and `isTestEnv`).
 */
export type MockPaymentConfirmConfiguration = {
  nodeEnv: "development" | "test" | "production";
  isTestEnv: boolean;
};

export function isMockPaymentConfirmEnabled(input: MockPaymentConfirmConfiguration): boolean {
  return input.nodeEnv === "development" || input.isTestEnv;
}
