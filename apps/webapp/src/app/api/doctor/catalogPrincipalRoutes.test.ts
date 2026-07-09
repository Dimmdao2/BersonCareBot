import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readRoute(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("doctor catalog API principal routes", () => {
  it("wraps recommendation API writes in doctor workspace principal", () => {
    const collection = readRoute("./recommendations/route.ts");
    const item = readRoute("./recommendations/[id]/route.ts");

    expect(collection).toContain("requireDoctorWorkspaceApiContext");
    expect(collection).toContain("doctor.recommendations.create");
    expect(item).toContain("requireDoctorWorkspaceApiContext");
    expect(item).toContain("doctor.recommendations.update");
    expect(item).toContain("doctor.recommendations.archive");
  });

  it("wraps clinical test API writes in doctor workspace principal", () => {
    const collection = readRoute("./clinical-tests/route.ts");
    const item = readRoute("./clinical-tests/[id]/route.ts");

    expect(collection).toContain("requireDoctorWorkspaceApiContext");
    expect(collection).toContain("doctor.clinical-tests.create");
    expect(item).toContain("requireDoctorWorkspaceApiContext");
    expect(item).toContain("doctor.clinical-tests.update");
    expect(item).toContain("doctor.clinical-tests.archive");
  });

  it("wraps test set API writes in doctor workspace principal", () => {
    const collection = readRoute("./test-sets/route.ts");
    const item = readRoute("./test-sets/[id]/route.ts");
    const items = readRoute("./test-sets/[id]/items/route.ts");

    expect(collection).toContain("requireDoctorWorkspaceApiContext");
    expect(collection).toContain("doctor.test-sets.create");
    expect(item).toContain("requireDoctorWorkspaceApiContext");
    expect(item).toContain("doctor.test-sets.update");
    expect(item).toContain("doctor.test-sets.archive");
    expect(items).toContain("requireDoctorWorkspaceApiContext");
    expect(items).toContain("doctor.test-sets.items.update");
  });
});
