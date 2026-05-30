import { describe, expect, it, vi } from "vitest";
import {
  toDoctorSupplementaryContacts,
  upsertBookingFormContactsBestEffort,
} from "./bookingContactUpsert";
import type { PlatformUserContactRecord } from "./ports";
import type { PlatformUserContactsService } from "./service";

describe("upsertBookingFormContactsBestEffort", () => {
  it("upserts valid phone and email with booking source", async () => {
    const upsert = vi.fn();
    const service = { upsert } as unknown as PlatformUserContactsService;
    await upsertBookingFormContactsBestEffort(service, {
      platformUserId: "u1",
      contactPhone: "8 900 111-22-33",
      contactEmail: "User@Example.com",
    });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith({
      platformUserId: "u1",
      contactType: "phone",
      value: "8 900 111-22-33",
      source: "booking",
    });
    expect(upsert).toHaveBeenCalledWith({
      platformUserId: "u1",
      contactType: "email",
      value: "User@Example.com",
      source: "booking",
    });
  });

  it("does not throw when service is missing or upsert fails", async () => {
    await expect(
      upsertBookingFormContactsBestEffort(undefined, {
        platformUserId: "u1",
        contactPhone: "+79001112233",
      }),
    ).resolves.toBeUndefined();

    const upsert = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(
      upsertBookingFormContactsBestEffort({ upsert } as unknown as PlatformUserContactsService, {
        platformUserId: "u1",
        contactPhone: "+79001112233",
      }),
    ).resolves.toBeUndefined();
  });

  it("still upserts email when phone upsert fails", async () => {
    const upsert = vi
      .fn()
      .mockRejectedValueOnce(new Error("phone db down"))
      .mockResolvedValueOnce(undefined);
    const service = { upsert } as unknown as PlatformUserContactsService;

    await upsertBookingFormContactsBestEffort(service, {
      platformUserId: "u1",
      contactPhone: "+79001112233",
      contactEmail: "alt@example.com",
    });

    expect(upsert).toHaveBeenCalledTimes(2);
  });
});

describe("toDoctorSupplementaryContacts", () => {
  const row = (over: Partial<PlatformUserContactRecord>): PlatformUserContactRecord => ({
    id: "c1",
    platformUserId: "u1",
    contactType: "phone",
    value: "+79004445566",
    valueNormalized: "+79004445566",
    source: "booking",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  });

  it("hides contacts that duplicate identity phone or email", () => {
    const list = toDoctorSupplementaryContacts(
      [
        row({ id: "p1", contactType: "phone", valueNormalized: "+79001112233", value: "+79001112233" }),
        row({ id: "p2", contactType: "phone", valueNormalized: "+79004445566", value: "+79004445566" }),
        row({
          id: "e1",
          contactType: "email",
          value: "keep@example.com",
          valueNormalized: "keep@example.com",
        }),
        row({
          id: "e2",
          contactType: "email",
          value: "alt@example.com",
          valueNormalized: "alt@example.com",
        }),
      ],
      { phone: "+79001112233", email: "keep@example.com" },
    );
    expect(list.map((c) => c.id)).toEqual(["p2", "e2"]);
  });

  it("hides invalid identity email from filter comparison", () => {
    const list = toDoctorSupplementaryContacts(
      [
        row({
          id: "e1",
          contactType: "email",
          value: "alt@example.com",
          valueNormalized: "alt@example.com",
        }),
      ],
      { phone: null, email: "not-an-email" },
    );
    expect(list).toHaveLength(1);
  });
});
