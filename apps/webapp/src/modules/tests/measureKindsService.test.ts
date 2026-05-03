/** @vitest-environment node */

import { describe, expect, it, beforeEach } from "vitest";
import { createClinicalTestMeasureKindsService } from "./measureKindsService";
import {
  resetInMemoryClinicalTestMeasureKindsStore,
  inMemoryClinicalTestMeasureKindsPort,
} from "@/infra/repos/inMemoryClinicalTestMeasureKinds";

describe("measureKindsService", () => {
  beforeEach(() => {
    resetInMemoryClinicalTestMeasureKindsStore();
  });

  it("saveMeasureKindsOrderAndLabels succeeds on empty store", async () => {
    const svc = createClinicalTestMeasureKindsService(inMemoryClinicalTestMeasureKindsPort);
    await expect(svc.saveMeasureKindsOrderAndLabels([])).resolves.toEqual([]);
  });

  it("throws when payload count mismatches DB", async () => {
    const svc = createClinicalTestMeasureKindsService(inMemoryClinicalTestMeasureKindsPort);
    await svc.createMeasureKindFromLabel("Foo");
    await expect(svc.saveMeasureKindsOrderAndLabels([])).rejects.toThrow("Список устарел");
  });

  it("throws on empty label in update", async () => {
    const svc = createClinicalTestMeasureKindsService(inMemoryClinicalTestMeasureKindsPort);
    const { row } = await svc.createMeasureKindFromLabel("Bar");
    await expect(
      svc.saveMeasureKindsOrderAndLabels([{ id: row.id, label: "   ", sortOrder: 0 }]),
    ).rejects.toThrow("не может быть пустой");
  });

  it("reorders and relabels", async () => {
    const svc = createClinicalTestMeasureKindsService(inMemoryClinicalTestMeasureKindsPort);
    const a = await svc.createMeasureKindFromLabel("First");
    const b = await svc.createMeasureKindFromLabel("Second");
    const updated = await svc.saveMeasureKindsOrderAndLabels([
      { id: b.row.id, label: "Второй", sortOrder: 0 },
      { id: a.row.id, label: "Первый", sortOrder: 1 },
    ]);
    expect(updated.map((r) => r.code)).toEqual([b.row.code, a.row.code]);
    expect(updated[0]?.label).toBe("Второй");
    expect(updated[1]?.label).toBe("Первый");
  });

  it("createMeasureKindFromLabel is idempotent when normalized code matches", async () => {
    const svc = createClinicalTestMeasureKindsService(inMemoryClinicalTestMeasureKindsPort);
    const first = await svc.createMeasureKindFromLabel("  HELLO World  ");
    const second = await svc.createMeasureKindFromLabel("hello world");
    expect(second.created).toBe(false);
    expect(second.row.id).toBe(first.row.id);
    expect(second.row.code).toBe(first.row.code);
  });
});
