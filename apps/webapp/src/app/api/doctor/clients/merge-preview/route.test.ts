import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, buildMergePreviewMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  buildMergePreviewMock: vi.fn(),
}));

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: getSessionMock,
}));
vi.mock("@/infra/db/client", () => ({
  getPool: () => ({ query: vi.fn() }),
}));
vi.mock("@/infra/platformUserMergePreview", () => ({
  buildMergePreview: (...args: unknown[]) => buildMergePreviewMock(...args),
}));

import { GET } from "./route";

const adminOk = {
  ok: true as const,
  session: {
    user: { userId: "a1", role: "admin" as const, displayName: "Admin", bindings: {} },
    adminMode: true,
    issuedAt: 0,
    expiresAt: 9_999_999_999,
  },
};

const t1 = "00000000-0000-4000-8000-000000000001";
const t2 = "00000000-0000-4000-8000-000000000002";

describe("GET /api/doctor/clients/merge-preview", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    buildMergePreviewMock.mockReset();
    getSessionMock.mockResolvedValue(adminOk);
  });

  it("returns 403 when admin gate fails", async () => {
    getSessionMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });
    const res = await GET(
      new Request(`http://localhost/api/doctor/clients/merge-preview?targetId=${t1}&duplicateId=${t2}`),
    );
    expect(res.status).toBe(403);
    expect(buildMergePreviewMock).not.toHaveBeenCalled();
  });

  it("returns 400 when query invalid", async () => {
    const res = await GET(new Request(`http://localhost/api/doctor/clients/merge-preview?targetId=x&duplicateId=${t2}`));
    expect(res.status).toBe(400);
    expect(buildMergePreviewMock).not.toHaveBeenCalled();
  });

  it("returns 400 not_client from preview builder", async () => {
    buildMergePreviewMock.mockResolvedValue({
      ok: false,
      error: "not_client",
      message: "not client",
    });
    const res = await GET(
      new Request(`http://localhost/api/doctor/clients/merge-preview?targetId=${t1}&duplicateId=${t2}`),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_client");
  });

  it("returns 200 with camelCase preview body when ok", async () => {
    const created = new Date("2020-01-01T00:00:00.000Z");
    buildMergePreviewMock.mockResolvedValue({
      ok: true,
      targetId: t1,
      duplicateId: t2,
      target: {
        id: t1,
        phone_normalized: "+7900",
        integrator_user_id: null,
        merged_into_id: null,
        display_name: "A",
        first_name: null,
        last_name: null,
        email: null,
        email_verified_at: null,
        role: "client",
        created_at: created,
        updated_at: created,
        is_blocked: false,
        is_archived: false,
        blocked_at: null,
        blocked_reason: null,
        blocked_by: null,
      },
      duplicate: {
        id: t2,
        phone_normalized: "+7900",
        integrator_user_id: null,
        merged_into_id: null,
        display_name: "A",
        first_name: null,
        last_name: null,
        email: null,
        email_verified_at: null,
        role: "client",
        created_at: created,
        updated_at: created,
        is_blocked: false,
        is_archived: false,
        blocked_at: null,
        blocked_reason: null,
        blocked_by: null,
      },
      targetBindings: [],
      duplicateBindings: [],
      targetOauth: [],
      duplicateOauth: [],
      dependentCounts: {
        target: {
          patientBookings: 0,
          reminderRules: 0,
          supportConversations: 0,
          symptomTrackings: 0,
          lfkComplexes: 0,
          mediaFilesUploadedBy: 0,
          onlineIntakeRequests: 0,
        },
        duplicate: {
          patientBookings: 0,
          reminderRules: 0,
          supportConversations: 0,
          symptomTrackings: 0,
          lfkComplexes: 0,
          mediaFilesUploadedBy: 0,
          onlineIntakeRequests: 0,
        },
      },
      hardBlockers: [],
      scalarConflicts: [],
      channelConflicts: [],
      oauthConflicts: [],
      autoMergeScalars: [],
      recommendation: {
        suggestedTargetId: t1,
        suggestedDuplicateId: t2,
        basis: "pick_merge_target_heuristic",
        defaultWinnerBias: "older_created_at",
      },
      mergeAllowed: true,
      v1MergeEngineCallable: true,
      platformUserMergeV2Enabled: false,
    });

    const res = await GET(
      new Request(`http://localhost/api/doctor/clients/merge-preview?targetId=${t1}&duplicateId=${t2}`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      target: { displayName: string };
      mergeAllowed: boolean;
      v1MergeEngineCallable: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.target.displayName).toBe("A");
    expect(body.mergeAllowed).toBe(true);
    expect(body.v1MergeEngineCallable).toBe(true);
  });
});
