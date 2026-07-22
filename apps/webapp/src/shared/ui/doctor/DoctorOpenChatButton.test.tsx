/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DoctorOpenChatButton } from "./DoctorOpenChatButton";

vi.mock("./primitives/useIsMobileViewport", () => ({
  useIsMobileViewport: () => false,
}));

vi.mock("@/modules/messaging/hooks/useMessagePolling", () => ({
  useMessagePolling: vi.fn(),
}));

vi.mock("@/app/app/doctor/clients/useDoctorPatientSupportChat", () => ({
  useDoctorPatientSupportChat: () => ({
    loading: false,
    error: null,
    conversationId: "00000000-0000-4000-8000-000000000222",
    initialMessages: [],
    unreadCount: 0,
    setUnreadCount: vi.fn(),
    retry: vi.fn(),
  }),
}));

describe("DoctorOpenChatButton", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the same DoctorChatPanel composer inside the modal path", async () => {
    render(
      <DoctorOpenChatButton
        patientUserId="00000000-0000-4000-8000-000000000111"
        patientName="Иван Иванов"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Открыть чат" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Текст ответа" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отправить" })).toBeDisabled();
  });
});
