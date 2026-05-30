import { describe, expect, it } from "vitest";
import { collectMergeLosingContacts } from "@bersoncare/platform-merge";

describe("collectMergeLosingContacts", () => {
  it("manual merge keeps target identity and saves duplicate phone/email as contacts", () => {
    const losing = collectMergeLosingContacts(
      { phone_normalized: "+79001112233", email: "keep@example.com" },
      { phone_normalized: "+79004445566", email: "lose@example.com" },
      {
        targetId: "t",
        duplicateId: "d",
        fields: {
          phone_normalized: "target",
          display_name: "target",
          first_name: "target",
          last_name: "target",
          email: "target",
        },
        bindings: { telegram: "both", max: "both", vk: "both" },
        oauth: {},
        channelPreferences: "merge",
      },
    );
    expect(losing).toEqual([
      { contactType: "phone", value: "+79004445566", valueNormalized: "+79004445566" },
      { contactType: "email", value: "lose@example.com", valueNormalized: "lose@example.com" },
    ]);
  });

  it("auto merge saves duplicate email when target email wins via COALESCE", () => {
    const losing = collectMergeLosingContacts(
      { phone_normalized: "+79001112233", email: "keep@example.com" },
      { phone_normalized: "+79001112233", email: "alt@example.com" },
    );
    expect(losing).toEqual([
      { contactType: "email", value: "alt@example.com", valueNormalized: "alt@example.com" },
    ]);
  });

  it("auto merge saves duplicate email when target has invalid email chosen by SQL COALESCE", () => {
    const losing = collectMergeLosingContacts(
      { phone_normalized: "+79001112233", email: "not-an-email" },
      { phone_normalized: "+79001112233", email: "alt@example.com" },
    );
    expect(losing).toEqual([
      { contactType: "email", value: "alt@example.com", valueNormalized: "alt@example.com" },
    ]);
  });

  it("dedupes identical losing values from both parties", () => {
    const losing = collectMergeLosingContacts(
      { phone_normalized: "+79001112233", email: "a@example.com" },
      { phone_normalized: "+79004445566", email: "b@example.com" },
      {
        targetId: "t",
        duplicateId: "d",
        fields: {
          phone_normalized: "duplicate",
          display_name: "target",
          first_name: "target",
          last_name: "target",
          email: "duplicate",
        },
        bindings: { telegram: "both", max: "both", vk: "both" },
        oauth: {},
        channelPreferences: "merge",
      },
    );
    expect(losing).toEqual([
      { contactType: "phone", value: "+79001112233", valueNormalized: "+79001112233" },
      { contactType: "email", value: "a@example.com", valueNormalized: "a@example.com" },
    ]);
  });

  it("returns empty when both parties share identity fields", () => {
    expect(
      collectMergeLosingContacts(
        { phone_normalized: "+79001112233", email: "same@example.com" },
        { phone_normalized: "+79001112233", email: "same@example.com" },
      ),
    ).toEqual([]);
  });

  it("normalizes non-E164 duplicate phone via shared normalizer", () => {
    const losing = collectMergeLosingContacts(
      { phone_normalized: "+79001112233", email: null },
      { phone_normalized: "89004445566", email: null },
    );
    expect(losing).toEqual([
      { contactType: "phone", value: "+79004445566", valueNormalized: "+79004445566" },
    ]);
  });
});
