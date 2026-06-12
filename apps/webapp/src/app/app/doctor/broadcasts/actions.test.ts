import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BroadcastAuditEntry,
  BroadcastPreviewResult,
} from "@/modules/doctor-broadcasts/ports";

const previewMock = vi.fn();
const executeMock = vi.fn();
const listAuditMock = vi.fn();
const revalidatePathMock = vi.fn();
const loadDraftMock = vi.fn();
const saveDraftMock = vi.fn();
const getChannelCountsMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorAccess: vi.fn().mockResolvedValue({ user: { userId: "doctor-1" } }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    doctorBroadcasts: {
      preview: previewMock,
      execute: executeMock,
      listAudit: listAuditMock,
    },
    doctorBroadcastComposer: {
      loadDraft: loadDraftMock,
      saveDraft: saveDraftMock,
      getChannelCounts: getChannelCountsMock,
    },
  }),
}));

import {
  previewBroadcastAction,
  executeBroadcastAction,
  listBroadcastAuditAction,
  loadDraftAction,
  saveDraftAction,
  getChannelCountsAction,
} from "./actions";
import type { BroadcastDraft } from "@/modules/doctor-broadcasts/draftPort";
import { deriveBroadcastDeliveryPolicy } from "@/modules/doctor-broadcasts/broadcastEligible";

const baseCommand = {
  category: "reminder" as const,
  audienceFilter: "with_telegram" as const,
  message: { title: "Test", body: "Body text" },
};

describe("previewBroadcastAction", () => {
  beforeEach(() => previewMock.mockClear());

  it("calls preview with actorId injected from session", async () => {
    const policy = deriveBroadcastDeliveryPolicy(baseCommand.audienceFilter, ["bot_message", "sms"]);
    const expected: BroadcastPreviewResult = {
      audienceSize: 30,
      category: "reminder",
      audienceFilter: "with_telegram",
      channels: ["bot_message", "sms"],
      deliveryPolicyKind: policy.kind,
      deliveryPolicyDescriptionRu: policy.descriptionRu,
    };
    previewMock.mockResolvedValue(expected);

    const result = await previewBroadcastAction(baseCommand);

    expect(previewMock).toHaveBeenCalledWith({ ...baseCommand, actorId: "doctor-1" });
    expect(result).toEqual(expected);
  });
});

describe("executeBroadcastAction", () => {
  beforeEach(() => {
    executeMock.mockClear();
    revalidatePathMock.mockClear();
  });

  it("calls execute with actorId injected and returns auditEntry", async () => {
    const auditEntry: BroadcastAuditEntry = {
      id: "audit-1",
      actorId: "doctor-1",
      category: "reminder",
      audienceFilter: "with_telegram",
      messageTitle: "Test",
      messageBody: "",
      deliveryJobsTotal: 0,
      channels: ["bot_message", "sms"],
      executedAt: new Date().toISOString(),
      previewOnly: false,
      audienceSize: 30,
      sentCount: 0,
      errorCount: 0,
      blockedRecipientCount: 0,
      attachMenuAfterSend: false,
    };
    executeMock.mockResolvedValue({ auditEntry });

    const result = await executeBroadcastAction(baseCommand);

    expect(executeMock).toHaveBeenCalledWith({ ...baseCommand, actorId: "doctor-1" });
    expect(result.auditEntry).toEqual(auditEntry);
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/doctor/broadcasts");
  });
});

describe("listBroadcastAuditAction", () => {
  beforeEach(() => listAuditMock.mockClear());

  it("calls listAudit with provided limit", async () => {
    const entries: BroadcastAuditEntry[] = [];
    listAuditMock.mockResolvedValue(entries);

    const result = await listBroadcastAuditAction(25);

    expect(listAuditMock).toHaveBeenCalledWith(25);
    expect(result).toBe(entries);
  });

  it("calls listAudit without limit when not provided", async () => {
    listAuditMock.mockResolvedValue([]);

    await listBroadcastAuditAction();

    expect(listAuditMock).toHaveBeenCalledWith(undefined);
  });
});

describe("loadDraftAction", () => {
  beforeEach(() => loadDraftMock.mockClear());

  it("loads the draft for the session doctor", async () => {
    const draft: BroadcastDraft = {
      category: "reminder",
      audience: "with_telegram",
      channels: ["bot_message"],
      title: "T",
      body: "B",
    };
    loadDraftMock.mockResolvedValue(draft);

    const result = await loadDraftAction();

    expect(loadDraftMock).toHaveBeenCalledWith("doctor-1");
    expect(result).toEqual(draft);
  });
});

describe("saveDraftAction", () => {
  beforeEach(() => saveDraftMock.mockClear());

  it("saves the draft for the session doctor", async () => {
    const draft: BroadcastDraft = {
      category: null,
      audience: null,
      channels: ["sms"],
      title: "T",
      body: "B",
    };
    saveDraftMock.mockResolvedValue(undefined);

    await saveDraftAction(draft);

    expect(saveDraftMock).toHaveBeenCalledWith("doctor-1", draft);
  });

  it("сохраняет черновик с валидными non-null полями", async () => {
    const draft: BroadcastDraft = {
      category: "reminder",
      audience: "with_telegram",
      channels: ["bot_message", "sms"],
      title: "Заголовок",
      body: "Текст рассылки",
    };
    saveDraftMock.mockResolvedValue(undefined);

    await saveDraftAction(draft);

    expect(saveDraftMock).toHaveBeenCalledWith("doctor-1", draft);
  });

  it("бросает draft_validation_error при невалидной категории", async () => {
    const bad = {
      category: "INVALID_CATEGORY",
      audience: null,
      channels: ["sms"],
      title: "T",
      body: "B",
    };

    await expect(saveDraftAction(bad as BroadcastDraft)).rejects.toThrow("draft_validation_error");
    expect(saveDraftMock).not.toHaveBeenCalled();
  });

  it("бросает draft_validation_error при слишком длинном body (>4000)", async () => {
    const bad: BroadcastDraft = {
      category: null,
      audience: null,
      channels: ["sms"],
      title: "T",
      body: "x".repeat(4001),
    };

    await expect(saveDraftAction(bad)).rejects.toThrow("draft_validation_error");
    expect(saveDraftMock).not.toHaveBeenCalled();
  });

  it("бросает draft_validation_error при слишком длинном title (>200)", async () => {
    const bad: BroadcastDraft = {
      category: null,
      audience: null,
      channels: ["sms"],
      title: "a".repeat(201),
      body: "B",
    };

    await expect(saveDraftAction(bad)).rejects.toThrow("draft_validation_error");
    expect(saveDraftMock).not.toHaveBeenCalled();
  });

  it("бросает draft_validation_error при невалидном канале", async () => {
    const bad = {
      category: null,
      audience: null,
      channels: ["unknown_channel"],
      title: "T",
      body: "B",
    };

    await expect(saveDraftAction(bad as BroadcastDraft)).rejects.toThrow("draft_validation_error");
    expect(saveDraftMock).not.toHaveBeenCalled();
  });
});

describe("getChannelCountsAction", () => {
  beforeEach(() => getChannelCountsMock.mockClear());

  it("returns channel counts from the composer", async () => {
    const counts = { bot_message: 10, sms: 5, push: 0 };
    getChannelCountsMock.mockResolvedValue(counts);

    const result = await getChannelCountsAction();

    expect(getChannelCountsMock).toHaveBeenCalled();
    expect(result).toEqual(counts);
  });
});
