import { describe, expect, it } from "vitest";
import { projectBookingPaymentPublicConfig } from "./bookingPaymentSettings";
import type { BookingPaymentSettings } from "./types";

describe("projectBookingPaymentPublicConfig", () => {
  it("omits every credential-shaped provider field", () => {
    const unsafeSettings = {
      enabled: true,
      defaultProviderId: "provider",
      providers: [{
        id: "provider",
        label: "Provider",
        enabled: true,
        privateKey: "private",
        password: "password",
        apiKey: "api",
        webhookSecret: "webhook",
        refreshToken: "refresh",
      }],
    } as unknown as BookingPaymentSettings;
    const projected = projectBookingPaymentPublicConfig(unsafeSettings);
    const serialized = JSON.stringify(projected);
    for (const secretField of ["privateKey", "password", "apiKey", "webhookSecret", "refreshToken"]) {
      expect(serialized).not.toContain(secretField);
    }
  });
});
