import { describe, expect, it } from "vitest";

import { createInMemoryMaterialRatingPort } from "./inMemoryMaterialRating";

const A = "550e8400-e29b-41d4-a716-446655440001";
const B = "550e8400-e29b-41d4-a716-446655440002";
const C = "550e8400-e29b-41d4-a716-446655440003";

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const U3 = "33333333-3333-3333-3333-333333333333";

describe("createInMemoryMaterialRatingPort listAggregates", () => {
  it("returns per-target avg/count/distribution in one map, omitting targets with no ratings", async () => {
    const port = createInMemoryMaterialRatingPort();
    await port.upsertRating({ userId: U1, targetKind: "content_page", targetId: A, stars: 5 });
    await port.upsertRating({ userId: U2, targetKind: "content_page", targetId: A, stars: 3 });
    await port.upsertRating({ userId: U1, targetKind: "content_page", targetId: B, stars: 4 });

    const map = await port.listAggregates({
      targetKind: "content_page",
      targetIds: [A, B, C],
    });

    expect(map.get(A)).toEqual({
      count: 2,
      avg: 4,
      distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 },
    });
    expect(map.get(B)).toMatchObject({ count: 1, avg: 4 });
    // C has no ratings → absent from the map (UI treats missing as empty chip).
    expect(map.has(C)).toBe(false);
  });

  it("isolates by targetKind — same id under a different kind is not mixed in", async () => {
    const port = createInMemoryMaterialRatingPort();
    await port.upsertRating({ userId: U1, targetKind: "content_page", targetId: A, stars: 5 });
    await port.upsertRating({ userId: U2, targetKind: "lfk_exercise", targetId: A, stars: 1 });

    const map = await port.listAggregates({ targetKind: "content_page", targetIds: [A] });

    expect(map.get(A)).toMatchObject({ count: 1, avg: 5 });
  });

  it("honours excludedUserIds", async () => {
    const port = createInMemoryMaterialRatingPort();
    await port.upsertRating({ userId: U1, targetKind: "content_page", targetId: A, stars: 5 });
    await port.upsertRating({ userId: U2, targetKind: "content_page", targetId: A, stars: 1 });
    await port.upsertRating({ userId: U3, targetKind: "content_page", targetId: A, stars: 3 });

    const map = await port.listAggregates({
      targetKind: "content_page",
      targetIds: [A],
      excludedUserIds: [U2],
    });

    expect(map.get(A)).toMatchObject({ count: 2, avg: 4 });
  });

  it("returns an empty map for an empty targetIds list", async () => {
    const port = createInMemoryMaterialRatingPort();
    await port.upsertRating({ userId: U1, targetKind: "content_page", targetId: A, stars: 5 });

    const map = await port.listAggregates({ targetKind: "content_page", targetIds: [] });

    expect(map.size).toBe(0);
  });
});
