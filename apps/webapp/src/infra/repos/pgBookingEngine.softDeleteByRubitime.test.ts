import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F1b: softDeleteAppointmentByRubitimeExternalId resolves the canonical appointment via
 * be_external_entity_mappings (external_id → canonical_id) and sets `deleted_at`.
 * Returns false when no mapping exists (best-effort, silent).
 */

const mappingRows = vi.hoisted(() => ({ value: [] as { canonicalId: string }[] }));
const updatedRows = vi.hoisted(() => ({ value: [] as { id: string }[] }));
const updateSet = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mappingRows.value),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: unknown) => {
        updateSet(patch);
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => updatedRows.value),
          })),
        };
      }),
    })),
  })),
}));

import { createPgBookingEnginePort } from "./pgBookingEngine";

const ORG = "a0000000-0000-4000-8000-000000000001";
const CANON = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

describe("createPgBookingEnginePort.softDeleteAppointmentByRubitimeExternalId", () => {
  beforeEach(() => {
    mappingRows.value = [];
    updatedRows.value = [];
    updateSet.mockClear();
  });

  it("returns false (no update) when the rubitime id is blank", async () => {
    const port = createPgBookingEnginePort();
    const ok = await port.softDeleteAppointmentByRubitimeExternalId!({ organizationId: ORG, rubitimeId: "   " });
    expect(ok).toBe(false);
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("returns false (no update) when no canonical mapping exists", async () => {
    mappingRows.value = [];
    const port = createPgBookingEnginePort();
    const ok = await port.softDeleteAppointmentByRubitimeExternalId!({ organizationId: ORG, rubitimeId: "rt-1" });
    expect(ok).toBe(false);
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("soft-deletes the mapped canonical row and returns true", async () => {
    mappingRows.value = [{ canonicalId: CANON }];
    updatedRows.value = [{ id: CANON }];
    const port = createPgBookingEnginePort();
    const ok = await port.softDeleteAppointmentByRubitimeExternalId!({ organizationId: ORG, rubitimeId: "rt-1" });
    expect(ok).toBe(true);
    // sets deleted_at (and updated_at) — value is `now()` SQL, just assert the keys.
    expect(updateSet).toHaveBeenCalledTimes(1);
    const patch = updateSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(patch)).toContain("deletedAt");
  });
});
