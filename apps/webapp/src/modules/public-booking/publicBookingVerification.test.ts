import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumePublicBookingVerification,
  issuePublicBookingVerification,
  PUBLIC_BOOKING_CHALLENGE_TTL_SEC,
} from "./publicBookingVerification";
import {
  channelProvesPhoneControl,
  parsePublicBookingIntent,
  PUBLIC_BOOKING_INTENT_VERSION,
  type PublicBookingIntent,
} from "./publicBookingIntent";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440001";
const SERVICE_ID = "550e8400-e29b-41d4-a716-446655440002";

const intent: PublicBookingIntent = {
  v: PUBLIC_BOOKING_INTENT_VERSION,
  organizationId: ORG_ID,
  branchId: BRANCH_ID,
  serviceId: SERVICE_ID,
  slotStart: "2026-06-01T10:00:00.000Z",
  slotEnd: "2026-06-01T11:00:00.000Z",
  contactName: "Иван",
  contactPhone: "+79001234567",
};

function deps() {
  const store = new Map<string, Record<string, unknown>>();
  return {
    smsPort: {
      sendCode: vi.fn(async () => {
        store.set("chal-1", { phone: "+79001234567", expiresAt: 9e9, deliveryChannel: "sms" });
        return { ok: true as const, challengeId: "chal-1", retryAfterSeconds: 60 };
      }),
      verifyCode: vi.fn(async () => ({ ok: true as const })),
    },
    challengeStore: {
      get: vi.fn(async (id: string) => (store.get(id) ?? null) as never),
      set: vi.fn(async (id: string, payload: Record<string, unknown>) => {
        store.set(id, payload);
      }),
      delete: vi.fn(async (id: string) => {
        store.delete(id);
      }),
    },
    store,
  };
}

describe("public booking verification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delivers the code through the existing phone-OTP port, not a second one-time-code system", async () => {
    const d = deps();

    const issued = await issuePublicBookingVerification(d, intent);

    expect(issued).toMatchObject({ ok: true, challengeId: "chal-1" });
    expect(d.smsPort.sendCode).toHaveBeenCalledWith(
      "+79001234567",
      PUBLIC_BOOKING_CHALLENGE_TTL_SEC,
      { channel: "sms" },
    );
  });

  it("pins the intent onto the challenge and gets it back verbatim", async () => {
    const d = deps();
    await issuePublicBookingVerification(d, intent);

    const consumed = await consumePublicBookingVerification(d, "chal-1", "123456");

    expect(consumed).toMatchObject({ ok: true });
    if (!consumed.ok) throw new Error("unreachable");
    expect(consumed.verified.intent).toEqual(intent);
    expect(consumed.verified.phoneProven).toBe(true);
  });

  it("refuses to normalise an unusable phone before anything is sent", async () => {
    const d = deps();

    const issued = await issuePublicBookingVerification(d, { ...intent, contactPhone: "nope" });

    expect(issued).toEqual({ ok: false, code: "invalid_phone" });
    expect(d.smsPort.sendCode).not.toHaveBeenCalled();
  });

  it("refuses a challenge that carries no booking intent", async () => {
    const d = deps();
    d.store.set("chal-x", { phone: "+79001234567", expiresAt: 9e9, deliveryChannel: "sms" });

    const consumed = await consumePublicBookingVerification(d, "chal-x", "123456");

    expect(consumed).toEqual({ ok: false, code: "verification_failed" });
    expect(d.smsPort.verifyCode).not.toHaveBeenCalled();
  });

  it("spends the challenge on success", async () => {
    const d = deps();
    await issuePublicBookingVerification(d, intent);

    await consumePublicBookingVerification(d, "chal-1", "123456");

    expect(d.challengeStore.delete).toHaveBeenCalledWith("chal-1");
    expect(await consumePublicBookingVerification(d, "chal-1", "123456")).toEqual({
      ok: false,
      code: "verification_failed",
    });
  });
});

describe("what a delivery channel proves", () => {
  it("only SMS proves control of the phone number", () => {
    expect(channelProvesPhoneControl("sms")).toBe(true);
    for (const other of ["email", "telegram", "max", undefined] as const) {
      expect(channelProvesPhoneControl(other)).toBe(false);
    }
  });
});

describe("intent parsing", () => {
  it("accepts a well-formed intent", () => {
    expect(parsePublicBookingIntent(intent)).toEqual(intent);
  });

  it("rejects an intent of an unknown version, so a shape change cannot be replayed", () => {
    expect(parsePublicBookingIntent({ ...intent, v: 99 })).toBeNull();
  });

  it.each([
    ["missing organisation", { ...intent, organizationId: undefined }],
    ["non-uuid branch", { ...intent, branchId: "not-a-uuid" }],
    ["empty contact name", { ...intent, contactName: "" }],
    ["not an object", "chal-1"],
    ["null", null],
  ])("rejects %s", (_label, raw) => {
    expect(parsePublicBookingIntent(raw)).toBeNull();
  });
});
