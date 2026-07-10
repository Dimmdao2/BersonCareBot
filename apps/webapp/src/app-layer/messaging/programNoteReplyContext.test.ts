import { describe, expect, it, vi } from "vitest";

const { loadProgramNoteReplyContextRowMock } = vi.hoisted(() => ({
  loadProgramNoteReplyContextRowMock: vi.fn(),
}));

vi.mock("@/infra/repos/pgProgramNoteReplyContext", () => ({
  loadProgramNoteReplyContextRow: (stageItemId: string) => loadProgramNoteReplyContextRowMock(stageItemId),
}));

import { resolveProgramNoteReplyContext } from "./programNoteReplyContext";

describe("resolveProgramNoteReplyContext", () => {
  it("returns null for blank id", async () => {
    await expect(resolveProgramNoteReplyContext("   ")).resolves.toBeNull();
    expect(loadProgramNoteReplyContextRowMock).not.toHaveBeenCalled();
  });

  it("maps repo row to integrator reply context", async () => {
    loadProgramNoteReplyContextRowMock.mockResolvedValueOnce({
      patientUserId: "00000000-0000-4000-8000-000000000001",
      assignmentSource: "doctor",
      itemStatus: "active",
      snapshot: { title: "Присед" },
    });

    await expect(
      resolveProgramNoteReplyContext("00000000-0000-4000-8000-000000000002"),
    ).resolves.toEqual({
      platformUserId: "00000000-0000-4000-8000-000000000001",
      stageItemId: "00000000-0000-4000-8000-000000000002",
      exerciseTitle: "Присед",
      integratorConversationId: "webapp:platform:00000000-0000-4000-8000-000000000001",
      programNoteReplyState:
        "admin_reply:webapp:platform:00000000-0000-4000-8000-000000000001#pn:00000000-0000-4000-8000-000000000002",
      assignmentSource: "doctor",
      itemStatus: "active",
    });
  });
});
