import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInMemoryMaterialRatingPort } from "./inMemoryMaterialRating";

describe("createInMemoryMaterialRatingPort getDoctorDetail", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("buckets ratings by local day and sorts raters by updated_at desc", async () => {
    const port = createInMemoryMaterialRatingPort();
    const tid = "550e8400-e29b-41d4-a716-446655440099";
    vi.setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
    await port.upsertRating({
      userId: "11111111-1111-1111-1111-111111111111",
      targetKind: "lfk_exercise",
      targetId: tid,
      stars: 4,
    });
    vi.setSystemTime(new Date("2026-05-11T15:00:00.000Z"));
    await port.upsertRating({
      userId: "22222222-2222-2222-2222-222222222222",
      targetKind: "lfk_exercise",
      targetId: tid,
      stars: 5,
    });

    const out = await port.getDoctorDetail({
      targetKind: "lfk_exercise",
      targetId: tid,
      iana: "UTC",
      startUtcIso: "2026-05-10T00:00:00.000Z",
      endExclusiveUtcIso: "2026-05-12T00:00:00.000Z",
      dayKeys: ["2026-05-10", "2026-05-11"],
    });

    expect(out.days[0]).toMatchObject({
      day: "2026-05-10",
      viewCount: 0,
      ratingActivityCount: 1,
      avgStarsInActivity: 4,
    });
    expect(out.days[1]).toMatchObject({
      day: "2026-05-11",
      viewCount: 0,
      ratingActivityCount: 1,
      avgStarsInActivity: 5,
    });

    expect(out.raters.map((r) => r.userId)).toEqual([
      "22222222-2222-2222-2222-222222222222",
      "11111111-1111-1111-1111-111111111111",
    ]);
    expect(out.raters[0]!.displayLabel).toBe(out.raters[0]!.userId);
  });

  it("excludes test user ids from doctor detail ratings", async () => {
    const port = createInMemoryMaterialRatingPort();
    const tid = "550e8400-e29b-41d4-a716-446655440099";
    const testUser = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    vi.setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
    await port.upsertRating({
      userId: testUser,
      targetKind: "lfk_exercise",
      targetId: tid,
      stars: 1,
    });
    await port.upsertRating({
      userId: "22222222-2222-2222-2222-222222222222",
      targetKind: "lfk_exercise",
      targetId: tid,
      stars: 5,
    });

    const out = await port.getDoctorDetail({
      targetKind: "lfk_exercise",
      targetId: tid,
      iana: "UTC",
      startUtcIso: "2026-05-10T00:00:00.000Z",
      endExclusiveUtcIso: "2026-05-11T00:00:00.000Z",
      dayKeys: ["2026-05-10"],
      excludedUserIds: [testUser],
    });

    expect(out.days[0]).toMatchObject({ ratingActivityCount: 1, avgStarsInActivity: 5 });
    expect(out.raters.map((r) => r.userId)).toEqual(["22222222-2222-2222-2222-222222222222"]);
  });

  it("fills missing calendar days with zeros and null avg", async () => {
    const port = createInMemoryMaterialRatingPort();
    const tid = "550e8400-e29b-41d4-a716-446655440099";
    vi.setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
    await port.upsertRating({
      userId: "11111111-1111-1111-1111-111111111111",
      targetKind: "lfk_exercise",
      targetId: tid,
      stars: 3,
    });
    const out = await port.getDoctorDetail({
      targetKind: "lfk_exercise",
      targetId: tid,
      iana: "UTC",
      startUtcIso: "2026-05-09T00:00:00.000Z",
      endExclusiveUtcIso: "2026-05-12T00:00:00.000Z",
      dayKeys: ["2026-05-09", "2026-05-10", "2026-05-11"],
    });
    expect(out.days[0]).toMatchObject({
      day: "2026-05-09",
      ratingActivityCount: 0,
      avgStarsInActivity: null,
    });
    expect(out.days[1]!.ratingActivityCount).toBe(1);
    expect(out.days[1]!.avgStarsInActivity).toBe(3);
    expect(out.days[2]!.ratingActivityCount).toBe(0);
  });
});
