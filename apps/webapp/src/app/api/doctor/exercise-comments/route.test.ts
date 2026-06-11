import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DoctorExerciseCommentRow } from "@/modules/program-item-discussion/types";

const requireDoctorApiSessionMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const loadDoctorAnalyticsAudienceMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorApiSession: requireDoctorApiSessionMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock("@/app-layer/analytics/loadAnalyticsAudience", () => ({
  loadDoctorAnalyticsAudience: loadDoctorAnalyticsAudienceMock,
}));

import { GET } from "./route";

const DOCTOR_ID = "00000000-0000-4000-8000-00000000000d";
const P1 = "00000000-0000-4000-8000-000000000001";
const INST = "00000000-0000-4000-8000-bbbb00000001";
const ITEM1 = "00000000-0000-4000-8000-aaa000000001";
const MSG1 = "00000000-0000-4000-8000-ccc000000001";

function makeRow(
  patientUserId: string,
  stageItemId: string,
  createdAt: string,
  msgId = MSG1,
  body = "Текст",
): DoctorExerciseCommentRow {
  return {
    patientUserId,
    instanceId: INST,
    stageItemId,
    stageItemTitle: "Упражнение",
    latestMessage: {
      id: msgId,
      instanceStageItemId: stageItemId,
      patientUserId,
      senderRole: "patient",
      origin: "patient_observation",
      body,
      mediaFileId: null,
      supportMessageId: null,
      createdAt,
    },
    createdAt,
  };
}

function authedSession() {
  return {
    ok: true as const,
    session: { user: { userId: DOCTOR_ID, role: "doctor", bindings: {} } },
  };
}

function defaultDeps(rows: DoctorExerciseCommentRow[]) {
  return {
    doctorClientsPort: {
      listClients: vi.fn(async () => [{ userId: P1, displayName: "Иванов И." }]),
    },
    programItemDiscussion: {
      listExerciseCommentsForDoctor: vi.fn(async () => rows),
    },
  };
}

describe("GET /api/doctor/exercise-comments", () => {
  beforeEach(() => {
    requireDoctorApiSessionMock.mockReset();
    buildAppDepsMock.mockReset();
    loadDoctorAnalyticsAudienceMock.mockResolvedValue({ excludedUserIds: [] });
  });

  it("returns 401 without doctor session", async () => {
    requireDoctorApiSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 }),
    });
    const res = await GET(new Request("http://localhost/api/doctor/exercise-comments"));
    expect(res.status).toBe(401);
  });

  it("returns empty list when no on-support patients", async () => {
    requireDoctorApiSessionMock.mockResolvedValue(authedSession());
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { listClients: vi.fn(async () => []) },
      programItemDiscussion: { listExerciseCommentsForDoctor: vi.fn(async () => []) },
    });

    const res = await GET(new Request("http://localhost/api/doctor/exercise-comments"));
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; items: unknown[]; hasMore: boolean };
    expect(data.ok).toBe(true);
    expect(data.items).toHaveLength(0);
    expect(data.hasMore).toBe(false);
  });

  it("returns enriched items with patientDisplayName and href", async () => {
    requireDoctorApiSessionMock.mockResolvedValue(authedSession());
    const rows = [makeRow(P1, ITEM1, "2026-06-11T10:00:00.000Z")];
    buildAppDepsMock.mockReturnValue(defaultDeps(rows));

    const res = await GET(new Request("http://localhost/api/doctor/exercise-comments"));
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; items: Array<{ patientDisplayName: string; href: string }> };
    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.patientDisplayName).toBe("Иванов И.");
    expect(data.items[0]?.href).toContain(P1);
  });

  it("returns 400 on malformed cursor", async () => {
    requireDoctorApiSessionMock.mockResolvedValue(authedSession());
    buildAppDepsMock.mockReturnValue(defaultDeps([]));

    const res = await GET(
      new Request("http://localhost/api/doctor/exercise-comments?cursor=not-json"),
    );
    expect(res.status).toBe(400);
  });

  it("passes cursor to listExerciseCommentsForDoctor", async () => {
    requireDoctorApiSessionMock.mockResolvedValue(authedSession());
    const deps = defaultDeps([]);
    buildAppDepsMock.mockReturnValue(deps);

    const cursor = { createdAt: "2026-06-11T10:00:00.000Z", id: MSG1 };
    await GET(
      new Request(
        `http://localhost/api/doctor/exercise-comments?cursor=${encodeURIComponent(JSON.stringify(cursor))}`,
      ),
    );

    expect(deps.programItemDiscussion.listExerciseCommentsForDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ cursor }),
    );
  });

  it("pagination: hasMore=true and nextCursor when more than PAGE_SIZE rows", async () => {
    requireDoctorApiSessionMock.mockResolvedValue(authedSession());
    // Return PAGE_SIZE (30) + 1 rows to trigger hasMore
    const rows = Array.from({ length: 31 }, (_, i) =>
      makeRow(
        P1,
        `00000000-0000-4000-8000-aaa0000000${String(i).padStart(2, "0")}`,
        `2026-06-11T10:${String(i).padStart(2, "0")}:00.000Z`,
        `00000000-0000-4000-8000-ccc0000000${String(i).padStart(2, "0")}`,
      ),
    );
    buildAppDepsMock.mockReturnValue(defaultDeps(rows));

    const res = await GET(new Request("http://localhost/api/doctor/exercise-comments"));
    const data = await res.json() as { ok: boolean; items: unknown[]; hasMore: boolean; nextCursor: unknown };
    expect(data.items).toHaveLength(30);
    expect(data.hasMore).toBe(true);
    expect(data.nextCursor).not.toBeNull();
  });

  it("search dobor: filters items by patient name and message body (q param)", async () => {
    requireDoctorApiSessionMock.mockResolvedValue(authedSession());
    const deps = {
      doctorClientsPort: {
        listClients: vi.fn(async () => [
          { userId: P1, displayName: "Иванов Иван" },
          { userId: "00000000-0000-4000-8000-000000000002", displayName: "Петрова Мария" },
        ]),
      },
      programItemDiscussion: {
        listExerciseCommentsForDoctor: vi.fn(async () => [
          makeRow(P1, ITEM1, "2026-06-11T10:00:00.000Z", MSG1, "Болит спина"),
          makeRow(
            "00000000-0000-4000-8000-000000000002",
            "00000000-0000-4000-8000-aaa000000002",
            "2026-06-11T09:00:00.000Z",
            "00000000-0000-4000-8000-ccc000000002",
            "Всё хорошо",
          ),
        ]),
      },
    };
    buildAppDepsMock.mockReturnValue(deps);

    const res = await GET(
      new Request("http://localhost/api/doctor/exercise-comments?q=Иванов"),
    );
    const data = await res.json() as { ok: boolean; items: Array<{ patientDisplayName: string }> };
    expect(data.ok).toBe(true);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.patientDisplayName).toBe("Иванов Иван");
  });

  it("search dobor: hasMore=false even if more rows exist (search is not paginated)", async () => {
    requireDoctorApiSessionMock.mockResolvedValue(authedSession());
    const rows = Array.from({ length: 31 }, (_, i) =>
      makeRow(P1, `00000000-0000-4000-8000-aaa0000000${String(i).padStart(2, "0")}`, `2026-06-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`),
    );
    buildAppDepsMock.mockReturnValue(defaultDeps(rows));

    const res = await GET(
      new Request("http://localhost/api/doctor/exercise-comments?q=Текст"),
    );
    const data = await res.json() as { hasMore: boolean };
    expect(data.hasMore).toBe(false);
  });
});
