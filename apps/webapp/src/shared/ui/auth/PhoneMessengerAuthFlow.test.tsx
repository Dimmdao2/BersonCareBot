/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneMessengerAuthFlow } from "./PhoneMessengerAuthFlow";

const finishNav = vi.hoisted(() => vi.fn());

vi.mock("@/shared/lib/telegramChannelLinkOpen", () => ({
  finishChannelLinkNavigation: (...args: unknown[]) => finishNav(...args),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

function jsonRes(data: unknown, init?: { ok?: boolean; status?: number }) {
  const ok = init?.ok ?? true;
  const status = init?.status ?? (ok ? 200 : 400);
  return Promise.resolve({ ok, status, json: async () => data });
}

describe("PhoneMessengerAuthFlow", () => {
  beforeEach(() => {
    finishNav.mockClear();
    sessionStorage.clear();
    vi.stubGlobal("crypto", { randomUUID: () => "test-chat-id" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows back button on phone step for login by default", () => {
    render(<PhoneMessengerAuthFlow purpose="login" onBack={() => {}} />);
    expect(screen.getByRole("button", { name: "Назад" })).toBeInTheDocument();
  });

  it("hides back button on phone step when hideBackOnPhoneStep is set", () => {
    render(<PhoneMessengerAuthFlow purpose="profile_bind" hideBackOnPhoneStep onBack={() => {}} />);
    expect(screen.queryByRole("button", { name: "Назад" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Номер телефона")).toBeInTheDocument();
  });

  it("shows messenger pick when check-phone has no binding", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/check-phone")) {
          return jsonRes({ ok: true, exists: false, methods: { sms: false } });
        }
        throw new Error(`unexpected: ${url}`);
      }),
    );

    render(<PhoneMessengerAuthFlow purpose="login" onBack={() => {}} />);
    await user.type(screen.getByLabelText("Номер телефона"), "9991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(await screen.findByRole("button", { name: "Telegram" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Max" })).toBeInTheDocument();
  });

  it("polls status until otp_ready after messenger bind start", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/check-phone")) {
          return jsonRes({ ok: true, exists: false, methods: { sms: false } });
        }
        if (url.includes("/api/auth/phone/messenger-bind/start")) {
          return jsonRes({
            ok: true,
            setupToken: "auth_test",
            url: "https://t.me/bot?start=auth_test",
          });
        }
        if (url.includes("/api/auth/phone/messenger-bind/status")) {
          statusCalls += 1;
          return jsonRes({
            ok: true,
            status: "otp_ready",
            challengeId: "ch-1",
            retryAfterSeconds: 60,
          });
        }
        throw new Error(`unexpected: ${url}`);
      }),
    );

    render(<PhoneMessengerAuthFlow purpose="login" onBack={() => {}} />);
    await user.type(screen.getByLabelText("Номер телефона"), "9991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await user.click(await screen.findByRole("button", { name: "Telegram" }));

    expect(finishNav).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Код подтверждения")).toBeInTheDocument());
    expect(statusCalls).toBeGreaterThanOrEqual(1);
  });

  it("profile_bind calls onProfileComplete without redirect", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/check-phone")) {
          return jsonRes({
            ok: true,
            exists: true,
            methods: { sms: false, telegram: true },
          });
        }
        if (url.includes("/api/auth/phone/start")) {
          return jsonRes({ ok: true, challengeId: "ch-2", retryAfterSeconds: 60 });
        }
        if (url.includes("/api/auth/phone/confirm")) {
          return jsonRes({ ok: true });
        }
        throw new Error(`unexpected: ${url}`);
      }),
    );

    render(
      <PhoneMessengerAuthFlow purpose="profile_bind" onBack={() => {}} onProfileComplete={onComplete} />,
    );
    await user.type(screen.getByLabelText("Номер телефона"), "9991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await screen.findByLabelText("Код подтверждения");
    await user.type(screen.getByLabelText("Код подтверждения"), "123456");
    await user.click(screen.getByRole("button", { name: "Подтвердить" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it("uses phone/start when messenger already bound (no messenger-bind)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/check-phone")) {
        return jsonRes({
          ok: true,
          exists: true,
          methods: { sms: false, telegram: true },
        });
      }
      if (url.includes("/api/auth/phone/start")) {
        return jsonRes({ ok: true, challengeId: "ch-bound", retryAfterSeconds: 60 });
      }
      throw new Error(`unexpected: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PhoneMessengerAuthFlow purpose="login" onBack={() => {}} />);
    await user.type(screen.getByLabelText("Номер телефона"), "9991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    await screen.findByLabelText("Код подтверждения");
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/api/auth/phone/start"))).toBe(true);
    expect(urls.some((u) => u.includes("/api/auth/phone/messenger-bind/start"))).toBe(false);
  });

  it("falls back to messenger pick when phone/start returns channel_unavailable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/check-phone")) {
          return jsonRes({
            ok: true,
            exists: true,
            methods: { sms: false, telegram: true, max: true },
          });
        }
        if (url.includes("/api/auth/phone/start")) {
          return jsonRes({ ok: false, error: "channel_unavailable" });
        }
        throw new Error(`unexpected: ${url}`);
      }),
    );

    render(<PhoneMessengerAuthFlow purpose="login" onBack={() => {}} />);
    await user.type(screen.getByLabelText("Номер телефона"), "9991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(await screen.findByRole("button", { name: "Telegram" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Max" })).toBeInTheDocument();
  });

  it("clears poll interval on unmount", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/check-phone")) {
          return jsonRes({ ok: true, exists: false, methods: { sms: false } });
        }
        if (url.includes("/api/auth/phone/messenger-bind/start")) {
          return jsonRes({
            ok: true,
            setupToken: "auth_test",
            url: "https://t.me/bot?start=auth_test",
          });
        }
        if (url.includes("/api/auth/phone/messenger-bind/status")) {
          return new Promise(() => {});
        }
        throw new Error(`unexpected: ${url}`);
      }),
    );

    const { unmount } = render(<PhoneMessengerAuthFlow purpose="login" onBack={() => {}} />);
    await user.type(screen.getByLabelText("Номер телефона"), "9991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await user.click(await screen.findByRole("button", { name: "Telegram" }));

    await waitFor(() => expect(setIntervalSpy).toHaveBeenCalled());
    unmount();
    cleanup();
    expect(clearIntervalSpy).toHaveBeenCalled();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
