/** Wave 3 phase 15E — route tail repos + route thinness checks. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

import {
  findPlatformUserIdWithEmailConflict,
  findPlatformUserIdWithPhoneConflict,
} from "./pgAdminClientProfileConflicts";
import { mediaFolderExists } from "./pgMediaFolderLookup";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../..");

describe("Wave3 phase 15E route tails (runtime constraints)", () => {
  it("pgAdminClientProfileConflicts has no pool.query / client.query", () => {
    const src = readFileSync(join(__dirname, "pgAdminClientProfileConflicts.ts"), "utf8");
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).not.toMatch(/\bclient\.query\b/);
    expect(src).toContain("runWebappPgText");
  });

  it("pgMediaFolderLookup has no pool.query / client.query", () => {
    const src = readFileSync(join(__dirname, "pgMediaFolderLookup.ts"), "utf8");
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).not.toMatch(/\bclient\.query\b/);
    expect(src).toContain("runWebappPgText");
  });

  it("admin profile route has no pool.query / client.query", () => {
    const src = readFileSync(
      join(repoRoot, "app/api/admin/users/[userId]/profile/route.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).not.toMatch(/\bclient\.query\b/);
    expect(src).toContain("findPlatformUserIdWithEmailConflict");
  });

  it("media upload route has no pool.query / client.query", () => {
    const src = readFileSync(join(repoRoot, "app/api/media/upload/route.ts"), "utf8");
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).not.toMatch(/\bclient\.query\b/);
    expect(src).toContain("folderExists");
  });

  it("resolveOrCreateUserByPhone has no pool.query (P12E verify)", () => {
    const src = readFileSync(
      join(repoRoot, "app-layer/platform-user/resolveOrCreateUserByPhone.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).not.toContain("runPgPoolPgText");
    expect(src).toContain("resolveOrCreateTrustedPatientUserByPhone");

    const repoSrc = readFileSync(join(repoRoot, "infra/repos/pgPublicBookingUserResolve.ts"), "utf8");
    expect(repoSrc).toContain("runPgPoolPgText");
  });

  it("recordPublicBookingMergeCandidates has no pool.query (P12E verify)", () => {
    const src = readFileSync(
      join(repoRoot, "app-layer/platform-user/recordPublicBookingMergeCandidates.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).toContain("runPgPoolPgText");
  });
});

describe("webappPhase15E repo SQL parity", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("findPlatformUserIdWithEmailConflict queries platform_users email", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "other" }] });
    const id = await findPlatformUserIdWithEmailConflict(
      "550e8400-e29b-41d4-a716-446655440000",
      "user@example.com",
    );
    expect(id).toBe("other");
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("lower(trim(email))");
  });

  it("findPlatformUserIdWithPhoneConflict queries platform_users phone_normalized", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const id = await findPlatformUserIdWithPhoneConflict(
      "550e8400-e29b-41d4-a716-446655440000",
      "+79001234567",
    );
    expect(id).toBeNull();
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("phone_normalized");
  });

  it("mediaFolderExists checks media_folders by id", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "f1" }] });
    await expect(mediaFolderExists("550e8400-e29b-41d4-a716-446655440099")).resolves.toBe(true);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("FROM media_folders");
  });
});
