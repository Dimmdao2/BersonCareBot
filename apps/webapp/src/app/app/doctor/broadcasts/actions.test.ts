import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BroadcastAuditEntry,
  BroadcastPreviewResult,
} from "@/modules/doctor-broadcasts/ports";

const previewMock = vi.fn();
const executeMock = vi.fn();
const listAuditMock = vi.fn();

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
  }),
}));

import {
  previewBroadcastAction,
  executeBroadcastAction,
  listBroadcastAuditAction,
} from "./actions";

const baseCommand = {
  category: "reminder" as const,
  audienceFilter: "with_telegram" as const,
  message: { title: "Test", body: "Body text" },
};

describe("previewBroadcastAction", () => {
  beforeEach(() => previewMock.mockClear());

  it("calls preview with actorId injected from session", async () => {
    const expected: BroadcastPreviewResult = {
      audienceSize: 30,
      category: "reminder",
      audienceFilter: "with_telegram",
    };
    previewMock.mockResolvedValue(expected);

    const result = await previewBroadcastAction(baseCommand);

    expect(previewMock).toHaveBeenCalledWith({ ...baseCommand, actorId: "doctor-1" });
    expect(result).toEqual(expected);
  });
});

describe("executeBroadcastAction", () => {
  beforeEach(() => executeMock.mockClear());

  it("calls execute with actorId injected and returns auditEntry", async () => {
    const auditEntry: BroadcastAuditEntry = {
      id: "audit-1",
      actorId: "doctor-1",
      category: "reminder",
      audienceFilter: "with_telegram",
      messageTitle: "Test",
      executedAt: new Date().toISOString(),
      previewOnly: false,
      audienceSize: 30,
      sentCount: 0,
      errorCount: 0,
    };
    executeMock.mockResolvedValue({ auditEntry });

    const result = await executeBroadcastAction(baseCommand);

    expect(executeMock).toHaveBeenCalledWith({ ...baseCommand, actorId: "doctor-1" });
    expect(result.auditEntry).toEqual(auditEntry);
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
