/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const resolveCanonicalUserIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({ query: queryMock }),
}));

vi.mock("@/infra/repos/pgCanonicalPlatformUser", () => ({
  resolveCanonicalUserId: (...args: unknown[]) => resolveCanonicalUserIdMock(...args),
}));

import { pgPlatformAccessPort } from "./pgPlatformAccess";

describe("pgPlatformAccessPort", () => {
  beforeEach(() => {
    queryMock.mockReset();
    resolveCanonicalUserIdMock.mockReset();
  });

  it("delegates canonical user resolution to canonical platform repo", async () => {
    resolveCanonicalUserIdMock.mockResolvedValueOnce("canon-1");

    await expect(pgPlatformAccessPort.resolveCanonicalUserId("user-1")).resolves.toBe("canon-1");

    expect(resolveCanonicalUserIdMock).toHaveBeenCalledWith(expect.anything(), "user-1");
  });

  it("loads platform access canon row", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ role: "client", phone_normalized: "+79990000000" }],
    });

    await expect(pgPlatformAccessPort.loadCanonRow("00000000-0000-4000-8000-000000000001")).resolves.toEqual({
      role: "client",
      phone_normalized: "+79990000000",
    });

    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("FROM platform_users pu");
    expect(sql).toContain("has_password_credentials");
    expect(sql).toContain("has_web_oauth_binding");
    expect(params).toEqual(["00000000-0000-4000-8000-000000000001"]);
  });
});
