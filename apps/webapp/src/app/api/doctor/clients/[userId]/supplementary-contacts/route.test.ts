import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformUserContactValidationError } from "@/modules/platform-user-contacts/types";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

const uid = "a0000000-0000-4000-8000-000000000001";
const contactId = "b0000000-0000-4000-8000-000000000002";

describe("doctor supplementary-contacts routes", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getClientIdentity: vi.fn().mockResolvedValue({
          userId: uid,
          phone: "+79001112233",
          email: "identity@example.com",
        }),
      },
      platformUserContacts: {
        listForPlatformUser: vi.fn().mockResolvedValue([
          {
            id: contactId,
            platformUserId: uid,
            contactType: "phone",
            value: "+79004445566",
            valueNormalized: "+79004445566",
            source: "doctor",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "c2",
            platformUserId: uid,
            contactType: "phone",
            value: "+79001112233",
            valueNormalized: "+79001112233",
            source: "booking",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ]),
        upsertIfNotIdentityDuplicate: vi.fn().mockResolvedValue({
          id: "c3",
          contactType: "email",
          value: "alt@example.com",
          source: "doctor",
        }),
        deleteContact: vi.fn().mockResolvedValue(true),
        deleteStaffManagedContact: vi.fn().mockResolvedValue(true),
      },
    });
  });

  it("GET returns contacts without identity duplicates", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ userId: uid }) });
    const json = (await res.json()) as { ok?: boolean; contacts?: { id: string }[] };
    expect(res.status).toBe(200);
    expect(json.contacts?.map((c) => c.id)).toEqual([contactId]);
  });

  it("POST rejects identity duplicate", async () => {
    const deps = buildAppDepsMock();
    deps.platformUserContacts.upsertIfNotIdentityDuplicate.mockRejectedValue(
      new PlatformUserContactValidationError("matches_identity"),
    );
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactType: "phone", value: "+79001112233" }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(400);
    expect(json.error).toBe("matches_identity");
  });

  it("DELETE removes contact", async () => {
    const { DELETE } = await import("./[contactId]/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ userId: uid, contactId }),
    });
    const json = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(buildAppDepsMock().platformUserContacts.deleteStaffManagedContact).toHaveBeenCalled();
  });

  it("DELETE rejects auto-saved contacts", async () => {
    const deps = buildAppDepsMock();
    deps.platformUserContacts.deleteStaffManagedContact.mockRejectedValue(
      new PlatformUserContactValidationError("delete_not_allowed"),
    );
    const { DELETE } = await import("./[contactId]/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ userId: uid, contactId }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(403);
    expect(json.error).toBe("delete_not_allowed");
  });
});
