/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChannelNotificationToggles } from "./ChannelNotificationToggles";
import { setChannelNotificationEnabled } from "./actions";
import type { ChannelCard } from "@/modules/channel-preferences/types";

vi.mock("./actions", () => ({
  setChannelNotificationEnabled: vi.fn(),
}));

const mockAction = vi.mocked(setChannelNotificationEnabled);

function makeCard(over: Partial<ChannelCard> = {}): ChannelCard {
  return {
    code: "telegram",
    title: "Telegram",
    openUrl: "",
    isLinked: true,
    isImplemented: true,
    isEnabledForMessages: true,
    isEnabledForNotifications: true,
    ...over,
  };
}

describe("ChannelNotificationToggles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAction.mockResolvedValue({ ok: true });
  });

  it("shows hint when no linked channels", () => {
    render(
      <ChannelNotificationToggles cards={[makeCard({ isLinked: false, code: "email", title: "Email" })]} />,
    );
    expect(screen.getByText(/Нет привязанных каналов/i)).toBeInTheDocument();
  });

  it("calls setChannelNotificationEnabled when switch is toggled", async () => {
    const user = userEvent.setup();
    render(<ChannelNotificationToggles cards={[makeCard()]} />);
    const sw = screen.getByRole("switch", { name: /Уведомления:\s*Telegram/i });
    expect(sw).toBeChecked();
    await user.click(sw);
    expect(mockAction).toHaveBeenCalledWith("telegram", false);
  });

  it("shows error message when action fails", async () => {
    const user = userEvent.setup();
    mockAction.mockResolvedValueOnce({ ok: false, message: "Канал не найден" });
    render(<ChannelNotificationToggles cards={[makeCard({ isEnabledForNotifications: false })]} />);
    const sw = screen.getByRole("switch", { name: /Уведомления:\s*Telegram/i });
    expect(sw).not.toBeChecked();
    await user.click(sw);
    expect(await screen.findByText("Канал не найден")).toBeInTheDocument();
  });
});
