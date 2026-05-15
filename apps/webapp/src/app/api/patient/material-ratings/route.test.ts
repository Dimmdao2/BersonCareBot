import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockGetOptionalPatientSession = vi.hoisted(() => vi.fn());
const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
const mockPatientClientBusinessGate = vi.hoisted(() => vi.fn());
const mockResolvePatientCanViewAuthOnlyContent = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  getOptionalPatientSession: mockGetOptionalPatientSession,
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

vi.mock("@/modules/platform-access", () => ({
  patientClientBusinessGate: mockPatientClientBusinessGate,
  resolvePatientCanViewAuthOnlyContent: mockResolvePatientCanViewAuthOnlyContent,
}));

const mockGetForPatient = vi.hoisted(() => vi.fn());
const mockPutForPatient = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    materialRating: {
      getForPatient: mockGetForPatient,
      putForPatient: mockPutForPatient,
    },
  }),
}));

import { GET, PUT } from "./route";
import { MaterialRatingAccessError } from "@/modules/material-rating/types";

const UUID = "550e8400-e29b-41d4-a716-446655440099";
const SESSION = {
  user: { userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "client" as const, phone: "+79990001122" },
};

describe("GET /api/patient/material-ratings", () => {
  beforeEach(() => {
    mockGetOptionalPatientSession.mockReset();
    mockPatientClientBusinessGate.mockReset();
    mockResolvePatientCanViewAuthOnlyContent.mockReset();
    mockGetForPatient.mockReset();
    mockGetOptionalPatientSession.mockResolvedValue(null);
    mockResolvePatientCanViewAuthOnlyContent.mockResolvedValue(false);
    mockGetForPatient.mockResolvedValue({
      aggregate: { avg: 4.2, count: 5, distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 3 } },
      myStars: null,
    });
  });

  it("returns 400 for invalid query", async () => {
    const res = await GET(new Request(`http://localhost/api/patient/material-ratings?kind=bad&id=${UUID}`));
    expect(res.status).toBe(400);
  });

  it("returns aggregate for guest without myStars", async () => {
    const res = await GET(new Request(`http://localhost/api/patient/material-ratings?kind=content_page&id=${UUID}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.myStars).toBeNull();
    expect(json.count).toBe(5);
    expect(mockGetForPatient).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        targetKind: "content_page",
        targetId: UUID,
        canViewAuthOnlyContent: false,
      }),
    );
  });

  it("returns myStars when session has business tier", async () => {
    mockGetOptionalPatientSession.mockResolvedValue(SESSION);
    mockPatientClientBusinessGate.mockResolvedValue("allow");
    mockResolvePatientCanViewAuthOnlyContent.mockResolvedValue(true);
    mockGetForPatient.mockResolvedValue({
      aggregate: { avg: 3, count: 2, distribution: { 1: 0, 2: 0, 3: 2, 4: 0, 5: 0 } },
      myStars: 3,
    });
    const res = await GET(new Request(`http://localhost/api/patient/material-ratings?kind=content_page&id=${UUID}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.myStars).toBe(3);
    expect(mockGetForPatient).toHaveBeenCalledWith(
      expect.objectContaining({ canViewAuthOnlyContent: true }),
    );
  });

  it("returns 404 when material is not accessible", async () => {
    mockGetForPatient.mockRejectedValue(new MaterialRatingAccessError("not_found"));
    const res = await GET(new Request(`http://localhost/api/patient/material-ratings?kind=content_page&id=${UUID}`));
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/patient/material-ratings", () => {
  beforeEach(() => {
    mockRequirePatientApiBusinessAccess.mockReset();
    mockPutForPatient.mockReset();
    mockResolvePatientCanViewAuthOnlyContent.mockReset();
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: SESSION });
    mockResolvePatientCanViewAuthOnlyContent.mockResolvedValue(true);
    mockPutForPatient.mockResolvedValue({
      ok: true,
      aggregate: { avg: 4, count: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 } },
      myStars: 4,
    });
  });

  it("returns 401 when unauthorized", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await PUT(
      new Request("http://localhost/api/patient/material-ratings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetKind: "content_page", targetId: UUID, stars: 4 }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when lfk target missing program context", async () => {
    const res = await PUT(
      new Request("http://localhost/api/patient/material-ratings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetKind: "lfk_exercise",
          targetId: UUID,
          stars: 5,
        }),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("missing_program_context");
  });

  it("returns 200 on successful content_page upsert", async () => {
    const res = await PUT(
      new Request("http://localhost/api/patient/material-ratings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetKind: "content_page", targetId: UUID, stars: 4 }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.avg).toBe(4);
    expect(json.myStars).toBe(4);
    expect(mockPutForPatient).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: SESSION.user.userId,
        targetKind: "content_page",
        targetId: UUID,
        stars: 4,
        canViewAuthOnlyContent: true,
      }),
    );
  });

  it("returns 403 when put denied for content_page", async () => {
    mockPutForPatient.mockResolvedValue({ ok: false, code: "forbidden" });
    const res = await PUT(
      new Request("http://localhost/api/patient/material-ratings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetKind: "content_page", targetId: UUID, stars: 4 }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when service reports missing_program_context", async () => {
    mockPutForPatient.mockResolvedValue({ ok: false, code: "missing_program_context" });
    const res = await PUT(
      new Request("http://localhost/api/patient/material-ratings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetKind: "lfk_exercise",
          targetId: UUID,
          stars: 5,
          programInstanceId: "660e8400-e29b-41d4-a716-446655440088",
          programStageItemId: "770e8400-e29b-41d4-a716-446655440077",
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
