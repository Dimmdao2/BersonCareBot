import { describe, expect, it, vi, beforeEach } from "vitest";

const assertMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/assertIntegratorGetRequest", () => ({
  assertIntegratorGetRequest: assertMock,
}));

const mockListLfkComplexes = vi.hoisted(() => vi.fn());
const mockListTreatmentProgramLfkBlocks = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    diaries: {
      listLfkComplexes: mockListLfkComplexes,
    },
    treatmentProgramInstance: {
      listTreatmentProgramLfkBlocksForIntegratorPatient: mockListTreatmentProgramLfkBlocks,
    },
  }),
}));

import { GET } from "./route";
import {
  integratorGetSignedHeadersOk,
  wireDefaultAssertIntegratorGetForRouteTests,
} from "../../testUtils/wireAssertIntegratorGetForRouteTests";

const userId = "70707070-7070-4070-8070-707070707070";

const sampleTpBlock = {
  instanceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  instanceStatus: "active" as const,
  stageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  stageTitle: "Этап 1",
  stageItemId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  lfkComplexId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  lfkComplexTitle: "Снимок ЛФК",
};

describe("GET /api/integrator/diary/lfk-complexes", () => {
  beforeEach(() => {
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
    mockListLfkComplexes.mockReset();
    mockListTreatmentProgramLfkBlocks.mockReset();
    mockListLfkComplexes.mockResolvedValue([]);
  });

  it("returns 400 when headers missing", async () => {
    const res = await GET(
      new Request(`https://localhost/api/integrator/diary/lfk-complexes?userId=${userId}`),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "missing webhook headers" });
  });

  it("returns 401 when signature invalid", async () => {
    const res = await GET(
      new Request(`https://localhost/api/integrator/diary/lfk-complexes?userId=${userId}`, {
        headers: {
          "x-bersoncare-timestamp": String(Math.floor(Date.now() / 1000)),
          "x-bersoncare-signature": "bad",
        },
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: "invalid signature" });
  });

  it("returns 400 when userId missing", async () => {
    const res = await GET(
      new Request("https://localhost/api/integrator/diary/lfk-complexes", {
        headers: integratorGetSignedHeadersOk,
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "userId required" });
  });

  it("returns 200 with complexes array when valid", async () => {
    const res = await GET(
      new Request(`https://localhost/api/integrator/diary/lfk-complexes?userId=${userId}`, {
        headers: integratorGetSignedHeadersOk,
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ ok: true });
    expect(Array.isArray(data.complexes)).toBe(true);
    expect(mockListLfkComplexes).toHaveBeenCalledWith(userId, true);
    expect(data.treatmentProgramLfkBlocks).toBeUndefined();
    expect(mockListTreatmentProgramLfkBlocks).not.toHaveBeenCalled();
  });

  it("includeTreatmentPrograms=true adds treatmentProgramLfkBlocks (AUDIT_PHASE_9 FIX 9-M-1)", async () => {
    mockListTreatmentProgramLfkBlocks.mockResolvedValue([sampleTpBlock]);
    const res = await GET(
      new Request(
        `https://localhost/api/integrator/diary/lfk-complexes?userId=${userId}&includeTreatmentPrograms=true`,
        { headers: integratorGetSignedHeadersOk },
      ),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ ok: true });
    expect(data.treatmentProgramLfkBlocks).toEqual([sampleTpBlock]);
    expect(mockListTreatmentProgramLfkBlocks).toHaveBeenCalledWith(userId);
  });

  it("includeTreatmentPrograms=false omits treatmentProgramLfkBlocks", async () => {
    const res = await GET(
      new Request(
        `https://localhost/api/integrator/diary/lfk-complexes?userId=${userId}&includeTreatmentPrograms=false`,
        { headers: integratorGetSignedHeadersOk },
      ),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.treatmentProgramLfkBlocks).toBeUndefined();
    expect(mockListTreatmentProgramLfkBlocks).not.toHaveBeenCalled();
  });
});
