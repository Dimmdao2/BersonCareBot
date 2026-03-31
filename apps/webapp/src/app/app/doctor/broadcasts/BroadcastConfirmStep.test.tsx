/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BroadcastConfirmStep } from "./BroadcastConfirmStep";
import type { BroadcastAuditEntry, BroadcastCommand, BroadcastPreviewResult } from "@/modules/doctor-broadcasts/ports";

const preview: BroadcastPreviewResult = {
  audienceSize: 42,
  category: "reminder",
  audienceFilter: "with_telegram",
};

const command: Omit<BroadcastCommand, "actorId"> = {
  category: "reminder",
  audienceFilter: "with_telegram",
  message: { title: "Заголовок теста", body: "Текст тела сообщения" },
};

describe("BroadcastConfirmStep", () => {
  it("shows audience size from preview", () => {
    render(
      <BroadcastConfirmStep
        preview={preview}
        command={command}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isLoading={false}
        result={null}
      />
    );
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    render(
      <BroadcastConfirmStep
        preview={preview}
        command={command}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        isLoading={false}
        result={null}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /отправить/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when back button is clicked", async () => {
    const onCancel = vi.fn();
    render(
      <BroadcastConfirmStep
        preview={preview}
        command={command}
        onConfirm={vi.fn()}
        onCancel={onCancel}
        isLoading={false}
        result={null}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /назад/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("disables both buttons when isLoading is true", () => {
    render(
      <BroadcastConfirmStep
        preview={preview}
        command={command}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isLoading={true}
        result={null}
      />
    );
    expect(screen.getByRole("button", { name: /отправка/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /назад/i })).toBeDisabled();
  });

  it("shows sent message when result is provided", () => {
    const auditEntry: BroadcastAuditEntry = {
      id: "e1",
      actorId: "doc-1",
      category: "reminder",
      audienceFilter: "with_telegram",
      messageTitle: "Заголовок теста",
      executedAt: new Date().toISOString(),
      previewOnly: false,
      audienceSize: 42,
      sentCount: 0,
      errorCount: 0,
    };
    render(
      <BroadcastConfirmStep
        preview={preview}
        command={command}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isLoading={false}
        result={auditEntry}
      />
    );
    expect(screen.getByText(/рассылка запущена/i)).toBeInTheDocument();
  });
});
