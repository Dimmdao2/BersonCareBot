import { describe, expect, it } from "vitest";
import { buildIntegrationsHealthSnapshot } from "./integrationHealthSnapshot";

describe("buildIntegrationsHealthSnapshot", () => {
  it("maps outbound probe meta and inbound last-status", () => {
    const snapshot = buildIntegrationsHealthSnapshot({
      probeMetaJson: { max: "ok", rubitime: "fail", telegram: "skipped_not_configured", google_calendar: "ok" },
      probeLastFinishedAt: "2026-06-09T10:00:00.000Z",
      webhookLastStatus: [
        {
          source: "telegram",
          receivedAt: "2026-06-09T09:00:00.000Z",
          processedOk: 0,
          errorClass: "webhook_parse_failed",
          httpStatusReturned: 200,
          detail: "bad json",
        },
      ],
    });
    expect(snapshot.max.outbound.status).toBe("ok");
    expect(snapshot.rubitime.outbound.status).toBe("fail");
    expect(snapshot.telegram.inbound?.processedOk).toBe(false);
    expect(snapshot.google_calendar.outbound.lastFinishedAt).toBe("2026-06-09T10:00:00.000Z");
  });
});
