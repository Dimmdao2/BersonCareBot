/** @vitest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BroadcastAuditEntry } from "@/modules/doctor-broadcasts/ports";
import { BroadcastsTab } from "./BroadcastsTab";

const { listBroadcastAuditActionMock } = vi.hoisted(() => ({
  listBroadcastAuditActionMock: vi.fn(),
}));

let lastBroadcastFormProps: Record<string, unknown> = {};

vi.mock("../../broadcasts/BroadcastForm", () => ({
  BroadcastForm: (props: Record<string, unknown>) => {
    lastBroadcastFormProps = props;
    return <div>BroadcastForm</div>;
  },
}));
vi.mock("../../broadcasts/BroadcastDeliveryArchiveClient", () => ({
  BroadcastDeliveryArchiveClient: () => <div>BroadcastDeliveryArchiveClient</div>,
}));
vi.mock("../../broadcasts/actions", () => ({
  listBroadcastAuditAction: listBroadcastAuditActionMock,
}));

const entry: BroadcastAuditEntry = {
  id: "e1",
  actorId: "doctor-1",
  category: "reminder",
  audienceFilter: "with_telegram",
  messageTitle: "Напоминание о приёме",
  messageBody: "Текст напоминания",
  deliveryJobsTotal: 10,
  channels: ["telegram", "sms"],
  executedAt: "2026-03-31T10:05:00.000Z",
  previewOnly: false,
  audienceSize: 10,
  sentCount: 7,
  errorCount: 2,
  blockedRecipientCount: 1,
  attachMenuAfterSend: false,
};

beforeEach(() => {
  lastBroadcastFormProps = {};
  listBroadcastAuditActionMock.mockReset();
  listBroadcastAuditActionMock.mockResolvedValue([entry]);
});

describe("BroadcastsTab", () => {
  it("keeps the 45/55 split with the form and journal", async () => {
    render(<BroadcastsTab deepLinkParams={{}} onDeepLinkChange={() => {}} />);

    expect(screen.getByText("BroadcastForm")).toBeInTheDocument();
    await screen.findByRole("button", { name: /Напоминание о приёме/ });
    expect(document.querySelector("#broadcasts-main-view")?.firstElementChild).toHaveClass(
      "lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)]",
    );
    expect(screen.getByRole("heading", { name: "Журнал рассылок" })).toBeInTheDocument();
    expect(screen.queryByText("Архив ошибок доставки")).not.toBeInTheDocument();
  });

  it("shows the selected broadcast in the left pane and restores the form on close", async () => {
    render(<BroadcastsTab deepLinkParams={{}} onDeepLinkChange={() => {}} />);

    await userEvent.click(await screen.findByRole("button", { name: /Напоминание о приёме/ }));
    const detail = screen.getByTestId("broadcast-selected-detail");
    expect(detail).toHaveTextContent("Напоминание о приёме");
    expect(detail).toHaveTextContent("Текст напоминания");
    expect(detail).toHaveTextContent("Telegram-пользователи · 10");
    expect(detail).toHaveTextContent("Telegram, SMS");
    expect(detail).toHaveTextContent("Недоставка");
    expect(screen.queryByText("BroadcastForm")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Закрыть просмотр рассылки" }));
    expect(screen.getByText("BroadcastForm")).toBeInTheDocument();
  });

  it("opens the error log in the right pane and keeps exactly one close control", async () => {
    const onDeepLinkChange = vi.fn();
    render(<BroadcastsTab deepLinkParams={{}} onDeepLinkChange={onDeepLinkChange} />);

    await userEvent.click(await screen.findByRole("button", { name: /Напоминание о приёме/ }));
    await userEvent.click(screen.getByRole("button", { name: "Лог ошибок" }));
    expect(onDeepLinkChange).toHaveBeenCalledWith("archive", "1");

    render(
      <BroadcastsTab deepLinkParams={{ archive: "1" }} onDeepLinkChange={onDeepLinkChange} />,
    );
    expect(screen.getAllByText("BroadcastForm").at(-1)).toBeInTheDocument();
    expect(screen.getByText("BroadcastDeliveryArchiveClient")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Лог ошибок" })).toBeInTheDocument();
    const closeButtons = screen.getAllByRole("button", { name: "Закрыть лог ошибок" });
    expect(closeButtons).toHaveLength(1);
    await userEvent.click(closeButtons[0]);
    expect(onDeepLinkChange).toHaveBeenCalledWith("archive", null);
  });

  it("creates a form prefill from the selected entry", async () => {
    render(<BroadcastsTab deepLinkParams={{}} onDeepLinkChange={() => {}} />);

    await userEvent.click(await screen.findByRole("button", { name: /Напоминание о приёме/ }));
    await userEvent.click(screen.getByRole("button", { name: "Создать на основе" }));

    await waitFor(() => {
      const prefill = lastBroadcastFormProps.prefill as
        | { entry: BroadcastAuditEntry; nonce: number }
        | undefined;
      expect(prefill?.entry).toEqual(entry);
      expect(prefill?.nonce).toBe(1);
    });
  });
});
