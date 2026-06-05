import { describe, expect, it } from "vitest";
import { clientChannelDeliveryContext } from "./clientChannelDeliveryContext";

describe("clientChannelDeliveryContext", () => {
  it("marks email verified when emailVerifiedAt is set", () => {
    expect(
      clientChannelDeliveryContext({
        phone: "+79001234567",
        emailVerifiedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual({ phone: "+79001234567", emailVerified: true });
  });

  it("marks email not verified when emailVerifiedAt is absent", () => {
    expect(
      clientChannelDeliveryContext({
        phone: "+79001234567",
        emailVerifiedAt: null,
      }),
    ).toEqual({ phone: "+79001234567", emailVerified: false });
  });
});
