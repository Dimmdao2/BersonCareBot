import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
const mockSubmitPatientFeedback = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    materialRatingFeedback: {
      submitPatientFeedback: mockSubmitPatientFeedback,
    },
  }),
}));

import { POST } from "./route";

const UUID = "550e8400-e29b-41d4-a716-446655440099";
const SESSION = {
  user: { userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "client" as const, phone: "+79990001122" },
};

describe("POST /api/patient/material-ratings/feedback", () => {
  beforeEach(() => {
    mockRequirePatientApiBusinessAccess.mockReset();
    mockSubmitPatientFeedback.mockReset();
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: SESSION });
    mockSubmitPatientFeedback.mockResolvedValue({ ok: true, id: "fb-id-1" });
  });

  it("returns 401 when business access denied", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await POST(
      new Request("http://localhost/api/patient/material-ratings/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentPageId: UUID, ratingValue: 2, reasonCodes: ["too_hard"] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(
      new Request("http://localhost/api/patient/material-ratings/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentPageId: UUID, ratingValue: 4 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when page is not daily warmup member", async () => {
    mockSubmitPatientFeedback.mockResolvedValue({ ok: false, code: "not_daily_warmup" });
    const res = await POST(
      new Request("http://localhost/api/patient/material-ratings/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentPageId: UUID,
          ratingValue: 2,
          reasonCodes: ["too_hard"],
        }),
      }),
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("not_daily_warmup");
  });

  it("returns 400 for empty feedback", async () => {
    mockSubmitPatientFeedback.mockResolvedValue({ ok: false, code: "empty_feedback" });
    const res = await POST(
      new Request("http://localhost/api/patient/material-ratings/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentPageId: UUID, ratingValue: 1, reasonCodes: [], comment: "  " }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful submit", async () => {
    const res = await POST(
      new Request("http://localhost/api/patient/material-ratings/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentPageId: UUID,
          ratingValue: 3,
          reasonCodes: ["video_quality", "other"],
          comment: "Текст",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.id).toBe("fb-id-1");
    expect(mockSubmitPatientFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: SESSION.user.userId,
        contentPageId: UUID,
        ratingValue: 3,
        reasonCodes: ["video_quality", "other"],
        comment: "Текст",
      }),
    );
  });
});
