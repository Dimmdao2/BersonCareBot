import { describe, expect, it } from "vitest";
import { countDiscussionAttentionFromMessages } from "./countDiscussionAttention";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";

function msg(
  partial: Partial<ProgramItemDiscussionMessage> & Pick<ProgramItemDiscussionMessage, "senderRole" | "createdAt">,
): ProgramItemDiscussionMessage {
  return {
    id: partial.id ?? "m1",
    instanceStageItemId: "item1",
    patientUserId: "p1",
    senderRole: partial.senderRole,
    origin: "patient_observation",
    body: partial.body ?? "hi",
    mediaFileId: partial.mediaFileId ?? null,
    supportMessageId: null,
    createdAt: partial.createdAt,
  };
}

describe("countDiscussionAttentionFromMessages", () => {
  it("returns zero when last message is from admin", () => {
    expect(
      countDiscussionAttentionFromMessages([
        msg({ senderRole: "patient", createdAt: "2026-01-01T10:00:00.000Z" }),
        msg({ senderRole: "admin", createdAt: "2026-01-01T11:00:00.000Z" }),
      ]),
    ).toEqual({ comments: 0, media: 0 });
  });

  it("counts comment when last message is patient text", () => {
    expect(
      countDiscussionAttentionFromMessages([
        msg({ senderRole: "admin", createdAt: "2026-01-01T10:00:00.000Z" }),
        msg({ senderRole: "patient", createdAt: "2026-01-01T11:00:00.000Z", mediaFileId: null }),
      ]),
    ).toEqual({ comments: 1, media: 0 });
  });

  it("counts media when last message is patient with media", () => {
    expect(
      countDiscussionAttentionFromMessages([
        msg({
          senderRole: "patient",
          createdAt: "2026-01-01T11:00:00.000Z",
          mediaFileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      ]),
    ).toEqual({ comments: 0, media: 1 });
  });
});
