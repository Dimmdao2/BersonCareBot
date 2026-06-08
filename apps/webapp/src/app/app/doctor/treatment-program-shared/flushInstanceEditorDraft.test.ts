import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyInstanceEditorDraft } from "./instanceEditorDraft";
import { flushInstanceEditorDraft } from "./flushInstanceEditorDraft";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";

vi.mock("./programInstanceMutationGuard", () => ({
  confirmActiveProgramInstanceBatchSave: vi.fn(() => true),
}));

function minimalDetail(): TreatmentProgramInstanceDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    templateId: null,
    title: "План",
    status: "active",
    assignmentSource: "doctor",
    assignedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    patientPlanLastOpenedAt: null,
    stages: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        instanceId: "11111111-1111-4111-8111-111111111111",
        sourceStageId: null,
        title: "Этап 1",
        description: null,
        sortOrder: 1,
        status: "available",
        skipReason: null,
        localComment: null,
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            stageId: "22222222-2222-4222-8222-222222222222",
            title: "Группа",
            description: null,
            scheduleText: null,
            sortOrder: 0,
            systemKind: null,
            sourceGroupId: null,
          },
        ],
        items: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            stageId: "22222222-2222-4222-8222-222222222222",
            itemType: "exercise" as const,
            itemRefId: "55555555-5555-4555-8555-555555555555",
            sortOrder: 0,
            comment: null,
            localComment: null,
            settings: null,
            snapshot: { title: "Упр" },
            completedAt: null,
            isActionable: null,
            status: "active" as const,
            groupId: "33333333-3333-4333-8333-333333333333",
            createdAt: "2026-01-01T00:00:00.000Z",
            lastViewedAt: null,
            effectiveComment: null,
          },
        ],
      },
    ],
  };
}

describe("flushInstanceEditorDraft", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok when draft has no real changes", async () => {
    const baseline = minimalDetail();
    const result = await flushInstanceEditorDraft({
      instanceId: baseline.id,
      programStatus: "active",
      draft: {
        ...createEmptyInstanceEditorDraft(),
        stageMetadata: {
          "22222222-2222-4222-8222-222222222222": { title: "Этап 1" },
        },
      },
      baseline,
    });
    expect(result).toEqual({ ok: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("POSTs wire draft without catalog snapshots", async () => {
    const baseline = minimalDetail();
    const result = await flushInstanceEditorDraft({
      instanceId: baseline.id,
      programStatus: "active",
      draft: {
        ...createEmptyInstanceEditorDraft(),
        itemCreates: [
          {
            kind: "library_item",
            clientId: "draft:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            stageId: "22222222-2222-4222-8222-222222222222",
            itemType: "exercise",
            itemRefId: "55555555-5555-4555-8555-555555555555",
            groupId: "33333333-3333-4333-8333-333333333333",
            snapshot: {
              media: [{ mediaUrl: "/api/media/x/preview/sm", mediaType: "image" }],
            },
          },
        ],
      },
      baseline,
    });
    expect(result).toEqual({ ok: true });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as {
      draft: { itemCreates: Array<Record<string, unknown>> };
    };
    expect(body.draft.itemCreates[0]).not.toHaveProperty("snapshot");
    expect(JSON.stringify(body)).not.toContain("preview/sm");
  });

  it("POSTs editor-batch for structural draft", async () => {
    const baseline = minimalDetail();
    const result = await flushInstanceEditorDraft({
      instanceId: baseline.id,
      programStatus: "active",
      draft: {
        ...createEmptyInstanceEditorDraft(),
        itemStructuralPatches: {
          "44444444-4444-4444-8444-444444444444": { status: "disabled" },
        },
      },
      baseline,
    });
    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/editor-batch");
    expect(init.method).toBe("POST");
  });

  it("POSTs editor-batch with metadata and structural sections", async () => {
    const baseline = minimalDetail();
    const result = await flushInstanceEditorDraft({
      instanceId: baseline.id,
      programStatus: "active",
      draft: {
        ...createEmptyInstanceEditorDraft(),
        stageMetadata: {
          "22222222-2222-4222-8222-222222222222": { title: "Новый этап" },
        },
        itemPatches: {
          "44444444-4444-4444-8444-444444444444": { localComment: "Коммент" },
        },
      },
      baseline,
    });
    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns load validation error without POST", async () => {
    const baseline = minimalDetail();
    const result = await flushInstanceEditorDraft({
      instanceId: baseline.id,
      programStatus: "active",
      draft: {
        ...createEmptyInstanceEditorDraft(),
        itemPatches: {
          "44444444-4444-4444-8444-444444444444": {
            loadSettings: { reps: 0, sets: null, maxPain: null },
          },
        },
      },
      baseline,
    });
    expect(result).toEqual({ ok: false, error: "Повторы: целое число от 1 до 999" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns error when editor-batch fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: "fail" }),
    });
    const baseline = minimalDetail();
    const result = await flushInstanceEditorDraft({
      instanceId: baseline.id,
      programStatus: "active",
      draft: {
        ...createEmptyInstanceEditorDraft(),
        stageMetadata: {
          "22222222-2222-4222-8222-222222222222": { title: "Новый этап" },
        },
      },
      baseline,
    });
    expect(result).toEqual({ ok: false, error: "fail" });
  });
});
