/** Wave 3 phase 15C — treatment tail repos: runtime constraints + SQL parity. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runWebappPgTextMock, getWebappSqlFromPgClientMock, drizzleSnapshotState } = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(),
  getWebappSqlFromPgClientMock: vi.fn((_client: unknown) => ({ execute: vi.fn() })),
  drizzleSnapshotState: {
    exerciseRow: null as Record<string, unknown> | null,
    mediaRows: [] as Array<{ mediaUrl: string; mediaType: string; sortOrder: number; id: string }>,
  },
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (queryText: string, values?: readonly unknown[], db?: unknown) =>
    runWebappPgTextMock(queryText, values, db),
  getWebappSqlFromPgClient: (client: unknown) => getWebappSqlFromPgClientMock(client),
}));

vi.mock("@/infra/repos/materialRatingTargetVideoMediaIds", () => ({
  resolveMaterialRatingTargetVideoMediaIds: vi.fn(async () => []),
}));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: vi.fn(() => {
    const mediaChain = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(async () => drizzleSnapshotState.mediaRows),
    };
    mediaChain.from.mockReturnValue(mediaChain);
    mediaChain.where.mockReturnValue(mediaChain);

    return {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(async () => {}),
        })),
      })),
      select: vi.fn(() => mediaChain),
      query: {
        lfkExercises: {
          findFirst: vi.fn(async () => drizzleSnapshotState.exerciseRow),
        },
        clinicalTests: { findFirst: vi.fn(async () => null) },
        recommendations: { findFirst: vi.fn(async () => null) },
        contentPages: { findFirst: vi.fn(async () => null) },
      },
    };
  }),
}));

import { resolveMaterialRatingTargetVideoMediaIds } from "@/infra/repos/materialRatingTargetVideoMediaIds";
import { applyPlatformUserPhoneHistoryTransition } from "./pgPhoneHistory";
import { createPgMaterialRatingPort } from "./pgMaterialRating";
import { createPgTreatmentProgramItemSnapshotPort } from "./pgTreatmentProgramItemSnapshot";
import { pgUserPinsPort } from "./pgUserPins";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TREATMENT_TAIL_REPO_FILES = [
  "pgTreatmentProgram.ts",
  "pgTreatmentProgramItemSnapshot.ts",
  "pgMaterialRating.ts",
  "pgUserPins.ts",
  "pgPhoneHistory.ts",
] as const;

const MEDIA_FILE_ID = "550e8400-e29b-41d4-a716-446655440099";
const EXERCISE_ID = "660e8400-e29b-41d4-a716-446655440088";

describe("Wave3 phase 15C treatment tail repos (runtime constraints)", () => {
  it.each(TREATMENT_TAIL_REPO_FILES)("uses runWebappPgText — no pool.query / client.query in %s", (file) => {
    const src = readFileSync(join(__dirname, file), "utf8");
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).not.toMatch(/\bclient\.query\b/);
    expect(src).toContain("runWebappPgText");
  });

  it.each(TREATMENT_TAIL_REPO_FILES)("%s has Wave 3 phase 15C file header", (file) => {
    const src = readFileSync(join(__dirname, file), "utf8");
    expect(src).toMatch(/Wave 3 phase 15C/);
  });

  it("pgPhoneHistory uses getWebappSqlFromPgClient for TX-scoped executor", () => {
    const src = readFileSync(join(__dirname, "pgPhoneHistory.ts"), "utf8");
    expect(src).toContain("getWebappSqlFromPgClient");
  });
});

describe("pgTreatmentTail15C (SQL parity)", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    getWebappSqlFromPgClientMock.mockReset();
    getWebappSqlFromPgClientMock.mockReturnValue({ execute: vi.fn() });
    vi.mocked(resolveMaterialRatingTargetVideoMediaIds).mockReset();
    vi.mocked(resolveMaterialRatingTargetVideoMediaIds).mockResolvedValue([]);
    drizzleSnapshotState.exerciseRow = null;
    drizzleSnapshotState.mediaRows = [];
  });

  it("pgUserPinsPort getByUserId selects user_pins by user_id", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          user_id: "u1",
          pin_hash: "hash",
          attempts_failed: 0,
          locked_until: null,
        },
      ],
    });
    const r = await pgUserPinsPort.getByUserId("u1");
    expect(r).toMatchObject({ userId: "u1", pinHash: "hash", attemptsFailed: 0, lockedUntil: null });
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("FROM user_pins");
  });

  it("pgUserPinsPort upsertPinHash inserts with ON CONFLICT reset", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await pgUserPinsPort.upsertPinHash("u1", "hash");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0]);
    expect(sql).toContain("INSERT INTO user_pins");
    expect(sql).toContain("ON CONFLICT (user_id)");
  });

  it("pgUserPinsPort incrementFailed returns lock interval when max attempts reached", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ attempts_failed: 3, locked_until: "2026-06-06T13:00:00.000Z" }],
    });
    const r = await pgUserPinsPort.incrementFailed("u1", 3, 15);
    expect(r.attemptsFailed).toBe(3);
    expect(r.lockedUntil).toBeInstanceOf(Date);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("make_interval");
  });

  it("pgUserPinsPort resetAttempts clears lockout counters", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await pgUserPinsPort.resetAttempts("u1");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0]);
    expect(sql).toContain("attempts_failed = 0");
    expect(sql).toContain("locked_until = NULL");
  });

  it("applyPlatformUserPhoneHistoryTransition closes open intervals and inserts new row", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [], rowCount: 1 });
    const txClient = { query: vi.fn() } as unknown as import("pg").PoolClient;
    await applyPlatformUserPhoneHistoryTransition(txClient, {
      platformUserId: "550e8400-e29b-41d4-a716-446655440000",
      newPhoneNormalized: "+79001234567",
      source: "otp",
    });
    expect(getWebappSqlFromPgClientMock).toHaveBeenCalledWith(txClient);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
    const sqls = runWebappPgTextMock.mock.calls.map((c) => String(c[0]));
    expect(sqls[0]).toContain("UPDATE user_phone_history SET valid_to");
    expect(sqls[1]).toContain("INSERT INTO user_phone_history");
    expect(runWebappPgTextMock.mock.calls[0]?.[2]).toBeDefined();
    expect(runWebappPgTextMock.mock.calls[1]?.[2]).toBeDefined();
  });

  it("applyPlatformUserPhoneHistoryTransition skips insert when phone cleared", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [], rowCount: 1 });
    const txClient = { query: vi.fn() } as unknown as import("pg").PoolClient;
    await applyPlatformUserPhoneHistoryTransition(txClient, {
      platformUserId: "550e8400-e29b-41d4-a716-446655440000",
      newPhoneNormalized: null,
      source: "admin",
    });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("UPDATE user_phone_history");
  });

  it("createPgMaterialRatingPort getDoctorDetail aggregates ratings by local day", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ d: "2026-05-10", cnt: 2, avg_stars: "4.5" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: "u1",
            stars: 5,
            updated_at: "2026-05-10T12:00:00.000Z",
            display_label: "User",
          },
        ],
      });
    const port = createPgMaterialRatingPort();
    const out = await port.getDoctorDetail({
      targetKind: "lfk_exercise",
      targetId: "550e8400-e29b-41d4-a716-446655440099",
      iana: "UTC",
      startUtcIso: "2026-05-10T00:00:00.000Z",
      endExclusiveUtcIso: "2026-05-12T00:00:00.000Z",
      dayKeys: ["2026-05-10", "2026-05-11"],
      excludedUserIds: [],
    });
    expect(out.days[0]).toMatchObject({
      day: "2026-05-10",
      ratingActivityCount: 2,
      avgStarsInActivity: 4.5,
    });
    expect(out.raters[0]).toMatchObject({ userId: "u1", stars: 5, displayLabel: "User" });
    const sqls = runWebappPgTextMock.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes("FROM material_ratings") && s.includes("timezone"))).toBe(true);
    expect(sqls.some((s) => s.includes("LEFT JOIN platform_users"))).toBe(true);
  });

  it("createPgMaterialRatingPort getDoctorDetail includes playback resolve when video media present", async () => {
    vi.mocked(resolveMaterialRatingTargetVideoMediaIds).mockResolvedValueOnce([MEDIA_FILE_ID]);
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ d: "2026-05-10", c: 3 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const port = createPgMaterialRatingPort();
    const out = await port.getDoctorDetail({
      targetKind: "lfk_exercise",
      targetId: EXERCISE_ID,
      iana: "UTC",
      startUtcIso: "2026-05-10T00:00:00.000Z",
      endExclusiveUtcIso: "2026-05-12T00:00:00.000Z",
      dayKeys: ["2026-05-10"],
      excludedUserIds: ["excluded-user"],
    });
    expect(out.days[0]?.viewCount).toBe(3);
    const sqls = runWebappPgTextMock.mock.calls.map((c) => String(c[0]));
    expect(sqls[0]).toContain("media_playback_user_video_first_resolve");
    expect(sqls[0]).toContain("<> ALL");
  });

  it("createPgTreatmentProgramItemSnapshotPort buildSnapshot enriches exercise media from media_files", async () => {
    drizzleSnapshotState.exerciseRow = {
      id: EXERCISE_ID,
      title: "Присед",
      description: null,
      contraindications: null,
      difficulty110: 5,
      loadType: "strength",
      isArchived: false,
    };
    drizzleSnapshotState.mediaRows = [
      {
        id: "m1",
        mediaUrl: `/api/media/${MEDIA_FILE_ID}`,
        mediaType: "video",
        sortOrder: 0,
      },
    ];
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          id: MEDIA_FILE_ID,
          preview_sm_key: "previews/sm.jpg",
          preview_md_key: "previews/md.jpg",
          preview_status: "ready",
        },
      ],
    });
    const port = createPgTreatmentProgramItemSnapshotPort();
    const snap = await port.buildSnapshot("exercise", EXERCISE_ID);
    expect(snap.itemType).toBe("exercise");
    expect(snap.media).toEqual([
      expect.objectContaining({
        url: `/api/media/${MEDIA_FILE_ID}`,
        type: "video",
        previewSmUrl: `/api/media/${MEDIA_FILE_ID}/preview/sm`,
        previewMdUrl: `/api/media/${MEDIA_FILE_ID}/preview/md`,
        previewStatus: "ready",
      }),
    ]);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("FROM media_files");
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("ANY($1::uuid[])");
  });
});
