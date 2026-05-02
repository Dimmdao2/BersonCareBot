/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DoctorSupportInbox } from "./DoctorSupportInbox";

vi.mock("@/modules/messaging/components/DoctorChatPanel", () => ({
  DoctorChatPanel: ({ conversationId }: { conversationId: string }) => <div>chat:{conversationId}</div>,
}));

describe("DoctorSupportInbox", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const unreadOnly = url.includes("unread=1");
        return new Response(
          JSON.stringify({
            ok: true,
            conversations: unreadOnly
              ? []
              : [
                  {
                    conversationId: "00000000-0000-4000-8000-000000000002",
                    displayName: "Пациент",
                    phoneNormalized: "+79990000000",
                    lastMessageAt: "2025-01-02T12:34:00.000Z",
                    lastMessageText: "Здравствуйте",
                    lastSenderRole: "user",
                    unreadFromUserCount: 2,
                    hasUnreadFromUser: true,
                  },
                ],
          }),
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders phone, time and unread badge in conversation rows", async () => {
    render(<DoctorSupportInbox />);

    expect(await screen.findByText("Пациент")).toBeInTheDocument();
    expect(screen.getByText("Телефон: +79990000000")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getAllByText(/02\.01/).length).toBeGreaterThan(0);
  });

  it("loads unread-only conversations when filter is selected", async () => {
    render(<DoctorSupportInbox />);

    await screen.findByText("Пациент");
    await userEvent.click(screen.getByRole("button", { name: "Непрочитанные" }));

    expect(await screen.findByText("Нет непрочитанных диалогов")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("unread=1"));
  });

  it("shows a network error state when conversations fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    render(<DoctorSupportInbox />);

    expect(await screen.findByText("Ошибка сети при загрузке диалогов")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Нет открытых диалогов")).toBeInTheDocument();
    });
  });
});
