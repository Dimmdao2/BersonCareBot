/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntakeTab } from "./IntakeTab";

// Перехватываем DoctorOnlineIntakeClient, чтобы проверить проброс deep-link ?id=
// (стык шелл↔таб; шелл-тест мокает реестр стабами, поэтому реальную обёртку не покрывает).
const receivedProps = vi.hoisted(() => ({
  current: null as { initialOpenRequestId?: string | null; onDetailChange?: (id: string | null) => void } | null,
}));
vi.mock("../../online-intake/DoctorOnlineIntakeClient", () => ({
  DoctorOnlineIntakeClient: (props: {
    initialOpenRequestId?: string | null;
    onDetailChange?: (id: string | null) => void;
  }) => {
    receivedProps.current = props;
    return (
      <div data-testid="intake-client">
        <button data-testid="open-detail" onClick={() => props.onDetailChange?.("req-xyz")}>
          open
        </button>
        <button data-testid="close-detail" onClick={() => props.onDetailChange?.(null)}>
          close
        </button>
      </div>
    );
  },
}));

describe("IntakeTab (deep-link ?id= wiring)", () => {
  const noop = () => {};

  it("passes deepLinkParams.id → initialOpenRequestId", () => {
    render(
      <IntakeTab deepLinkParams={{ id: "req-123" }} onDeepLinkChange={noop} />,
    );
    expect(receivedProps.current?.initialOpenRequestId).toBe("req-123");
  });

  it("passes null initialOpenRequestId when id absent", () => {
    render(<IntakeTab deepLinkParams={{}} onDeepLinkChange={noop} />);
    expect(receivedProps.current?.initialOpenRequestId).toBeNull();
  });

  it("opening detail writes onDeepLinkChange('id', <id>)", async () => {
    const onChange = vi.fn();
    render(<IntakeTab deepLinkParams={{}} onDeepLinkChange={onChange} />);
    await userEvent.click(screen.getByTestId("open-detail"));
    expect(onChange).toHaveBeenCalledWith("id", "req-xyz");
  });

  it("closing detail writes onDeepLinkChange('id', null)", async () => {
    const onChange = vi.fn();
    render(<IntakeTab deepLinkParams={{ id: "req-1" }} onDeepLinkChange={onChange} />);
    await userEvent.click(screen.getByTestId("close-detail"));
    expect(onChange).toHaveBeenCalledWith("id", null);
  });
});
