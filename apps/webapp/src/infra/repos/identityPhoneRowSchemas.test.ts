import { describe, expect, it } from "vitest";
import {
  bindingsFromRows,
  mapPhoneMessengerBindSecretRow,
  parseChannelContext,
  parseMessengerIdentityResolutionHints,
  parseUserRole,
  parseIdentityRow,
  platformUserSessionRowSchema,
} from "./identityPhoneRowSchemas";

describe("identityPhoneRowSchemas", () => {
  it("parseUserRole accepts known roles", () => {
    expect(parseUserRole("client", "test")).toBe("client");
    expect(parseUserRole("doctor", "test")).toBe("doctor");
  });

  it("parseUserRole rejects invalid role", () => {
    expect(() => parseUserRole("guest", "test")).toThrow(/invalid row shape/);
  });

  it("parseIdentityRow rejects malformed session row", () => {
    expect(() => parseIdentityRow(platformUserSessionRowSchema, { id: 1 }, "session")).toThrow(
      /invalid row shape/,
    );
  });

  it("bindingsFromRows maps channel codes to binding keys", () => {
    expect(
      bindingsFromRows([
        { channel_code: "telegram", external_id: "1" },
        { channel_code: "max", external_id: "2" },
        { channel_code: "vk", external_id: "3" },
      ]),
    ).toEqual({
      telegramId: "1",
      maxId: "2",
      vkId: "3",
    });
  });

  it("mapPhoneMessengerBindSecretRow normalizes Date fields to ISO strings", () => {
    const row = mapPhoneMessengerBindSecretRow({
      id: "sec-1",
      phone_normalized: "+79991234567",
      channel_code: "telegram",
      purpose: "login",
      user_id: null,
      status: "pending_contact",
      challenge_id: null,
      failure_code: null,
      expires_at: new Date("2026-06-06T12:00:00.000Z"),
      consumed_at: null,
    });
    expect(row.expires_at).toBe("2026-06-06T12:00:00.000Z");
    expect(row.consumed_at).toBeNull();
  });

  it("mapPhoneMessengerBindSecretRow rejects invalid channel_code", () => {
    expect(() =>
      mapPhoneMessengerBindSecretRow({
        id: "sec-1",
        phone_normalized: "+79991234567",
        channel_code: "vk",
        purpose: "login",
        user_id: null,
        status: "pending_contact",
        challenge_id: null,
        failure_code: null,
        expires_at: "2026-06-06T12:00:00.000Z",
        consumed_at: null,
      }),
    ).toThrow(/invalid row shape/);
  });

  it("parseChannelContext accepts web channel", () => {
    expect(parseChannelContext({ channel: "web", chatId: "device-1" })).toEqual({
      channel: "web",
      chatId: "device-1",
    });
  });

  it("parseMessengerIdentityResolutionHints trims optional fields", () => {
    expect(
      parseMessengerIdentityResolutionHints({
        phoneNormalized: "  +79990000000 ",
        integratorUserId: "  int-1 ",
      }),
    ).toEqual({
      phoneNormalized: "+79990000000",
      integratorUserId: "int-1",
    });
  });
});
