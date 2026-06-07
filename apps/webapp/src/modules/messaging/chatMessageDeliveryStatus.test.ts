import { describe, expect, it } from "vitest";
import { chatMessageDeliveryStatus } from "./chatMessageDeliveryStatus";

describe("chatMessageDeliveryStatus", () => {
  it("returns read when readAt is set", () => {
    expect(
      chatMessageDeliveryStatus({
        createdAt: "2026-06-07T10:00:00.000Z",
        readAt: "2026-06-07T10:05:00.000Z",
        peerLastReadAt: null,
      }),
    ).toBe("read");
  });

  it("returns read when peer cursor is at or after message time", () => {
    expect(
      chatMessageDeliveryStatus({
        createdAt: "2026-06-07T10:00:00.000Z",
        peerLastReadAt: "2026-06-07T10:00:00.000Z",
      }),
    ).toBe("read");
  });

  it("returns sent when peer cursor is before message time", () => {
    expect(
      chatMessageDeliveryStatus({
        createdAt: "2026-06-07T10:05:00.000Z",
        peerLastReadAt: "2026-06-07T10:00:00.000Z",
      }),
    ).toBe("sent");
  });

  it("returns sent when peer cursor is missing", () => {
    expect(
      chatMessageDeliveryStatus({
        createdAt: "2026-06-07T10:00:00.000Z",
        peerLastReadAt: null,
      }),
    ).toBe("sent");
  });
});
