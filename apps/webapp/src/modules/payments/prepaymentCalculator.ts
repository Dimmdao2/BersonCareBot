import type { PrepaymentMode, PrepaymentPolicyRecord, PrepaymentQuote } from "./types";

export function computePrepaymentAmount(params: {
  mode: PrepaymentMode;
  amountMinor: number | null;
  percentBps: number | null;
  servicePriceMinor: number | null;
}): number {
  const price = params.servicePriceMinor ?? 0;
  switch (params.mode) {
    case "disabled":
      return 0;
    case "fixed_minor":
      return Math.max(0, params.amountMinor ?? 0);
    case "percent": {
      const bps = params.percentBps ?? 0;
      return Math.max(0, Math.round((price * bps) / 10_000));
    }
    case "full_price":
      return Math.max(0, price);
    default:
      return 0;
  }
}

export function quotePrepayment(params: {
  policy: PrepaymentPolicyRecord | null;
  servicePriceMinor: number | null;
  currency: string;
  paymentsGloballyEnabled: boolean;
}): PrepaymentQuote {
  const currency = params.currency || "RUB";
  if (!params.paymentsGloballyEnabled || !params.policy || !params.policy.isActive) {
    return { required: false, amountMinor: 0, currency, mode: "disabled" };
  }
  const amountMinor = computePrepaymentAmount({
    mode: params.policy.mode,
    amountMinor: params.policy.amountMinor,
    percentBps: params.policy.percentBps,
    servicePriceMinor: params.servicePriceMinor,
  });
  if (amountMinor <= 0 || params.policy.mode === "disabled") {
    return { required: false, amountMinor: 0, currency, mode: params.policy.mode };
  }
  return {
    required: true,
    amountMinor,
    currency,
    mode: params.policy.mode,
  };
}
