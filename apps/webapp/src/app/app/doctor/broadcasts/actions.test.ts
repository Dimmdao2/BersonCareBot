import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import type {
  BroadcastAuditEntry,
  BroadcastCommand,
  BroadcastPreviewResult,
} from "@/modules/doctor-broadcasts/ports";
import type { DoctorBroadcastExecutionOptions } from "@/modules/doctor-broadcasts/service";

const {
  previewMock,
  executeMock,
  listAuditMock,
  revalidatePathMock,
  loadDraftMock,
  saveDraftMock,
  getChannelCountsMock,
  requireDoctorAccessMock,
  requireDoctorWorkspaceContextMock,
} = vi.hoisted(() => ({
  previewMock: vi.fn(),
  executeMock: vi.fn(),
  listAuditMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  loadDraftMock: vi.fn(),
  saveDraftMock: vi.fn(),
  getChannelCountsMock: vi.fn(),
  requireDoctorAccessMock: vi.fn(),
  requireDoctorWorkspaceContextMock: vi.fn(),
}));

const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const DOCTOR_USER_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorAccess: (...args: unknown[]) => requireDoctorAccessMock(...args),
  requireDoctorWorkspaceContext: (...args: unknown[]) =>
    requireDoctorWorkspaceContextMock(...args),
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

function workspaceContext() {
  return {
    session: { user: { userId: DOCTOR_USER_ID } },
    organizationId: ORGANIZATION_ID,
    membershipId: "33333333-3333-4333-8333-333333333333",
    membershipRole: "doctor",
    specialistId: "44444444-4444-4444-8444-444444444444",
    canManageOrganization: false,
    canManageAllSpecialists: false,
  };
}

const baseCommand = {
  category: "reminder" as const,
  audienceFilter: "with_telegram" as const,
  message: { title: "Test", body: "Body text" },
};

beforeEach(() => {
  previewMock.mockReset();
  executeMock.mockReset();
  listAuditMock.mockReset();
  revalidatePathMock.mockReset();
  loadDraftMock.mockReset();
  saveDraftMock.mockReset();
  getChannelCountsMock.mockReset();
  requireDoctorAccessMock.mockReset();
  requireDoctorWorkspaceContextMock.mockReset();

  requireDoctorAccessMock.mockResolvedValue({ user: { userId: DOCTOR_USER_ID } });
  requireDoctorWorkspaceContextMock.mockResolvedValue(workspaceContext());
  revalidatePathMock.mockImplementation(() => {
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });
});

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

    expect(previewMock).toHaveBeenCalledWith({ ...baseCommand, actorId: DOCTOR_USER_ID });
    expect(requireDoctorAccessMock).toHaveBeenCalledTimes(1);
    expect(requireDoctorWorkspaceContextMock).not.toHaveBeenCalled();
    expect(result).toEqual(expected);
  });
});

describe("executeBroadcastAction", () => {
  beforeEach(() => {
    executeMock.mockClear();
    revalidatePathMock.mockClear();
  });

  it("passes a principal wrapper only for the delivery commit, injects actorId, and returns auditEntry", async () => {
    const auditEntry: BroadcastAuditEntry = {
      id: "audit-1",
      actorId: DOCTOR_USER_ID,
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
    const observedCommitPrincipals: Array<string | undefined> = [];
    executeMock.mockImplementation(async (
      _command: BroadcastCommand,
      options: DoctorBroadcastExecutionOptions,
    ) => {
      expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
      expect(options.runDeliveryCommit).toBeDefined();
      await options.runDeliveryCommit!(async () => {
        observedCommitPrincipals.push(getCurrentDbPrincipalOrganizationId());
      });
      expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
      return { auditEntry };
    });

    const result = await executeBroadcastAction(baseCommand);

    expect(executeMock).toHaveBeenCalledWith(
      { ...baseCommand, actorId: DOCTOR_USER_ID },
      { runDeliveryCommit: expect.any(Function) },
    );
    expect(observedCommitPrincipals).toEqual([ORGANIZATION_ID]);
    expect(result.auditEntry).toEqual(auditEntry);
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/doctor/broadcasts");
    expect(requireDoctorWorkspaceContextMock).toHaveBeenCalledTimes(1);
    expect(requireDoctorAccessMock).not.toHaveBeenCalled();
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });
});

describe("listBroadcastAuditAction", () => {
  beforeEach(() => listAuditMock.mockClear());

  it("calls listAudit with provided limit", async () => {
    const entries: BroadcastAuditEntry[] = [];
    listAuditMock.mockResolvedValue(entries);

    const result = await listBroadcastAuditAction(25);

    expect(listAuditMock).toHaveBeenCalledWith(25);
    expect(requireDoctorAccessMock).toHaveBeenCalledTimes(1);
    expect(requireDoctorWorkspaceContextMock).not.toHaveBeenCalled();
    expect(result).toBe(entries);
  });

  it("calls listAudit without limit when not provided", async () => {
    listAuditMock.mockResolvedValue([]);

    await listBroadcastAuditAction();

    expect(listAuditMock).toHaveBeenCalledWith(undefined);
    expect(requireDoctorAccessMock).toHaveBeenCalledTimes(1);
    expect(requireDoctorWorkspaceContextMock).not.toHaveBeenCalled();
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

    expect(loadDraftMock).toHaveBeenCalledWith(DOCTOR_USER_ID);
    expect(requireDoctorAccessMock).toHaveBeenCalledTimes(1);
    expect(requireDoctorWorkspaceContextMock).not.toHaveBeenCalled();
    expect(result).toEqual(draft);
  });
});

describe("saveDraftAction", () => {
  beforeEach(() => saveDraftMock.mockClear());

  it("saves the draft under workspace organization principal for the workspace doctor", async () => {
    const draft: BroadcastDraft = {
      category: null,
      audience: null,
      channels: ["sms"],
      title: "T",
      body: "B",
    };
    const observedPrincipals: Array<string | undefined> = [];
    saveDraftMock.mockImplementation(async () => {
      observedPrincipals.push(getCurrentDbPrincipalOrganizationId());
    });

    await saveDraftAction(draft);

    expect(saveDraftMock).toHaveBeenCalledWith(DOCTOR_USER_ID, draft);
    expect(observedPrincipals).toEqual([ORGANIZATION_ID]);
    expect(requireDoctorWorkspaceContextMock).toHaveBeenCalledTimes(1);
    expect(requireDoctorAccessMock).not.toHaveBeenCalled();
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
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

    expect(saveDraftMock).toHaveBeenCalledWith(DOCTOR_USER_ID, draft);
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
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
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
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
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
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
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
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
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });
});

describe("getChannelCountsAction", () => {
  beforeEach(() => getChannelCountsMock.mockClear());

  it("returns channel counts from the composer", async () => {
    const counts = { bot_message: 10, sms: 5, push: 0 };
    getChannelCountsMock.mockResolvedValue(counts);

    const result = await getChannelCountsAction();

    expect(getChannelCountsMock).toHaveBeenCalled();
    expect(requireDoctorAccessMock).toHaveBeenCalledTimes(1);
    expect(requireDoctorWorkspaceContextMock).not.toHaveBeenCalled();
    expect(result).toEqual(counts);
  });
});
