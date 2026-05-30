import { describe, expect, it, beforeEach } from "vitest";
import {
  createInMemoryPlatformUserContactsPort,
  resetInMemoryPlatformUserContactsForTests,
} from "@/infra/repos/inMemoryPlatformUserContacts";
import { createPlatformUserContactsService } from "./service";

const USER = "00000000-0000-4000-8000-000000000001";

describe("createPlatformUserContactsService", () => {
  beforeEach(() => {
    resetInMemoryPlatformUserContactsForTests();
  });

  it("upserts and lists contacts for platform user", async () => {
    const svc = createPlatformUserContactsService(createInMemoryPlatformUserContactsPort());
    const row = await svc.upsert({
      platformUserId: USER,
      contactType: "phone",
      value: "8 900 111-22-33",
      source: "doctor",
    });
    expect(row.valueNormalized).toBe("+79001112233");
    expect(row.source).toBe("doctor");

    await svc.upsert({
      platformUserId: USER,
      contactType: "phone",
      value: "+7 900 111-22-33",
      source: "booking",
    });
    const list = await svc.listForPlatformUser(USER);
    expect(list).toHaveLength(1);
    expect(list[0]?.source).toBe("booking");
  });

  it("keeps distinct contact types with same normalized phone", async () => {
    const svc = createPlatformUserContactsService(createInMemoryPlatformUserContactsPort());
    await svc.upsert({
      platformUserId: USER,
      contactType: "phone",
      value: "+79001112233",
      source: "doctor",
    });
    await svc.upsert({
      platformUserId: USER,
      contactType: "whatsapp",
      value: "+79001112233",
      source: "booking",
    });
    expect(await svc.listForPlatformUser(USER)).toHaveLength(2);
  });

  it("rejects empty value", async () => {
    const svc = createPlatformUserContactsService(createInMemoryPlatformUserContactsPort());
    await expect(
      svc.upsert({ platformUserId: USER, contactType: "email", value: "  ", source: "admin" }),
    ).rejects.toMatchObject({ code: "empty_value" });
  });

  it("rejects invalid phone value", async () => {
    const svc = createPlatformUserContactsService(createInMemoryPlatformUserContactsPort());
    await expect(
      svc.upsert({ platformUserId: USER, contactType: "phone", value: "abc", source: "doctor" }),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });

  it("deletes contact scoped to platform user", async () => {
    const port = createInMemoryPlatformUserContactsPort();
    const svc = createPlatformUserContactsService(port);
    const row = await svc.upsert({
      platformUserId: USER,
      contactType: "email",
      value: "a@b.co",
      source: "merge",
    });
    expect(await svc.deleteContact({ id: row.id, platformUserId: USER })).toBe(true);
    expect(await svc.listForPlatformUser(USER)).toHaveLength(0);
  });
});
