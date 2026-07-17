/** @vitest-environment jsdom */
/**
 * Deep-link key isolation через РЕАЛЬНЫЙ COMMUNICATIONS_TAB_REGISTRY (#812 audit).
 *
 * Шелл (readDeepLinksFromSearchParams) копирует URL-ключ в КАЖДЫЙ таб, объявивший его
 * в deepLinkKeys — без namespacing по табам. Если два таба объявят один ключ, значение
 * протекает между ними (live-баг: chats объявил intake-овский "id" → conversationId
 * уезжал в intake как request-id → stray GET /api/doctor/online-intake/<convId> 404).
 *
 * В отличие от DoctorCommunicationsShell.test.tsx (реестр замокан целиком со своими
 * deepLinkKeys), здесь реестр НАСТОЯЩИЙ — тест сломается, если реальные ключи снова
 * пересекутся. Тяжёлые компоненты табов подменены лёгкими стабами через моки их
 * модулей: реальные loader'ы реестра резолвятся в стабы, ключи остаются боевыми.
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { Suspense } from "react";
import type { CommunicationsTabProps } from "./communicationsTabRegistry";

// ---------------------------------------------------------------------------
// Стабы КОМПОНЕНТОВ табов (не реестра!) — каждый печатает свои deepLinkParams.
// ---------------------------------------------------------------------------
function makeTabStub(tabId: string) {
  return function TabStub({ deepLinkParams }: CommunicationsTabProps) {
    return (
      <div data-testid={`tab-${tabId}`} data-deep-links={JSON.stringify(deepLinkParams)} />
    );
  };
}

vi.mock("./tabs/ChatsTab", () => ({ ChatsTab: makeTabStub("chats") }));
vi.mock("./tabs/CommentsTab", () => ({ CommentsTab: makeTabStub("comments") }));
vi.mock("./tabs/IntakeTab", () => ({ IntakeTab: makeTabStub("intake") }));
vi.mock("./tabs/BroadcastsTab", () => ({ BroadcastsTab: makeTabStub("broadcasts") }));

vi.mock("next/dynamic", () => ({
  default: (importFn: () => Promise<{ default: React.ComponentType<unknown> }>) =>
    React.lazy(importFn),
}));

vi.mock("@/shared/ui/doctor/DoctorAppShell", () => ({
  DoctorAppShell: ({ children }: { children: React.ReactNode; title: string }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("@/shared/ui/doctor/shell/DoctorPageHeader", () => ({
  DoctorPageHeader: ({ tabs }: { tabs?: React.ReactNode }) => (
    <div data-testid="page-header">{tabs}</div>
  ),
}));

// Прогрев ленивых чанков (правило webapp-tests-lean-no-bloat)
beforeAll(async () => {
  const { COMMUNICATIONS_TAB_REGISTRY } = await import("./communicationsTabRegistry");
  await Promise.all(COMMUNICATIONS_TAB_REGISTRY.map((e) => e.loader()));
}, 5000);

import { DoctorCommunicationsShell } from "./DoctorCommunicationsShell";

function renderShell(
  props: Partial<React.ComponentProps<typeof DoctorCommunicationsShell>> = {},
) {
  return render(
    <Suspense fallback={<div data-testid="suspense-fallback" />}>
      <DoctorCommunicationsShell {...props} />
    </Suspense>,
  );
}

async function readTabDeepLinks(tabId: string): Promise<Record<string, string>> {
  const el = await screen.findByTestId(`tab-${tabId}`);
  return JSON.parse(el.getAttribute("data-deep-links") ?? "{}") as Record<string, string>;
}

describe("DoctorCommunicationsShell — deep-link isolation (real registry)", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/app/doctor/communications");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("?tab=chats&chatId=… populates ONLY chats; intake gets no params after switch", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/app/doctor/communications?tab=chats&chatId=conv-1");
    renderShell({ initialTab: "chats" });

    expect(await readTabDeepLinks("chats")).toEqual({ chatId: "conv-1" });

    // Открываем intake — chatId НЕ должен утечь туда как request-id.
    await user.click(screen.getByTestId("btn-intake"));
    expect(await readTabDeepLinks("intake")).toEqual({});
  });

  it("?tab=intake&id=… populates ONLY intake; chats gets no params after switch", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/app/doctor/communications?tab=intake&id=req-9");
    renderShell({ initialTab: "intake" });

    expect(await readTabDeepLinks("intake")).toEqual({ id: "req-9" });

    await user.click(screen.getByTestId("btn-chats"));
    expect(await readTabDeepLinks("chats")).toEqual({});
  });

  it("switching back to chats restores its ?chatId= in the URL", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/app/doctor/communications?tab=chats&chatId=conv-2");
    renderShell({ initialTab: "chats" });

    await screen.findByTestId("tab-chats");
    const replaceSpy = vi.spyOn(window.history, "replaceState");

    await user.click(screen.getByTestId("btn-intake"));
    await screen.findByTestId("tab-intake");
    await user.click(screen.getByTestId("btn-chats"));

    await waitFor(() => {
      expect(replaceSpy).toHaveBeenLastCalledWith(
        null,
        "",
        expect.stringContaining("tab=chats&chatId=conv-2"),
      );
    });
  });
});
