/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ChatsTab } from "./ChatsTab";

// Перехватываем DoctorSupportInbox — проверяем проброс isActive → active (управление поллингом).
const receivedProps = vi.hoisted(() => ({ current: null as { active?: boolean } | null }));
vi.mock("../../messages/DoctorSupportInbox", () => ({
  DoctorSupportInbox: (props: { active?: boolean }) => {
    receivedProps.current = props;
    return <div data-testid="support-inbox" />;
  },
}));

describe("ChatsTab (isActive → active passthrough)", () => {
  const noop = () => {};

  it("passes isActive=false → active=false (poll off when tab inactive)", () => {
    render(<ChatsTab deepLinkParams={{}} onDeepLinkChange={noop} isActive={false} />);
    expect(receivedProps.current?.active).toBe(false);
  });

  it("passes isActive=true → active=true", () => {
    render(<ChatsTab deepLinkParams={{}} onDeepLinkChange={noop} isActive={true} />);
    expect(receivedProps.current?.active).toBe(true);
  });

  it("defaults active=true when isActive is undefined (standalone use)", () => {
    render(<ChatsTab deepLinkParams={{}} onDeepLinkChange={noop} />);
    expect(receivedProps.current?.active).toBe(true);
  });
});
