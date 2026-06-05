import { describe, expect, it, vi } from "vitest";
import { buildCanonicalInboundSnapshot } from "./buildCanonicalSnapshot";

describe("buildCanonicalInboundSnapshot", () => {
  it("merges partial FK and maps cancel status", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const built = buildCanonicalInboundSnapshot({
      organizationId: "org-1",
      externalId: "rt-99",
      platformUserId: null,
      phoneNormalized: "+79001112233",
      recordAt: "2026-06-01T09:00:00.000Z",
      legacyStatus: "canceled",
      lastEvent: "manual-cancel",
      payloadJson: {
        datetime_end: "2026-06-01T10:00:00.000Z",
        cooperator_id: "34729",
        service_id: "67591",
      },
      lookup: {
        resolveCanonicalId(type, id) {
          if (type === "specialist" && id === "34729") return "spec-1";
          return null;
        },
      },
      existingScope: { branchId: "branch-keep", specialistId: null, serviceId: "svc-keep" },
    });
    expect(built.snapshot.status).toBe("cancelled_by_specialist");
    expect(built.mergedRefs.branchId).toBe("branch-keep");
    expect(built.mergedRefs.specialistId).toBe("spec-1");
    expect(built.mergedRefs.serviceId).toBe("svc-keep");
    expect(built.appointmentRecordProjection.recordAt).toBe("2026-06-01T09:00:00.000Z");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("applies duration-only change from datetime_end", () => {
    const built = buildCanonicalInboundSnapshot({
      organizationId: "org-1",
      externalId: "rt-100",
      platformUserId: null,
      phoneNormalized: null,
      recordAt: "2026-06-01T09:00:00.000Z",
      legacyStatus: "updated",
      lastEvent: "event-update",
      payloadJson: { datetime_end: "2026-06-01T09:30:00.000Z" },
      lookup: { resolveCanonicalId: () => null },
    });
    expect(built.snapshot.durationMinutes).toBe(30);
    expect(built.snapshot.endAt).toBe("2026-06-01T09:30:00.000Z");
  });
});
