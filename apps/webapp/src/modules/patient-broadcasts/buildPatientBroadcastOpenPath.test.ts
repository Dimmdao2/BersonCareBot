import { describe, expect, it } from "vitest";
import { buildPatientBroadcastOpenPath } from "./buildPatientBroadcastOpenPath";

describe("buildPatientBroadcastOpenPath", () => {
  it("returns encoded patient broadcast path for push openUrl", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(buildPatientBroadcastOpenPath(id)).toBe(
      `/app/patient/broadcasts/${encodeURIComponent(id)}`,
    );
  });
});
