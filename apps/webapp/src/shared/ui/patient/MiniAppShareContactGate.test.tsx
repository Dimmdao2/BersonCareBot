/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mockPathname = vi.fn(() => "/app/patient");
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { MiniAppShareContactGate } from "./MiniAppShareContactGate";

describe("MiniAppShareContactGate", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPathname.mockReturnValue("/app/patient");
    (window as unknown as { Telegram?: { WebApp?: { initData: string } } }).Telegram = {
      WebApp: { initData: "mock-init-data" },
    };
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.useRealTimers();
    vi.clearAllMocks();
    delete (window as unknown as { Telegram?: unknown }).Telegram;
    delete (window as unknown as { WebApp?: unknown }).WebApp;
  });

  it("renders children when /api/me has phone", async () => {
    globalThis.fetch = vi.fn(async (url: string | Request) => {
      const u = typeof url === "string" ? url : (url as Request).url;
      if (u.includes("/api/me")) {
        return new Response(
          JSON.stringify({
            ok: true,
            user: { phone: "+79990001122", bindings: { telegramId: "123" } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (u.includes("/api/auth/telegram-login/config")) {
        return new Response(JSON.stringify({ ok: true, botUsername: "test_bot" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    render(
      <MiniAppShareContactGate>
        <div data-testid="inner">Inside</div>
      </MiniAppShareContactGate>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("inner")).toBeInTheDocument();
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows gate when telegram session has no phone", async () => {
    globalThis.fetch = vi.fn(async (url: string | Request) => {
      const u = typeof url === "string" ? url : (url as Request).url;
      if (u.includes("/api/me")) {
        return new Response(
          JSON.stringify({
            ok: true,
            user: { phone: "", bindings: { telegramId: "123" } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (u.includes("/api/auth/telegram-login/config")) {
        return new Response(JSON.stringify({ ok: true, botUsername: "test_bot" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    render(
      <MiniAppShareContactGate>
        <div data-testid="inner">Inside</div>
      </MiniAppShareContactGate>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("inner")).not.toBeInTheDocument();
  });

  it("calls telegram-init when /api/me is 401 then shows contact gate (deep link without /app login)", async () => {
    let meCalls = 0;
    globalThis.fetch = vi.fn(async (url: string | Request) => {
      const u = typeof url === "string" ? url : (url as Request).url;
      if (u.includes("/api/me")) {
        meCalls += 1;
        if (meCalls === 1) {
          return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
        }
        return new Response(
          JSON.stringify({
            ok: true,
            user: { phone: null, bindings: { telegramId: "123" } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (u.includes("/api/auth/telegram-init")) {
        return new Response(JSON.stringify({ ok: true, role: "client", redirectTo: "/app/patient" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("/api/auth/telegram-login/config")) {
        return new Response(JSON.stringify({ ok: true, botUsername: "test_bot" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    render(
      <MiniAppShareContactGate>
        <div data-testid="inner">Inside</div>
      </MiniAppShareContactGate>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/telegram-init"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("calls auth exchange when /api/me is 401 and URL has token (Max-style deep link)", async () => {
    delete (window as unknown as { Telegram?: unknown }).Telegram;
    (window as unknown as { WebApp?: { ready: () => void } }).WebApp = { ready: () => {} };
    const origSearch = window.location.search;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, search: "?t=max-entry-token" },
    });

    globalThis.fetch = vi.fn(async (url: string | Request) => {
      const u = typeof url === "string" ? url : (url as Request).url;
      if (u.includes("/api/me")) {
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
      }
      if (u.includes("/api/auth/exchange")) {
        return new Response(JSON.stringify({ ok: true, role: "client", redirectTo: "/app/patient" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    render(
      <MiniAppShareContactGate>
        <div data-testid="inner">Inside</div>
      </MiniAppShareContactGate>,
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/exchange"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, search: origSearch },
    });
    delete (window as unknown as { WebApp?: unknown }).WebApp;
  });

  it("skips gate on bind-phone path", async () => {
    mockPathname.mockReturnValue("/app/patient/bind-phone");

    globalThis.fetch = vi.fn(async (url: string | Request) => {
      const u = typeof url === "string" ? url : (url as Request).url;
      if (u.includes("/api/me")) {
        return new Response(
          JSON.stringify({
            ok: true,
            user: { bindings: { telegramId: "1" } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    render(
      <MiniAppShareContactGate>
        <div data-testid="inner">X</div>
      </MiniAppShareContactGate>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("inner")).toBeInTheDocument();
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
