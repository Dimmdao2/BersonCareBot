import { beforeEach, describe, expect, it } from "vitest";
import { createOrganizationInvitesService } from "@/modules/organization-invites/service";
import {
  createInMemoryOrganizationInvitesPort,
  resetInMemoryOrganizationInvitesForTests,
} from "./inMemoryOrganizationInvites";

describe("in-memory organization invites", () => {
  beforeEach(() => {
    resetInMemoryOrganizationInvitesForTests();
  });

  it("replaces a pending invite for the same email and rejects its token", async () => {
    const service = createOrganizationInvitesService({
      invitesPort: createInMemoryOrganizationInvitesPort(),
    });
    const first = await service.createInvite({
      organizationId: "org-1",
      email: "doctor@example.com",
      role: "doctor",
      createdByPlatformUserId: "owner-1",
    });
    const replacement = await service.createInvite({
      organizationId: "org-1",
      email: "doctor@example.com",
      role: "admin",
      createdByPlatformUserId: "owner-1",
    });

    expect(first).toMatchObject({ ok: true, token: expect.any(String) });
    expect(replacement).toMatchObject({ ok: true, token: expect.any(String) });
    if (!first.ok || !first.token || !replacement.ok || !replacement.token) return;
    await expect(service.lookupPendingByToken(first.token)).resolves.toEqual({
      ok: false,
      code: "reused_token",
    });
    await expect(service.lookupPendingByToken(replacement.token)).resolves.toMatchObject({
      ok: true,
      invite: { invitedRole: "admin" },
    });
  });

  it("is single-use, has no specialist before staff login, and rejects reinviting the member", async () => {
    const service = createOrganizationInvitesService({
      invitesPort: createInMemoryOrganizationInvitesPort(),
    });
    const created = await service.createInvite({
      organizationId: "org-1",
      email: "existing@example.com",
      role: "doctor",
      createdByPlatformUserId: "owner-1",
    });
    if (!created.ok || !created.token) throw new Error("invite_create_failed");

    await expect(service.acceptInvite({
      token: created.token,
      platformUserId: "existing-platform-user",
      expectedEmail: "existing@example.com",
    })).resolves.toMatchObject({
      ok: true,
      platformUserId: "existing-platform-user",
      specialistId: null,
      role: "doctor",
    });
    await expect(service.acceptInvite({
      token: created.token,
      platformUserId: "existing-platform-user",
      expectedEmail: "existing@example.com",
    })).resolves.toEqual({ ok: false, code: "reused_token" });
    await expect(service.createInvite({
      organizationId: "org-1",
      email: "existing@example.com",
      role: "doctor",
      createdByPlatformUserId: "owner-1",
    })).resolves.toEqual({ ok: false, code: "already_member" });
  });

  it("allows a revoked email to be invited again", async () => {
    const port = createInMemoryOrganizationInvitesPort();
    const service = createOrganizationInvitesService({ invitesPort: port });
    const created = await service.createInvite({
      organizationId: "org-1",
      email: "reinvite@example.com",
      role: "admin",
      createdByPlatformUserId: "owner-1",
    });
    if (!created.ok) throw new Error("invite_create_failed");

    await expect(service.revokeInvite({ organizationId: "org-1", inviteId: created.invite.id })).resolves.toBe(true);
    await expect(service.createInvite({
      organizationId: "org-1",
      email: "reinvite@example.com",
      role: "admin",
      createdByPlatformUserId: "owner-1",
    })).resolves.toMatchObject({ ok: true, token: expect.any(String) });
  });
});
