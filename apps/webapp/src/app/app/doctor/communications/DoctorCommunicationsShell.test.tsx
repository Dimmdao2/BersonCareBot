/** @vitest-environment jsdom */
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { Suspense } from "react";
import type { CommunicationsTabProps } from "./communicationsTabRegistry";

// ---------------------------------------------------------------------------
// Мокаем реестр табов — мгновенно резолвящиеся стабы с data-testid
// ---------------------------------------------------------------------------
vi.mock("./communicationsTabRegistry", () => ({
  COMMUNICATIONS_TAB_REGISTRY: [
    {
      id: "chats",
      loader: async () => ({
        default: function ChatsStub() {
          return <div data-testid="tab-chats" />;
        },
      }),
      deepLinkKeys: [],
    },
    {
      id: "intake",
      loader: async () => ({
        default: function IntakeStub({ deepLinkParams, onDeepLinkChange }: CommunicationsTabProps) {
          return (
            <div data-testid="tab-intake">
              {deepLinkParams.id ? (
                <span data-testid="intake-deep-id">{deepLinkParams.id}</span>
              ) : null}
              <button
                data-testid="intake-set-id"
                onClick={() => onDeepLinkChange("id", "req-abc")}
              >
                set-id
              </button>
            </div>
          );
        },
      }),
      deepLinkKeys: ["id"],
    },
    {
      id: "comments",
      loader: async () => ({
        default: function CommentsStub() {
          return <div data-testid="tab-comments" />;
        },
      }),
      deepLinkKeys: [],
    },
    {
      id: "broadcasts",
      loader: async () => ({
        default: function BroadcastsStub({
          deepLinkParams,
          onDeepLinkChange,
        }: CommunicationsTabProps) {
          return (
            <div data-testid="tab-broadcasts">
              {deepLinkParams.archive ? (
                <span data-testid="broadcasts-archive">{deepLinkParams.archive}</span>
              ) : null}
              <button
                data-testid="broadcasts-set-archive"
                onClick={() => onDeepLinkChange("archive", "1")}
              >
                set-archive
              </button>
            </div>
          );
        },
      }),
      deepLinkKeys: ["archive"],
    },
  ],
}));

// ---------------------------------------------------------------------------
// next/dynamic → React.lazy (резолвится асинхронно, но очень быстро)
// ---------------------------------------------------------------------------
vi.mock("next/dynamic", () => ({
  default: (importFn: () => Promise<{ default: React.ComponentType<unknown> }>) =>
    React.lazy(importFn),
}));

// ---------------------------------------------------------------------------
// DoctorAppShell — тонкая обёртка (не тащим CSS-зависимости)
// ---------------------------------------------------------------------------
vi.mock("@/shared/ui/doctor/DoctorAppShell", () => ({
  DoctorAppShell: ({ children }: { children: React.ReactNode; title: string }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

// ---------------------------------------------------------------------------
// DoctorPageHeader — рендерим title + tabs slot (inline CommunicationsTabsNav
// теперь передаётся через tabs-проп, а не через отдельный компонент).
// ---------------------------------------------------------------------------
vi.mock("@/shared/ui/doctor/shell/DoctorPageHeader", () => ({
  DoctorPageHeader: ({
    tabs,
  }: {
    title?: React.ReactNode;
    tabs?: React.ReactNode;
    subtitle?: React.ReactNode;
    toolbar?: React.ReactNode;
  }) => <div data-testid="page-header">{tabs}</div>,
}));

// ---------------------------------------------------------------------------
// Прогрев ленивых чанков в beforeAll (правило webapp-tests-lean-no-bloat)
// ---------------------------------------------------------------------------
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

describe("DoctorCommunicationsShell", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/app/doctor/communications");
    vi.spyOn(window.history, "replaceState");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // e3b: рендер и keepMounted
  // -------------------------------------------------------------------------

  it("рендерит таб-нав и дефолтный таб (chats)", async () => {
    renderShell();
    expect(await screen.findByTestId("tabs-nav")).toBeInTheDocument();
    expect(await screen.findByTestId("tab-chats")).toBeInTheDocument();
  });

  it("respects initialTab prop", async () => {
    renderShell({ initialTab: "intake" });
    expect(await screen.findByTestId("tab-intake")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-chats")).not.toBeInTheDocument();
  });

  it("keepMounted: переключение на другой таб не размонтирует предыдущий", async () => {
    const user = userEvent.setup();
    renderShell({ initialTab: "chats" });

    // Дожидаемся монтирования chats
    expect(await screen.findByTestId("tab-chats")).toBeInTheDocument();

    // Переключаемся на intake
    await user.click(screen.getByTestId("btn-intake"));

    // Intake появился
    expect(await screen.findByTestId("tab-intake")).toBeInTheDocument();

    // Chats всё ещё в DOM (keepMounted)
    expect(screen.getByTestId("tab-chats")).toBeInTheDocument();
  });

  it("неактивный таб скрыт атрибутом hidden", async () => {
    const user = userEvent.setup();
    renderShell({ initialTab: "chats" });

    await screen.findByTestId("tab-chats");
    await user.click(screen.getByTestId("btn-intake"));
    await screen.findByTestId("tab-intake");

    // Обёртка chats должна иметь hidden
    const chatsWrapper = screen.getByTestId("tab-chats").closest("div[hidden]");
    expect(chatsWrapper).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // e3c: URL-sync
  // -------------------------------------------------------------------------

  it("переключение таба вызывает history.replaceState с ?tab=<id>", async () => {
    const user = userEvent.setup();
    renderShell({ initialTab: "chats" });

    await screen.findByTestId("tab-chats");
    await user.click(screen.getByTestId("btn-intake"));

    await waitFor(() => {
      expect(window.history.replaceState).toHaveBeenCalledWith(
        null,
        "",
        expect.stringContaining("tab=intake"),
      );
    });
  });

  it("переключение не перемонтирует уже открытый таб", async () => {
    const user = userEvent.setup();
    renderShell({ initialTab: "chats" });

    await screen.findByTestId("tab-chats");

    // Открываем intake → назад к chats
    await user.click(screen.getByTestId("btn-intake"));
    await screen.findByTestId("tab-intake");

    await user.click(screen.getByTestId("btn-chats"));
    await screen.findByTestId("tab-chats");

    // Оба таба в DOM
    expect(screen.getByTestId("tab-chats")).toBeInTheDocument();
    expect(screen.getByTestId("tab-intake")).toBeInTheDocument();
  });

  it("читает ?id из URL и передаёт в intake-таб", async () => {
    window.history.pushState(
      null,
      "",
      "/app/doctor/communications?tab=intake&id=req-123",
    );
    renderShell({ initialTab: "intake" });

    await screen.findByTestId("tab-intake");
    await waitFor(() => {
      expect(screen.getByTestId("intake-deep-id")).toHaveTextContent("req-123");
    });
  });

  it("onDeepLinkChange(id) обновляет URL через replaceState", async () => {
    const user = userEvent.setup();
    renderShell({ initialTab: "intake" });

    await screen.findByTestId("tab-intake");
    await user.click(screen.getByTestId("intake-set-id"));

    await waitFor(() => {
      expect(window.history.replaceState).toHaveBeenCalledWith(
        null,
        "",
        expect.stringContaining("id=req-abc"),
      );
    });
  });

  it("broadcasts: onDeepLinkChange(archive) обновляет URL", async () => {
    const user = userEvent.setup();
    renderShell({ initialTab: "broadcasts" });

    await screen.findByTestId("tab-broadcasts");
    await user.click(screen.getByTestId("broadcasts-set-archive"));

    await waitFor(() => {
      expect(window.history.replaceState).toHaveBeenCalledWith(
        null,
        "",
        expect.stringContaining("archive=1"),
      );
    });
  });

  it("читает ?archive из URL и передаёт в broadcasts-таб", async () => {
    window.history.pushState(
      null,
      "",
      "/app/doctor/communications?tab=broadcasts&archive=1",
    );
    renderShell({ initialTab: "broadcasts" });

    await screen.findByTestId("tab-broadcasts");
    await waitFor(() => {
      expect(screen.getByTestId("broadcasts-archive")).toHaveTextContent("1");
    });
  });
});
