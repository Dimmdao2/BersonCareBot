import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readRepo(file: string): string {
  return readFileSync(join(__dirname, file), "utf8");
}

function methodBody(src: string, methodName: string): string {
  const marker = `async ${methodName}`;
  const start = src.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = src.indexOf("\n    async ", start + marker.length);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("admin booking-engine repo mutation transactions", () => {
  it("routes scheduling setting writes through runWebappTransaction", () => {
    const src = readRepo("pgBookingScheduling.ts");

    expect(methodBody(src, "upsertBufferMinutes")).toContain("runWebappTransaction");
  });

  it("routes policy upserts through runWebappTransaction", () => {
    const src = readRepo("pgBookingPolicies.ts");

    expect(methodBody(src, "upsertCancellationPolicy")).toContain("runWebappTransaction");
    expect(methodBody(src, "upsertReschedulePolicy")).toContain("runWebappTransaction");
  });

  it("routes admin booking catalog and availability writes through runWebappTransaction", () => {
    const src = readRepo("pgBookingEngine.ts");
    const methods = [
      "upsertBranch",
      "deactivateBranch",
      "upsertRoom",
      "deactivateRoom",
      "upsertSpecialist",
      "deactivateSpecialist",
      "setSpecialistLocation",
      "setSpecialistRoom",
      "upsertService",
      "deactivateService",
      "upsertSpecialistServiceAvailability",
      "deactivateSpecialistServiceAvailability",
      "upsertServiceLocationAvailability",
    ];

    for (const method of methods) {
      expect(methodBody(src, method)).toContain("runWebappTransaction");
    }
  });
});
