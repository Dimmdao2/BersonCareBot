import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProgramItemDiscussionMessage } from "./types";

const listDiscussionPageMergedMock = vi.fn();

vi.mock("./listDiscussionPage", () => ({
  listDiscussionPageMerged: (...args: unknown[]) => listDiscussionPageMergedMock(...args),
  paginateMergedMessages: (params: {
    messages: ProgramItemDiscussionMessage[];
    limit: number;
    direction: "backward" | "forward";
    cursor: { createdAt: string; id: string } | null;
  }) => {
    const sorted = [...params.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const page = sorted.slice(-params.limit);
    return { page, nextCursor: null, hasMore: false };
  },
}));

import { listInstanceDiscussionPageMerged } from "./listInstanceDiscussionPage";

const patientUserId = "00000000-0000-4000-8000-000000000001";

function message(id: string, createdAt: string, stageItemId: string): ProgramItemDiscussionMessage {
  return {
    id,
    instanceStageItemId: stageItemId,
    patientUserId,
    senderRole: "patient",
    origin: "patient_observation",
    body: id,
    mediaFileId: null,
    supportMessageId: null,
    createdAt,
  };
}

describe("listInstanceDiscussionPageMerged", () => {
  afterEach(() => {
    listDiscussionPageMergedMock.mockReset();
  });

  it("returns empty page when filter matches no items", async () => {
    const result = await listInstanceDiscussionPageMerged({
      discussion: {} as never,
      items: [{ stageItemId: "a", exerciseTitle: "A" }],
      patientUserId,
      stageItemIdFilter: "missing",
      limit: 20,
      direction: "backward",
      cursor: null,
    });

    expect(result).toEqual({ page: [], nextCursor: null, hasMore: false, totalCount: 0 });
    expect(listDiscussionPageMergedMock).not.toHaveBeenCalled();
  });

  it("delegates to single-item list when filter selects one item", async () => {
    listDiscussionPageMergedMock.mockResolvedValue({
      page: [message("m1", "2026-06-01T10:00:00.000Z", "item-a")],
      nextCursor: null,
      hasMore: false,
      totalCount: 1,
    });

    const result = await listInstanceDiscussionPageMerged({
      discussion: {} as never,
      items: [
        { stageItemId: "item-a", exerciseTitle: "Присед" },
        { stageItemId: "item-b", exerciseTitle: "Мост" },
      ],
      patientUserId,
      stageItemIdFilter: "item-a",
      limit: 30,
      direction: "backward",
      cursor: null,
    });

    expect(listDiscussionPageMergedMock).toHaveBeenCalledTimes(1);
    expect(listDiscussionPageMergedMock).toHaveBeenCalledWith(
      expect.objectContaining({ stageItemId: "item-a", exerciseTitle: "Присед" }),
    );
    expect(result.page).toHaveLength(1);
  });

  it("merges pages from all items when no filter", async () => {
    listDiscussionPageMergedMock
      .mockResolvedValueOnce({
        page: [message("m-old", "2026-06-01T09:00:00.000Z", "item-a")],
        nextCursor: null,
        hasMore: false,
        totalCount: 1,
      })
      .mockResolvedValueOnce({
        page: [message("m-new", "2026-06-01T10:00:00.000Z", "item-b")],
        nextCursor: null,
        hasMore: true,
        totalCount: 2,
      });

    const result = await listInstanceDiscussionPageMerged({
      discussion: {} as never,
      items: [
        { stageItemId: "item-a", exerciseTitle: "A" },
        { stageItemId: "item-b", exerciseTitle: "B" },
      ],
      patientUserId,
      stageItemIdFilter: null,
      limit: 10,
      direction: "backward",
      cursor: null,
    });

    expect(listDiscussionPageMergedMock).toHaveBeenCalledTimes(2);
    expect(result.page.map((m) => m.id)).toEqual(["m-old", "m-new"]);
    expect(result.hasMore).toBe(true);
    expect(result.totalCount).toBe(3);
  });
});
