import { describe, expect, it, vi } from "vitest";
import { createSpecialistTasksService } from "./service";
import type { SpecialistTasksPort } from "./ports";
import type { SpecialistTaskRow } from "./types";
import { pickNextImportantOrOverdue } from "./taskPriority";
import { parseSpecialistTaskReminderChannels } from "./reminderChannels";

const baseTask = (overrides: Partial<SpecialistTaskRow>): SpecialistTaskRow => ({
  id: "t1",
  ownerUserId: "o1",
  patientUserId: null,
  title: "Test",
  description: null,
  dueAt: null,
  remindAt: null,
  isImportant: false,
  completedAt: null,
  reminderSentAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("pickNextImportantOrOverdue", () => {
  it("prefers overdue important over plain overdue", () => {
    const now = Date.parse("2026-06-02T12:00:00.000Z");
    const picked = pickNextImportantOrOverdue(
      [
        baseTask({ id: "a", dueAt: "2026-06-01T00:00:00.000Z", isImportant: false }),
        baseTask({ id: "b", dueAt: "2026-06-01T00:00:00.000Z", isImportant: true }),
      ],
      now,
    );
    expect(picked?.id).toBe("b");
  });
});

describe("parseSpecialistTaskReminderChannels", () => {
  it("defaults to telegram and max", () => {
    expect(parseSpecialistTaskReminderChannels(null)).toEqual(["telegram", "max"]);
  });

  it("reads channels array from value_json", () => {
    expect(parseSpecialistTaskReminderChannels({ channels: ["email"] })).toEqual(["email"]);
  });
});

describe("createSpecialistTasksService", () => {
  it("rejects empty title on create", async () => {
    const port: SpecialistTasksPort = {
      listForOwner: vi.fn(),
      getByIdForOwner: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      complete: vi.fn(),
      delete: vi.fn(),
      getPatientSummary: vi.fn(),
      listDueReminders: vi.fn(),
      markReminderSent: vi.fn(),
    };
    const svc = createSpecialistTasksService(port);
    await expect(
      svc.create({ ownerUserId: "o", patientUserId: null, title: "   " }),
    ).rejects.toThrow("empty_title");
  });
});
