import { describe, expect, it } from "vitest";
import { buildDoctorClientRecentProgramChanges } from "./buildDoctorClientRecentProgramChanges";

describe("buildDoctorClientRecentProgramChanges", () => {
  it("returns newest doctor-visible events first, capped at 5", () => {
    const events = Array.from({ length: 7 }, (_, i) => ({
      id: `00000000-0000-4000-8000-00000000000${i}`,
      instanceId: "11111111-1111-4111-8111-111111111111",
      actorId: null,
      eventType: "stage_added" as const,
      targetType: "stage" as const,
      targetId: "22222222-2222-4222-8222-222222222222",
      reason: null,
      payload: { title: `E${i}` },
      createdAt: `2026-06-0${i + 1}T12:00:00.000Z`,
    }));

    const rows = buildDoctorClientRecentProgramChanges({ events });
    expect(rows).toHaveLength(5);
    expect(rows[0]?.createdAt).toBe("2026-06-07T12:00:00.000Z");
  });
});
