import { describe, expect, it, vi, beforeEach } from "vitest";
import { pgOAuthUserResolvePort } from "@/infra/repos/pgOAuthUserResolve";

const runWebappPgTextMock = vi.fn();
const findCanonicalUserIdByPhoneMock = vi.fn();
const resolveCanonicalUserIdMock = vi.fn();

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({}),
}));

vi.mock("@/infra/repos/pgCanonicalPlatformUser", () => ({
  findCanonicalUserIdByPhone: (...args: unknown[]) => findCanonicalUserIdByPhoneMock(...args),
  resolveCanonicalUserId: (...args: unknown[]) => resolveCanonicalUserIdMock(...args),
}));

describe("pgOAuthUserResolvePort", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    findCanonicalUserIdByPhoneMock.mockReset();
    resolveCanonicalUserIdMock.mockReset();
  });

  it("findUserIdsByVerifiedEmail returns ids from SELECT", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "u1" }, { id: "u2" }] });
    const ids = await pgOAuthUserResolvePort.findUserIdsByVerifiedEmail("a@example.com");
    expect(ids).toEqual(["u1", "u2"]);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("email_verified_at IS NOT NULL");
  });

  it("upsertOAuthBinding returns existing owner on conflict", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ user_id: "owner-1" }] });

    const result = await pgOAuthUserResolvePort.upsertOAuthBinding({
      userId: "u-new",
      provider: "google",
      providerUserId: "sub-1",
      emailRaw: "a@gmail.com",
    });

    expect(result).toEqual({ inserted: false, existingOwnerUserId: "owner-1" });
  });
});
