import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

const mockGetCompletion = vi.hoisted(() => vi.fn());
const mockUpdateFeeling = vi.hoisted(() => vi.fn());
const mockListRefItems = vi.hoisted(() => vi.fn());
const mockUpsertWarmupFeelingTrackingIdInTx = vi.hoisted(() => vi.fn());

const mockRevalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

const mockTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientPractice: {
      getCompletionByIdForUser: mockGetCompletion,
      updateCompletionFeelingById: mockUpdateFeeling,
    },
    references: {
      listActiveItemsByCategoryCode: mockListRefItems,
    },
    diaries: {
      upsertWarmupFeelingTrackingIdInTx: mockUpsertWarmupFeelingTrackingIdInTx,
    },
  }),
}));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: () => ({
    transaction: mockTransaction,
  }),
}));

import { PATCH } from "./route";

const SESSION = {
  user: { userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "client" as const, phone: "+79990001122" },
};

const WARMUP_REF = { id: "11111111-1111-4111-8111-111111111111", code: "warmup_feeling", title: "Самочувствие после разминки" };

function mockTx() {
  return {
    execute: vi.fn().mockResolvedValue({ rows: [{ id: "tr-warmup-tx-1" }] }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };
}

describe("PATCH /api/patient/practice/completion/[id]/feeling", () => {
  beforeEach(() => {
    mockRequirePatientApiBusinessAccess.mockReset();
    mockGetCompletion.mockReset();
    mockUpdateFeeling.mockReset();
    mockListRefItems.mockReset();
    mockUpsertWarmupFeelingTrackingIdInTx.mockReset();
    mockTransaction.mockReset();
    mockRevalidatePath.mockReset();

    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: SESSION });
    mockListRefItems.mockResolvedValue([WARMUP_REF]);
    mockUpsertWarmupFeelingTrackingIdInTx.mockResolvedValue("tr-warmup-tx-1");
    mockTransaction.mockImplementation(async (fn: (tx: ReturnType<typeof mockTx>) => Promise<void>) => {
      await fn(mockTx());
    });
  });

  function makeRequest(body: unknown, id = "550e8400-e29b-41d4-a716-446655440099") {
    return new Request(`http://localhost/api/patient/practice/completion/${id}/feeling`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const completionWarmupNull = {
    id: "550e8400-e29b-41d4-a716-446655440099",
    userId: SESSION.user.userId,
    contentPageId: "550e8400-e29b-41d4-a716-446655440001",
    completedAt: new Date().toISOString(),
    source: "daily_warmup" as const,
    feeling: null as number | null,
    notes: "",
  };

  it("returns 401 when not authenticated", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await PATCH(makeRequest({ feeling: 3 }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440099" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when completion missing or belongs to another user", async () => {
    mockGetCompletion.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ feeling: 3 }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440099" }),
    });
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("not_found");
  });

  it("returns 400 for feeling outside 1/3/5", async () => {
    mockGetCompletion.mockResolvedValue(completionWarmupNull);
    const res = await PATCH(makeRequest({ feeling: 2 }), {
      params: Promise.resolve({ id: completionWarmupNull.id }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 when source is not daily_warmup", async () => {
    mockGetCompletion.mockResolvedValue({
      ...completionWarmupNull,
      source: "section_page",
    });
    const res = await PATCH(makeRequest({ feeling: 3 }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440099" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns duplicate when feeling already set", async () => {
    mockGetCompletion.mockResolvedValue({
      ...completionWarmupNull,
      feeling: 3,
    });
    const res = await PATCH(makeRequest({ feeling: 5 }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440099" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean; duplicate?: boolean };
    expect(json.ok).toBe(true);
    expect(json.duplicate).toBe(true);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("runs transaction for daily_warmup when feeling null", async () => {
    mockGetCompletion.mockResolvedValue(completionWarmupNull);
    const res = await PATCH(makeRequest({ feeling: 3 }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440099" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean };
    expect(json.ok).toBe(true);
    expect(mockTransaction).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalled();
  });

  it("revalidates when returning duplicate after tx", async () => {
    mockGetCompletion.mockResolvedValue(completionWarmupNull);
    mockTransaction.mockImplementation(async (fn: (tx: ReturnType<typeof mockTx>) => Promise<void>) => {
      const tx = mockTx();
      tx.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "existing-entry" }]),
          }),
        }),
      });
      await fn(tx);
    });
    const res = await PATCH(makeRequest({ feeling: 1 }), {
      params: Promise.resolve({ id: completionWarmupNull.id }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { duplicate?: boolean };
    expect(json.duplicate).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalled();
  });
});
