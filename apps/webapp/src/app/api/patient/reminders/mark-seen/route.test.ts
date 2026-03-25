import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequirePatientAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientAccess: mockRequirePatientAccess,
}));

const mockMarkSeen = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockMarkAllSeen = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    reminderProjection: {
      markSeen: mockMarkSeen,
      markAllSeen: mockMarkAllSeen,
    },
  }),
}));

import { POST } from "./route";

const SESSION = { user: { userId: "platform-user-1" } };

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/patient/reminders/mark-seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/patient/reminders/mark-seen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePatientAccess.mockResolvedValue(SESSION);
    mockMarkSeen.mockResolvedValue(undefined);
    mockMarkAllSeen.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePatientAccess.mockRejectedValue(new Error("unauthorized"));
    const res = await POST(makeRequest({ occurrenceIds: ["id-1"] }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/patient/reminders/mark-seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("invalid json");
  });

  it("marks specific occurrences as seen", async () => {
    const res = await POST(makeRequest({ occurrenceIds: ["occ-1", "occ-2"] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockMarkSeen).toHaveBeenCalledWith("platform-user-1", ["occ-1", "occ-2"]);
  });

  it("marks all occurrences seen when all: true", async () => {
    const res = await POST(makeRequest({ all: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockMarkAllSeen).toHaveBeenCalledWith("platform-user-1");
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it("returns 400 when occurrenceIds is empty array", async () => {
    const res = await POST(makeRequest({ occurrenceIds: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when occurrenceIds contains non-strings", async () => {
    const res = await POST(makeRequest({ occurrenceIds: [1, 2, 3] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is missing both all and occurrenceIds", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });
});
