import { describe, expect, it } from "vitest";
import { countAsOperatorOutgoingDeliveryDead } from "./pgOperatorHealthRead";

describe("pgOperatorHealthRead outgoing delivery dead filter", () => {
  it("excludes recipient_blocked_bot from operator dead totals", () => {
    expect(countAsOperatorOutgoingDeliveryDead(null)).toBe(true);
    expect(countAsOperatorOutgoingDeliveryDead("provider_error")).toBe(true);
    expect(countAsOperatorOutgoingDeliveryDead("recipient_blocked_bot")).toBe(false);
  });
});
