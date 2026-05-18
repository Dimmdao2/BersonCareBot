import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyPostMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/verifyIntegratorSignature", () => ({
  verifyIntegratorSignature: verifyPostMock,
}));

const mockDisable = vi.hoisted(() => vi.fn());
vi.mock("@/modules/reminders/disableReminderMessengerTopic", () => ({
  disableReminderMessengerTopicForOccurrence: mockDisable,
}));

vi.mock("@/app-layer/platform-user/canonicalPlatformUser", () => ({
  findCanonicalUserIdByIntegratorId: vi.fn().mockResolvedValue("platform-user-uuid"),
}));

vi.mock("@/app-layer/db/client", () => ({
  getPool: () => ({ query: vi.fn() }),
}));

import { POST } from "./route";

describe("POST /api/integrator/reminders/messenger-topic/disable", () => {
  beforeEach(() => {
    mockDisable.mockReset();
    verifyPostMock.mockReset();
  });

  it("returns 400 when missing headers", async () => {
    const res = await POST(
      new Request("http://localhost/api/integrator/reminders/messenger-topic/disable", {
        method: "POST",
        body: "{}",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 when disable succeeds", async () => {
    verifyPostMock.mockReturnValue(true);
    mockDisable.mockResolvedValue({
      ok: true,
      persisted: true,
      paragraphs: ["a", "b", "c"],
    });
    const res = await POST(
      new Request("http://localhost/api/integrator/reminders/messenger-topic/disable", {
        method: "POST",
        headers: {
          "x-bersoncare-timestamp": "1700000000",
          "x-bersoncare-signature": "sig",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          integratorUserId: "1",
          occurrenceId: "occ-1",
          channel: "telegram",
        }),
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; persisted?: boolean; paragraphs?: string[] };
    expect(json.ok).toBe(true);
    expect(json.persisted).toBe(true);
    expect(json.paragraphs).toEqual(["a", "b", "c"]);
  });

  it("returns 404 when occurrence not found", async () => {
    verifyPostMock.mockReturnValue(true);
    mockDisable.mockResolvedValue({ ok: false, error: "not_found" });
    const res = await POST(
      new Request("http://localhost/api/integrator/reminders/messenger-topic/disable", {
        method: "POST",
        headers: {
          "x-bersoncare-timestamp": "1700000000",
          "x-bersoncare-signature": "sig",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          integratorUserId: "1",
          occurrenceId: "missing",
          channel: "max",
        }),
      })
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with persisted false when occurrence has no channel topic mapping (MVP)", async () => {
    verifyPostMock.mockReturnValue(true);
    mockDisable.mockResolvedValue({
      ok: true,
      persisted: false,
      paragraphs: ["p1"],
    });
    const res = await POST(
      new Request("http://localhost/api/integrator/reminders/messenger-topic/disable", {
        method: "POST",
        headers: {
          "x-bersoncare-timestamp": "1700000000",
          "x-bersoncare-signature": "sig",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          integratorUserId: "1",
          occurrenceId: "occ-no-topic",
          channel: "telegram",
        }),
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; persisted?: boolean; paragraphs?: string[] };
    expect(json.ok).toBe(true);
    expect(json.persisted).toBe(false);
    expect(json.paragraphs).toEqual(["p1"]);
  });

  it("is idempotent for identical signed requests (second POST also 200)", async () => {
    verifyPostMock.mockReturnValue(true);
    mockDisable.mockResolvedValue({
      ok: true,
      persisted: true,
      paragraphs: ["x"],
    });
    const opts = {
      method: "POST" as const,
      headers: {
        "x-bersoncare-timestamp": "1700000000",
        "x-bersoncare-signature": "sig",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        integratorUserId: "1",
        occurrenceId: "occ-idempotent",
        channel: "max",
      }),
    };
    const res1 = await POST(new Request("http://localhost/api/integrator/reminders/messenger-topic/disable", opts));
    const res2 = await POST(new Request("http://localhost/api/integrator/reminders/messenger-topic/disable", opts));
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(mockDisable).toHaveBeenCalledTimes(2);
  });
});
