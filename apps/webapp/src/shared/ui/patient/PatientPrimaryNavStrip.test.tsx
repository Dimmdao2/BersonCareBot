/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PatientPrimaryNavStrip } from "./PatientPrimaryNavStrip";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/patient",
}));

const chatUnreadState = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/modules/messaging/hooks/useSupportUnreadPolling", () => ({
  usePatientSupportUnreadCount: () => chatUnreadState.count,
}));

describe("PatientPrimaryNavStrip", () => {
  it("shows chat unread count badge on Чат link", () => {
    chatUnreadState.count = 3;
    render(<PatientPrimaryNavStrip variant="bottom" />);
    const chatLink = screen.getByRole("link", { name: /Чат, 3 новых/i });
    expect(within(chatLink).getByText("3")).toBeInTheDocument();
    chatUnreadState.count = 0;
  });
});
