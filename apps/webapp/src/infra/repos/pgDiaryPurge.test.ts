/** @vitest-environment node */

import { describe, expect, it, vi, beforeEach } from "vitest";

const { withUserLifecycleLock } = vi.hoisted(() => ({
  withUserLifecycleLock: vi.fn(),
}));

vi.mock("@/infra/userLifecycleLock", () => ({
  withUserLifecycleLock,
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({}),
}));

import { purgeAllDiaryDataForUserPg } from "@/infra/repos/pgDiaryPurge";

describe("purgeAllDiaryDataForUserPg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withUserLifecycleLock.mockImplementation(
      async (_pool: unknown, _userId: string, mode: string, fn: (c: unknown) => Promise<void>) => {
        expect(mode).toBe("exclusive");
        const client = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
        await fn(client);
      },
    );
  });

  it("runs purge under exclusive user lifecycle lock", async () => {
    const userId = "00000000-0000-4000-8000-000000000099";
    await purgeAllDiaryDataForUserPg(userId);

    expect(withUserLifecycleLock).toHaveBeenCalledWith(expect.anything(), userId, "exclusive", expect.any(Function));
  });
});
