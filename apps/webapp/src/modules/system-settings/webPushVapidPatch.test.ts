import { createECDH } from "node:crypto";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  decodeWebPushVapidBase64Url,
  hasStoredWebPushVapidPrivate,
  isValidVapidP256PrivateKeyMaterial,
  isValidVapidP256PublicKeyMaterial,
  parseWebPushVapidPatchValue,
} from "./webPushVapidPatch";

function sampleP256KeyPair() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: Buffer.from(ecdh.getPublicKey(undefined, "uncompressed")).toString("base64url"),
    privateKey: Buffer.from(ecdh.getPrivateKey()).toString("base64url"),
  };
}

describe("parseWebPushVapidPatchValue", () => {
  const { publicKey: validPub, privateKey: validPriv } = sampleP256KeyPair();

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

  it("rejects public key with valid alphabet but wrong decoded length", () => {
    const shortPub = Buffer.alloc(10, 1).toString("base64url");
    expect(parseWebPushVapidPatchValue({ value: { publicKey: shortPub, privateKey: validPriv } }, { hasExistingPrivate: false })).toEqual({
      ok: false,
    });
  });

  it("rejects private key with wrong decoded length", () => {
    const badPriv = Buffer.alloc(16, 2).toString("base64url");
    expect(parseWebPushVapidPatchValue({ value: { publicKey: validPub, privateKey: badPriv } }, { hasExistingPrivate: false })).toEqual({
      ok: false,
    });
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

describe("decodeWebPushVapidBase64Url / material validators", () => {
  it("decodes and validates P-256 uncompressed public (65 bytes)", () => {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const raw = Buffer.from(ecdh.getPublicKey(undefined, "uncompressed"));
    const s = raw.toString("base64url");
    const buf = decodeWebPushVapidBase64Url(s);
    expect(buf && isValidVapidP256PublicKeyMaterial(buf)).toBe(true);
  });

  it("validates P-256 private (32 bytes or 31 without leading zero padding)", () => {
    const { privateKey } = sampleP256KeyPair();
    const buf = decodeWebPushVapidBase64Url(privateKey);
    expect(buf).not.toBeNull();
    expect(isValidVapidP256PrivateKeyMaterial(buf!)).toBe(true);
  });

  it("accepts 31-byte private after base64url round-trip", () => {
    const raw31 = Buffer.concat([Buffer.alloc(1, 0), Buffer.alloc(30, 0xab)]);
    const buf = decodeWebPushVapidBase64Url(raw31.toString("base64url"));
    expect(buf?.length).toBe(31);
    expect(isValidVapidP256PrivateKeyMaterial(buf!)).toBe(true);
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
