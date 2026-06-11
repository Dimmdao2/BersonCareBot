/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TodayExerciseCommentAttentionItem } from "../loadDoctorExerciseCommentAttention";
import type { DoctorExerciseCommentCursor } from "@/modules/program-item-discussion/types";

// Mock heavy child component to avoid next/link, Dialog, video player deps
vi.mock("./DoctorExerciseCommentsList", () => ({
  DoctorExerciseCommentsList: ({ items }: { items: TodayExerciseCommentAttentionItem[] }) => (
    <ul data-testid="comments-list">
      {items.map((item) => (
        <li key={item.stageItemId} data-testid="comment-item">
          {item.patientDisplayName}
        </li>
      ))}
    </ul>
  ),
}));

import { DoctorCommentsTab } from "./DoctorCommentsTab";

const P1 = "00000000-0000-4000-8000-000000000001";
const INST = "00000000-0000-4000-8000-bbbb00000001";
const ITEM1 = "00000000-0000-4000-8000-aaa000000001";
const ITEM2 = "00000000-0000-4000-8000-aaa000000002";
const MSG1 = "00000000-0000-4000-8000-ccc000000001";

function makeItem(
  stageItemId: string,
  patientDisplayName: string,
  body = "Комментарий",
): TodayExerciseCommentAttentionItem {
  return {
    patientUserId: P1,
    patientDisplayName,
    instanceId: INST,
    stageItemId,
    stageItemTitle: "Упражнение",
    latestMessage: {
      id: MSG1,
      instanceStageItemId: stageItemId,
      patientUserId: P1,
      senderRole: "patient",
      origin: "patient_observation",
      body,
      mediaFileId: null,
      supportMessageId: null,
      createdAt: "2026-06-11T10:00:00.000Z",
    },
    latestMessageAtLabel: "11.06.2026, 13:00",
    href: `/app/doctor/clients/${P1}/treatment-programs/${INST}?discussionItem=${stageItemId}`,
  };
}

describe("DoctorCommentsTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders initial unread items", () => {
    const items = [
      makeItem(ITEM1, "Иванов Иван"),
      makeItem(ITEM2, "Петрова Мария"),
    ];
    render(
      <DoctorCommentsTab
        initialItems={items}
        initialCursor={null}
        hasMoreInitial={false}
      />,
    );
    expect(screen.getByTestId("comments-list")).toBeInTheDocument();
    expect(screen.getAllByTestId("comment-item")).toHaveLength(2);
    expect(screen.getByText("Иванов Иван")).toBeInTheDocument();
    expect(screen.getByText("Петрова Мария")).toBeInTheDocument();
  });

  it("shows empty state when no items", () => {
    render(
      <DoctorCommentsTab
        initialItems={[]}
        initialCursor={null}
        hasMoreInitial={false}
      />,
    );
    expect(screen.getByText(/нет новых комментариев/i)).toBeInTheDocument();
    expect(screen.queryByTestId("comments-list")).not.toBeInTheDocument();
  });

  it("shows «Загрузить ещё» button when hasMoreInitial=true", () => {
    const items = [makeItem(ITEM1, "Иванов Иван")];
    render(
      <DoctorCommentsTab
        initialItems={items}
        initialCursor={{ createdAt: "2026-06-11T10:00:00.000Z", id: MSG1 }}
        hasMoreInitial={true}
      />,
    );
    expect(screen.getByRole("button", { name: /загрузить ещё/i })).toBeInTheDocument();
  });

  it("does not show «Загрузить ещё» when hasMoreInitial=false", () => {
    const items = [makeItem(ITEM1, "Иванов Иван")];
    render(
      <DoctorCommentsTab
        initialItems={items}
        initialCursor={null}
        hasMoreInitial={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /загрузить ещё/i })).not.toBeInTheDocument();
  });

  it("«Загрузить ещё» calls /api/doctor/exercise-comments and appends items", async () => {
    const user = userEvent.setup();
    const cursor: DoctorExerciseCommentCursor = {
      createdAt: "2026-06-11T10:00:00.000Z",
      id: MSG1,
    };
    const initialItems = [makeItem(ITEM1, "Иванов Иван")];
    const newItem = makeItem(ITEM2, "Петрова Мария");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        items: [newItem],
        hasMore: false,
        nextCursor: null,
      }),
    } as unknown as Response);
    global.fetch = fetchMock;

    render(
      <DoctorCommentsTab
        initialItems={initialItems}
        initialCursor={cursor}
        hasMoreInitial={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: /загрузить ещё/i }));

    await waitFor(() => {
      expect(screen.getAllByTestId("comment-item")).toHaveLength(2);
      expect(screen.getByText("Петрова Мария")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("/api/doctor/exercise-comments");
    expect(url).toContain("cursor=");
  });

  it("«Загрузить ещё» hides when hasMore becomes false after load", async () => {
    const user = userEvent.setup();
    const items = [makeItem(ITEM1, "Иванов Иван")];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, items: [], hasMore: false, nextCursor: null }),
    } as unknown as Response);

    render(
      <DoctorCommentsTab
        initialItems={items}
        initialCursor={{ createdAt: "2026-06-11T10:00:00.000Z", id: MSG1 }}
        hasMoreInitial={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: /загрузить ещё/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /загрузить ещё/i })).not.toBeInTheDocument();
    });
  });

  it("search input filters items locally", async () => {
    const user = userEvent.setup();
    const items = [
      makeItem(ITEM1, "Иванов Иван", "Болит спина"),
      makeItem(ITEM2, "Петрова Мария", "Всё хорошо"),
    ];

    render(
      <DoctorCommentsTab
        initialItems={items}
        initialCursor={null}
        hasMoreInitial={false}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/поиск по пациенту/i);
    await user.type(searchInput, "Иванов");

    await waitFor(() => {
      expect(screen.getAllByTestId("comment-item")).toHaveLength(1);
      expect(screen.getByText("Иванов Иван")).toBeInTheDocument();
      expect(screen.queryByText("Петрова Мария")).not.toBeInTheDocument();
    });
  });

  it("hides «Загрузить ещё» when search query is active", async () => {
    const user = userEvent.setup();
    const items = [makeItem(ITEM1, "Иванов Иван")];

    render(
      <DoctorCommentsTab
        initialItems={items}
        initialCursor={{ createdAt: "2026-06-11T10:00:00.000Z", id: MSG1 }}
        hasMoreInitial={true}
      />,
    );

    expect(screen.getByRole("button", { name: /загрузить ещё/i })).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/поиск по пациенту/i);
    await user.type(searchInput, "Петров");

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /загрузить ещё/i })).not.toBeInTheDocument();
    });
  });
});
