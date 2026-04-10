import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

const resolveCanonicalUserIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/repos/pgCanonicalPlatformUser", () => ({
  resolveCanonicalUserId: resolveCanonicalUserIdMock,
}));

import { resolvePlatformAccessContext } from "./resolvePlatformAccessContext";

describe("resolvePlatformAccessContext", () => {
  const query = vi.fn();
  const db = { query } as unknown as Pool;

  beforeEach(() => {
    query.mockReset();
    resolveCanonicalUserIdMock.mockReset();
  });

  it("returns guest when no session user id", async () => {
    const ctx = await resolvePlatformAccessContext(db, { sessionUserId: null });
    expect(ctx).toMatchObject({
      canonicalUserId: null,
      dbRole: null,
      tier: "guest",
      resolution: "no_session",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("legacy non-UUID session: onboarding for client hint", async () => {
    const ctx = await resolvePlatformAccessContext(db, {
      sessionUserId: "tg:123",
      sessionRoleHint: "client",
    });
    expect(ctx).toMatchObject({
      canonicalUserId: null,
      dbRole: "client",
      tier: "onboarding",
      resolution: "legacy_non_uuid_session",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("legacy non-UUID session: doctor has no client tier", async () => {
    const ctx = await resolvePlatformAccessContext(db, {
      sessionUserId: "tg:123",
      sessionRoleHint: "doctor",
    });
    expect(ctx.tier).toBeNull();
    expect(ctx.dbRole).toBe("doctor");
  });

  it("resolved client with trusted phone → patient", async () => {
    const uid = "00000000-0000-4000-8000-000000000001";
    resolveCanonicalUserIdMock.mockResolvedValue(uid);
    query.mockResolvedValueOnce({
      rows: [{ role: "client", phone_normalized: "+79990000001", patient_phone_trust_at: new Date() }],
    });
    const ctx = await resolvePlatformAccessContext(db, { sessionUserId: uid });
    expect(ctx).toMatchObject({
      canonicalUserId: uid,
      dbRole: "client",
      tier: "patient",
      hasPhoneInDb: true,
      phoneTrustedForPatient: true,
      resolution: "resolved_canon",
    });
  });

  it("resolved client with phone but no trust → onboarding", async () => {
    const uid = "00000000-0000-4000-8000-000000000002";
    resolveCanonicalUserIdMock.mockResolvedValue(uid);
    query.mockResolvedValueOnce({
      rows: [{ role: "client", phone_normalized: "+79990000002", patient_phone_trust_at: null }],
    });
    const ctx = await resolvePlatformAccessContext(db, { sessionUserId: uid });
    expect(ctx.tier).toBe("onboarding");
    expect(ctx.phoneTrustedForPatient).toBe(false);
    expect(ctx.hasPhoneInDb).toBe(true);
  });

  it("resolved client without phone → onboarding", async () => {
    const uid = "00000000-0000-4000-8000-000000000003";
    resolveCanonicalUserIdMock.mockResolvedValue(uid);
    query.mockResolvedValueOnce({
      rows: [{ role: "client", phone_normalized: null, patient_phone_trust_at: null }],
    });
    const ctx = await resolvePlatformAccessContext(db, { sessionUserId: uid });
    expect(ctx.tier).toBe("onboarding");
    expect(ctx.hasPhoneInDb).toBe(false);
  });

  it("resolved doctor: tier N/A", async () => {
    const uid = "00000000-0000-4000-8000-000000000004";
    resolveCanonicalUserIdMock.mockResolvedValue(uid);
    query.mockResolvedValueOnce({
      rows: [{ role: "doctor", phone_normalized: "+79990000003", patient_phone_trust_at: new Date() }],
    });
    const ctx = await resolvePlatformAccessContext(db, { sessionUserId: uid });
    expect(ctx.dbRole).toBe("doctor");
    expect(ctx.tier).toBeNull();
    expect(ctx.phoneTrustedForPatient).toBe(false);
  });

  it("missing platform_users row → guest", async () => {
    const uid = "00000000-0000-4000-8000-000000000005";
    resolveCanonicalUserIdMock.mockResolvedValue(uid);
    query.mockResolvedValueOnce({ rows: [] });
    const ctx = await resolvePlatformAccessContext(db, { sessionUserId: uid });
    expect(ctx).toMatchObject({
      canonicalUserId: null,
      tier: "guest",
      resolution: "session_user_missing",
    });
  });
});
