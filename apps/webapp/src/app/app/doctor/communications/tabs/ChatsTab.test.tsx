/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ChatsTab } from "./ChatsTab";

// Перехватываем DoctorSupportInbox — проверяем проброс isActive → active (управление поллингом)
// и deep-link ?id= ↔ выбранный диалог (#812).
const receivedProps = vi.hoisted(() => ({
  current: null as {
    active?: boolean;
    initialSelectedConversationId?: string | null;
    onSelectedConversationChange?: (id: string | null) => void;
  } | null,
}));
vi.mock("../../messages/DoctorSupportInbox", () => ({
  DoctorSupportInbox: (props: {
    active?: boolean;
    initialSelectedConversationId?: string | null;
    onSelectedConversationChange?: (id: string | null) => void;
  }) => {
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

describe("ChatsTab (deep-link ?id= passthrough, #812)", () => {
  it("passes deepLinkParams.id as initialSelectedConversationId", () => {
    render(<ChatsTab deepLinkParams={{ id: "conv-1" }} onDeepLinkChange={() => {}} />);
    expect(receivedProps.current?.initialSelectedConversationId).toBe("conv-1");
  });

  it("passes null when deepLinkParams has no id", () => {
    render(<ChatsTab deepLinkParams={{}} onDeepLinkChange={() => {}} />);
    expect(receivedProps.current?.initialSelectedConversationId).toBeNull();
  });

  it("onSelectedConversationChange forwards to onDeepLinkChange('id', …)", () => {
    const onDeepLinkChange = vi.fn();
    render(<ChatsTab deepLinkParams={{}} onDeepLinkChange={onDeepLinkChange} />);
    receivedProps.current?.onSelectedConversationChange?.("conv-2");
    expect(onDeepLinkChange).toHaveBeenCalledWith("id", "conv-2");
    receivedProps.current?.onSelectedConversationChange?.(null);
    expect(onDeepLinkChange).toHaveBeenCalledWith("id", null);
  });
});
