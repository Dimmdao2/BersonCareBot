import { beforeEach, describe, expect, it, vi } from "vitest";

const getDrizzleMock = vi.hoisted(() => vi.fn());
const getCurrentOrganizationIdMock = vi.hoisted(() => vi.fn<() => string | undefined>());

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: (...conditions: unknown[]) => ({ kind: "and", conditions }),
    eq: (column: unknown, value: unknown) => ({ kind: "eq", column, value }),
  };
});

vi.mock("@/app-layer/db/drizzle", () => ({ getDrizzle: getDrizzleMock }));
vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipalOrganizationId: getCurrentOrganizationIdMock,
}));

import { createPgContentPagesPort } from "./pgContentPages";
import { createPgContentSectionsPort } from "./pgContentSections";

const ORG_A = "10000000-0000-4000-8000-000000000001";
const ORG_B = "20000000-0000-4000-8000-000000000002";

function conditionValues(value: unknown): unknown[] {
  if (typeof value !== "object" || value === null) return [];
  if ("value" in value) return [(value as { value?: unknown }).value];
  if ("conditions" in value && Array.isArray((value as { conditions?: unknown }).conditions)) {
    return (value as { conditions: unknown[] }).conditions.flatMap(conditionValues);
  }
  return [];
}

function listDb(captured: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          captured.push(condition);
          return { orderBy: vi.fn().mockResolvedValue([]) };
        },
      }),
    }),
  };
}

function directDb(captured: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          captured.push(condition);
          return { limit: vi.fn().mockResolvedValue([]) };
        },
      }),
    }),
  };
}

function sectionListDb(captured: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        orderBy: () => ({
          where: (condition: unknown) => {
            captured.push(condition);
            return Promise.resolve([]);
          },
        }),
      }),
    }),
  };
}

describe("content repositories organization reads", () => {
  beforeEach(() => {
    getDrizzleMock.mockReset();
    getCurrentOrganizationIdMock.mockReset();
  });

  it("binds page list and direct reads to the active organization A/B", async () => {
    const captured: unknown[] = [];
    getCurrentOrganizationIdMock.mockReturnValue(ORG_A);
    getDrizzleMock.mockReturnValueOnce(listDb(captured));
    await createPgContentPagesPort().listAll();

    getCurrentOrganizationIdMock.mockReturnValue(ORG_B);
    getDrizzleMock.mockReturnValueOnce(directDb(captured));
    await createPgContentPagesPort().getById("page-from-org-a");

    expect(conditionValues(captured[0])).toContain(ORG_A);
    expect(conditionValues(captured[1])).toContain(ORG_B);
    expect(conditionValues(captured[1])).not.toContain(ORG_A);
  });

  it("binds section list and direct reads to the active organization A/B", async () => {
    const captured: unknown[] = [];
    getCurrentOrganizationIdMock.mockReturnValue(ORG_A);
    getDrizzleMock.mockReturnValueOnce(sectionListDb(captured));
    await createPgContentSectionsPort().listAll();

    getCurrentOrganizationIdMock.mockReturnValue(ORG_B);
    getDrizzleMock.mockReturnValueOnce(directDb(captured));
    await createPgContentSectionsPort().getBySlug("owner-only-section");

    expect(conditionValues(captured[0])).toContain(ORG_A);
    expect(conditionValues(captured[1])).toContain(ORG_B);
    expect(conditionValues(captured[1])).not.toContain(ORG_A);
  });

  it("keeps the explicit no-principal legacy public list fallback", async () => {
    const captured: unknown[] = [];
    getCurrentOrganizationIdMock.mockReturnValue(undefined);
    getDrizzleMock.mockReturnValueOnce(listDb(captured));
    await createPgContentPagesPort().listAll();

    expect(captured).toEqual([undefined]);
  });
});
