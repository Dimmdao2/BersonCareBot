/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../broadcasts/BroadcastForm", () => ({
  BroadcastForm: () => <div>BroadcastForm</div>,
}));
vi.mock("../../broadcasts/BroadcastAuditLog", () => ({
  BroadcastAuditLog: () => <div>BroadcastAuditLog</div>,
}));
vi.mock("../../broadcasts/BroadcastDeliveryArchiveClient", () => ({
  BroadcastDeliveryArchiveClient: () => <div>BroadcastDeliveryArchiveClient</div>,
}));
vi.mock("../../broadcasts/actions", () => ({
  listBroadcastAuditAction: vi.fn(async () => []),
}));

beforeAll(async () => {
  await import("./BroadcastsTab");
});

describe("BroadcastsTab", () => {
  async function setup() {
    const { BroadcastsTab } = await import("./BroadcastsTab");
    return BroadcastsTab;
  }

  it("renders BroadcastForm by default (no archive param)", async () => {
    const BroadcastsTab = await setup();
    render(<BroadcastsTab deepLinkParams={{}} onDeepLinkChange={() => {}} />);
    expect(screen.getByText("BroadcastForm")).toBeInTheDocument();
    expect(screen.queryByText("BroadcastDeliveryArchiveClient")).not.toBeInTheDocument();
  });

  it("renders archive view when deepLinkParams.archive is '1'", async () => {
    const BroadcastsTab = await setup();
    render(<BroadcastsTab deepLinkParams={{ archive: "1" }} onDeepLinkChange={() => {}} />);
    expect(screen.getByText("BroadcastDeliveryArchiveClient")).toBeInTheDocument();
    expect(screen.queryByText("BroadcastForm")).not.toBeInTheDocument();
  });

  it("calls onDeepLinkChange('archive', null) when back button clicked in archive view", async () => {
    const BroadcastsTab = await setup();
    const onDeepLinkChange = vi.fn();
    render(<BroadcastsTab deepLinkParams={{ archive: "1" }} onDeepLinkChange={onDeepLinkChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Рассылки/ }));
    expect(onDeepLinkChange).toHaveBeenCalledWith("archive", null);
  });

  it("renders split layout with BroadcastForm and BroadcastAuditLog after data loads", async () => {
    const BroadcastsTab = await setup();
    render(<BroadcastsTab deepLinkParams={{}} onDeepLinkChange={() => {}} />);
    expect(screen.getByText("BroadcastForm")).toBeInTheDocument();
    // BroadcastAuditLog appears after the async listBroadcastAuditAction resolves
    await waitFor(() => {
      expect(screen.getByText("BroadcastAuditLog")).toBeInTheDocument();
    });
  });

  it("renders Новая рассылка and Журнал рассылок headings in main view", async () => {
    const BroadcastsTab = await setup();
    render(<BroadcastsTab deepLinkParams={{}} onDeepLinkChange={() => {}} />);
    expect(screen.getByRole("heading", { name: /новая рассылка/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /журнал рассылок/i })).toBeInTheDocument();
    });
  });
});
