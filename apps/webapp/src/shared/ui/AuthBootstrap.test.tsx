/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";
import { AuthBootstrap } from "./AuthBootstrap";

const mockReplace = vi.fn();
const mockRefresh = vi.fn();
const mockUseSearchParams = vi.fn(() => new URLSearchParams("ctx=bot"));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
  useSearchParams: () => mockUseSearchParams(),
}));

describe("AuthBootstrap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReplace.mockClear();
    mockRefresh.mockClear();
    document.cookie = `${PLATFORM_COOKIE_NAME}=; path=/; max-age=0`;
    mockUseSearchParams.mockReturnValue(new URLSearchParams("ctx=bot"));
    window.history.pushState({}, "", "/?ctx=bot");
    delete (window as unknown as { Telegram?: unknown }).Telegram;
    delete (window as unknown as { WebApp?: unknown }).WebApp;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete (window as unknown as { Telegram?: unknown }).Telegram;
    delete (window as unknown as { WebApp?: unknown }).WebApp;
  });

  it.skip("в обычном браузере без ctx после таймаута показывает телефонный флоу", async () => {
    // Отключено: по политике miniapp-аудита на `/app` не включаем телефонный AuthFlowV2 из этого сценария.
    mockUseSearchParams.mockReturnValue(new URLSearchParams(""));
    window.history.pushState({}, "", "/");
    render(<AuthBootstrap entryClassification="browser_interactive" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    expect(screen.getByText(/укажите номер телефона/i)).toBeInTheDocument();
  });

  it("при устаревшем bot-cookie в обычном браузере сбрасывает cookie и показывает веб-вход (телефон)", async () => {
    document.cookie = `${PLATFORM_COOKIE_NAME}=bot; path=/`;
    mockUseSearchParams.mockReturnValue(new URLSearchParams(""));
    window.history.pushState({}, "", "/");
    (window as Window & { Telegram?: { WebApp?: { platform: string; initData?: string } } }).Telegram = {
      WebApp: { platform: "web", initData: "" },
    };

    render(<AuthBootstrap entryClassification="browser_interactive" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByText(/укажите номер телефона/i)).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(document.cookie).not.toMatch(new RegExp(`${PLATFORM_COOKIE_NAME}=bot`));
  });

  it("при устаревшем bot-cookie без window.Telegram сразу сбрасывает cookie и показывает веб-вход", async () => {
    document.cookie = `${PLATFORM_COOKIE_NAME}=bot; path=/`;
    mockUseSearchParams.mockReturnValue(new URLSearchParams(""));
    window.history.pushState({}, "", "/");
    delete (window as unknown as { Telegram?: unknown }).Telegram;

    render(<AuthBootstrap entryClassification="browser_interactive" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByText(/укажите номер телефона/i)).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(document.cookie).not.toMatch(new RegExp(`${PLATFORM_COOKIE_NAME}=bot`));
  });

  it("в обычном браузере без ctx не ждёт grace MAX bridge и показывает веб-вход", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams(""));
    window.history.pushState({}, "", "/");
    document.cookie = `${PLATFORM_COOKIE_NAME}=; path=/; max-age=0`;

    render(<AuthBootstrap entryClassification="browser_interactive" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByText(/укажите номер телефона/i)).toBeInTheDocument();
  });

  it("в обычном браузере с загруженным MAX bridge не зависает в miniapp-ожидании", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams(""));
    window.history.pushState({}, "", "/");
    document.cookie = `${PLATFORM_COOKIE_NAME}=; path=/; max-age=0`;
    (window as Window & { WebApp?: { ready?: () => void; initData?: string } }).WebApp = {
      ready: () => undefined,
      initData: "",
    };

    render(<AuthBootstrap entryClassification="browser_interactive" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(screen.getByText(/укажите номер телефона/i)).toBeInTheDocument();
  });

  it("в обычном браузере с ?t=dev:admin&switch=1 без Telegram.WebApp обменивает токен после TOKEN_FALLBACK_MS", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("t=dev:admin&switch=1"));
    window.history.pushState({}, "", "/?t=dev:admin&switch=1");
    document.cookie = `${PLATFORM_COOKIE_NAME}=; path=/; max-age=0`;
    delete (window as unknown as { Telegram?: unknown }).Telegram;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/auth/exchange")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ token: "dev:admin" });
        return new Response(
          JSON.stringify({ ok: true, role: "admin", redirectTo: "/app/doctor" }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthBootstrap entryClassification="token_exchange" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/exchange",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockReplace).toHaveBeenCalled();
  });

  it("при ctx=bot не показывает телефонный флоу после таймаута initData и даёт Повторить", async () => {
    render(<AuthBootstrap entryClassification="telegram_miniapp" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    expect(screen.queryByText(/укажите номер телефона/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /повторить/i })).toBeInTheDocument();
    expect(screen.getByText(/Не удалось получить данные для входа/i)).toBeInTheDocument();
  });

  it("при ошибке telegram-init в ctx=bot показывает Повторить и повторяет POST после retry", async () => {
    vi.useRealTimers();
    (window as Window & { Telegram?: { WebApp?: { initData: string } } }).Telegram = {
      WebApp: { initData: "fake-init-data" },
    };
    let telegramInitPosts = 0;
    let telegramInitShouldFail = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("telegram-init")) {
        telegramInitPosts += 1;
        if (telegramInitShouldFail) {
          return new Response(JSON.stringify({ ok: false, error: "access_denied" }), { status: 403 });
        }
      }
      if (url.includes("telegram-login/config")) {
        return new Response(JSON.stringify({ ok: true, botUsername: "testcarebot" }), { status: 200 });
      }
      if (url.includes("alternatives-config")) {
        return new Response(JSON.stringify({ ok: true, maxBotOpenUrl: "https://max.ru/test_bot" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ ok: true, role: "client", redirectTo: "/app/patient" }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthBootstrap entryClassification="telegram_miniapp" />);

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /повторить/i })).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
    expect(screen.getByText(/Активируйте бота/i)).toBeInTheDocument();
    expect(telegramInitPosts).toBeGreaterThanOrEqual(1);

    await act(async () => {
      telegramInitShouldFail = false;
      fireEvent.click(screen.getByRole("button", { name: /повторить/i }));
    });

    await waitFor(
      () => {
        expect(telegramInitPosts).toBeGreaterThanOrEqual(2);
      },
      { timeout: 4000 },
    );
    vi.useFakeTimers();
  });
});
