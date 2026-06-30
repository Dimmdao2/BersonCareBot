/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BroadcastAuditEntry } from "@/modules/doctor-broadcasts/ports";

// Mutable refs so individual tests can inspect passed props
let lastBroadcastFormProps: Record<string, unknown> = {};
let lastBroadcastAuditLogProps: Record<string, unknown> = {};

vi.mock("../../broadcasts/BroadcastForm", () => ({
  BroadcastForm: (props: Record<string, unknown>) => {
    lastBroadcastFormProps = props;
    return <div>BroadcastForm</div>;
  },
}));
vi.mock("../../broadcasts/BroadcastAuditLog", () => ({
  BroadcastAuditLog: (props: Record<string, unknown>) => {
    lastBroadcastAuditLogProps = props;
    return <div>BroadcastAuditLog</div>;
  },
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

const makeEntry = (overrides: Partial<BroadcastAuditEntry> = {}): BroadcastAuditEntry => ({
  id: "e1",
  actorId: "doctor-1",
  category: "reminder",
  audienceFilter: "with_telegram",
  messageTitle: "Напоминание о приёме",
  messageBody: "Текст напоминания",
  deliveryJobsTotal: 0,
  channels: ["telegram", "sms"],
  executedAt: "2026-03-31T10:05:00.000Z",
  previewOnly: false,
  audienceSize: 30,
  sentCount: 0,
  errorCount: 0,
  blockedRecipientCount: 0,
  attachMenuAfterSend: false,
  ...overrides,
});

describe("BroadcastsTab", () => {
  async function setup() {
    lastBroadcastFormProps = {};
    lastBroadcastAuditLogProps = {};
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

  // ----- onCreateFrom / prefill wiring -----

  it("passes onCreateFrom to BroadcastAuditLog after data loads", async () => {
    const BroadcastsTab = await setup();
    render(<BroadcastsTab deepLinkParams={{}} onDeepLinkChange={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("BroadcastAuditLog")).toBeInTheDocument();
    });
    expect(typeof lastBroadcastAuditLogProps.onCreateFrom).toBe("function");
  });

  it("calling onCreateFrom sets prefill on BroadcastForm with entry and nonce=1", async () => {
    const BroadcastsTab = await setup();
    render(<BroadcastsTab deepLinkParams={{}} onDeepLinkChange={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("BroadcastAuditLog")).toBeInTheDocument();
    });

    const entry = makeEntry();
    const onCreateFrom = lastBroadcastAuditLogProps.onCreateFrom as (e: BroadcastAuditEntry) => void;
    await userEvent.click(screen.getByText("BroadcastForm")); // ensure component exists
    onCreateFrom(entry);

    await waitFor(() => {
      const prefill = lastBroadcastFormProps.prefill as { entry: BroadcastAuditEntry; nonce: number } | undefined;
      expect(prefill).toBeDefined();
      expect(prefill?.entry).toEqual(entry);
      expect(prefill?.nonce).toBe(1);
    });
  });

  it("calling onCreateFrom twice increments nonce (idempotency)", async () => {
    const BroadcastsTab = await setup();
    render(<BroadcastsTab deepLinkParams={{}} onDeepLinkChange={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("BroadcastAuditLog")).toBeInTheDocument();
    });

    const entry = makeEntry();
    const onCreateFrom = lastBroadcastAuditLogProps.onCreateFrom as (e: BroadcastAuditEntry) => void;
    onCreateFrom(entry);
    await waitFor(() => {
      const prefill = lastBroadcastFormProps.prefill as { nonce: number } | undefined;
      expect(prefill?.nonce).toBe(1);
    });
    onCreateFrom(entry);
    await waitFor(() => {
      const prefill = lastBroadcastFormProps.prefill as { nonce: number } | undefined;
      expect(prefill?.nonce).toBe(2);
    });
  });
});
