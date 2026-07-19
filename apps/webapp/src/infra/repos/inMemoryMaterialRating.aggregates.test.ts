import { describe, expect, it } from "vitest";

import { createInMemoryMaterialRatingPort } from "./inMemoryMaterialRating";

const A = "550e8400-e29b-41d4-a716-446655440001";
const B = "550e8400-e29b-41d4-a716-446655440002";
const C = "550e8400-e29b-41d4-a716-446655440003";

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const U3 = "33333333-3333-3333-3333-333333333333";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("createInMemoryMaterialRatingPort listAggregates", () => {
  it("returns per-target avg/count/distribution in one map, omitting targets with no ratings", async () => {
    const port = createInMemoryMaterialRatingPort();
    await port.upsertRating({ organizationId: ORG_A, userId: U1, targetKind: "content_page", targetId: A, stars: 5 });
    await port.upsertRating({ organizationId: ORG_A, userId: U2, targetKind: "content_page", targetId: A, stars: 3 });
    await port.upsertRating({ organizationId: ORG_A, userId: U1, targetKind: "content_page", targetId: B, stars: 4 });

    const map = await port.listAggregates({
      organizationId: ORG_A,
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
    await port.upsertRating({ organizationId: ORG_A, userId: U1, targetKind: "content_page", targetId: A, stars: 5 });
    await port.upsertRating({ organizationId: ORG_A, userId: U2, targetKind: "lfk_exercise", targetId: A, stars: 1 });

    const map = await port.listAggregates({ organizationId: ORG_A, targetKind: "content_page", targetIds: [A] });

    expect(map.get(A)).toMatchObject({ count: 1, avg: 5 });
  });

  it("honours excludedUserIds", async () => {
    const port = createInMemoryMaterialRatingPort();
    await port.upsertRating({ organizationId: ORG_A, userId: U1, targetKind: "content_page", targetId: A, stars: 5 });
    await port.upsertRating({ organizationId: ORG_A, userId: U2, targetKind: "content_page", targetId: A, stars: 1 });
    await port.upsertRating({ organizationId: ORG_A, userId: U3, targetKind: "content_page", targetId: A, stars: 3 });

    const map = await port.listAggregates({
      organizationId: ORG_A,
      targetKind: "content_page",
      targetIds: [A],
      excludedUserIds: [U2],
    });

    expect(map.get(A)).toMatchObject({ count: 2, avg: 4 });
  });

  it("returns an empty map for an empty targetIds list", async () => {
    const port = createInMemoryMaterialRatingPort();
    await port.upsertRating({ organizationId: ORG_A, userId: U1, targetKind: "content_page", targetId: A, stars: 5 });

    const map = await port.listAggregates({ organizationId: ORG_A, targetKind: "content_page", targetIds: [] });

    expect(map.size).toBe(0);
  });

  it("does not mix same target ids between organizations across direct, list, and summary reads", async () => {
    const port = createInMemoryMaterialRatingPort();
    await port.upsertRating({ organizationId: ORG_A, userId: U1, targetKind: "content_page", targetId: A, stars: 5 });
    await port.upsertRating({ organizationId: ORG_B, userId: U2, targetKind: "content_page", targetId: A, stars: 1 });

    await expect(port.getAggregate({ organizationId: ORG_A, targetKind: "content_page", targetId: A }))
      .resolves.toMatchObject({ count: 1, avg: 5 });
    const orgBRows = await port.listAggregates({ organizationId: ORG_B, targetKind: "content_page", targetIds: [A] });
    expect(orgBRows.get(A)).toMatchObject({ count: 1, avg: 1 });
    await expect(port.listDoctorSummary({ organizationId: ORG_A, limit: 10, offset: 0 }))
      .resolves.toEqual([expect.objectContaining({ targetId: A, count: 1, avg: 5 })]);
  });

  it("fails closed when a foreign or legacy-null row conflicts with a write", async () => {
    const port = createInMemoryMaterialRatingPort();
    await port.upsertRating({ organizationId: ORG_A, userId: U1, targetKind: "content_page", targetId: A, stars: 5 });

    await expect(port.upsertRating({ organizationId: ORG_B, userId: U1, targetKind: "content_page", targetId: A, stars: 1 }))
      .rejects.toThrow("material_rating organization mismatch");
    await expect(port.getMyRating({ organizationId: ORG_B, userId: U1, targetKind: "content_page", targetId: A }))
      .resolves.toBeNull();
  });
});
