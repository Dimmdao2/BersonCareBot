import { describe, expect, it } from "vitest";
import { hasStoredWebPushVapidPrivate, parseWebPushVapidPatchValue } from "./webPushVapidPatch";

const validPub = "BFxTvL2YjQwZExampleKeyOnlyBase64urlChars09_-";
const validPriv = "AbCdEfGh0123456789IjKlMnOpQrStUvWxYz-_";

describe("parseWebPushVapidPatchValue", () => {
  it("rejects empty public key", () => {
    expect(parseWebPushVapidPatchValue({ value: { publicKey: "", privateKey: validPriv } }, { hasExistingPrivate: false })).toEqual({
      ok: false,
    });
  });

  it("rejects non-base64url public key", () => {
    expect(
      parseWebPushVapidPatchValue({ value: { publicKey: "has space", privateKey: validPriv } }, { hasExistingPrivate: false }),
    ).toEqual({ ok: false });
  });

  it("requires private on first save", () => {
    expect(parseWebPushVapidPatchValue({ value: { publicKey: validPub, privateKey: "" } }, { hasExistingPrivate: false })).toEqual({
      ok: false,
    });
  });

  it("allows empty private when existing private in DB", () => {
    expect(parseWebPushVapidPatchValue({ value: { publicKey: validPub, privateKey: "" } }, { hasExistingPrivate: true })).toEqual({
      ok: true,
      value: { publicKey: validPub, privateKey: "" },
    });
  });

  it("accepts full pair", () => {
    expect(parseWebPushVapidPatchValue({ value: { publicKey: validPub, privateKey: validPriv } }, { hasExistingPrivate: false })).toEqual({
      ok: true,
      value: { publicKey: validPub, privateKey: validPriv },
    });
  });
});

describe("hasStoredWebPushVapidPrivate", () => {
  it("is false for null", () => {
    expect(hasStoredWebPushVapidPrivate(null)).toBe(false);
  });

  it("is true when privateKey non-empty", () => {
    expect(hasStoredWebPushVapidPrivate({ value: { publicKey: "x", privateKey: "y" } })).toBe(true);
  });
});
