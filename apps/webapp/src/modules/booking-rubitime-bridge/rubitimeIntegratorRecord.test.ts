import { describe, expect, it } from "vitest";
import { isNativeBeIntegratorRecordId, parseNativeBeAppointmentId } from "./rubitimeIntegratorRecord";

describe("rubitimeIntegratorRecord", () => {
  it("detects native be: integrator ids", () => {
    expect(isNativeBeIntegratorRecordId("be:a0000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isNativeBeIntegratorRecordId("rubitime-123")).toBe(false);
  });

  it("parses appointment id from native integrator record id", () => {
    expect(parseNativeBeAppointmentId("be:a0000000-0000-4000-8000-000000000001")).toBe(
      "a0000000-0000-4000-8000-000000000001",
    );
    expect(parseNativeBeAppointmentId("12345")).toBeNull();
  });
});
