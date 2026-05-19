/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthFlowV2 } from "./AuthFlowV2";

const { replace, toastError, isMiniAppHost } = vi.hoisted(() => ({
  replace: vi.fn(),
  toastError: vi.fn(),
  isMiniAppHost: vi.fn(() => true),
}));

vi.mock("@/shared/lib/messengerMiniApp", () => ({
  isMessengerMiniAppHost: () => isMiniAppHost(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: toastError,
  },
}));

function jsonRes(data: unknown, init?: { ok?: boolean; status?: number }) {
  const ok = init?.ok ?? true;
  const status = init?.status ?? (ok ? 200 : 400);
  return Promise.resolve({
    ok,
    status,
    json: async () => data,
  });
}

function oauthProvidersDisabled() {
  return jsonRes({ ok: true, yandex: false, google: false, apple: false });
}

function oauthProvidersAppleOnly() {
  return jsonRes({ ok: true, yandex: false, google: false, apple: true });
}

const PRE_MINI_APP = {
  oauthProviders: { yandex: false, google: false, apple: false },
  telegramBotUsername: "test_bot",
  maxBotOpenUrl: null as string | null,
  fetchedAt: Date.now(),
} as const;

const PRE_WEB_OAUTH = {
  oauthProviders: { yandex: true, google: false, apple: false },
  telegramBotUsername: "test_bot",
  maxBotOpenUrl: null as string | null,
  fetchedAt: Date.now(),
} as const;

describe("AuthFlowV2 — mini-app (phone)", () => {
  beforeEach(() => {
    replace.mockClear();
    toastError.mockClear();
    isMiniAppHost.mockReturnValue(true);
    sessionStorage.clear();
    if (!globalThis.crypto?.randomUUID) {
      vi.stubGlobal("crypto", { randomUUID: () => "test-web-chat-id" });
    }
  });

  it("skips PIN entry when user has pin:true and goes straight to OTP code", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/oauth/providers")) {
          return oauthProvidersDisabled();
        }
        if (url.includes("/api/auth/check-phone")) {
          return jsonRes({ ok: true, exists: true, methods: { sms: true, pin: true, telegram: true } });
        }
        if (url.includes("/api/auth/phone/start")) {
          return jsonRes({ ok: true, challengeId: "ch-pin-user", retryAfterSeconds: 60 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    render(<AuthFlowV2 nextParam={null} prefetchedAuthConfig={{ ...PRE_MINI_APP }} />);
    await user.type(screen.getByLabelText("Номер телефона"), "9991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    await screen.findByLabelText("Код подтверждения");
    expect(screen.queryByText(/PIN-код/i)).not.toBeInTheDocument();
  });

  it("after successful OTP confirm redirects immediately without set_pin", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/oauth/providers")) {
          return oauthProvidersDisabled();
        }
        if (url.includes("/api/auth/check-phone")) {
          return jsonRes({ ok: true, exists: true, methods: { sms: true, pin: false, telegram: true } });
        }
        if (url.includes("/api/auth/phone/start")) {
          return jsonRes({ ok: true, challengeId: "ch-new", retryAfterSeconds: 60 });
        }
        if (url.includes("/api/auth/phone/confirm")) {
          return jsonRes({ ok: true, redirectTo: "/app/patient/home" });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    render(<AuthFlowV2 nextParam={null} prefetchedAuthConfig={{ ...PRE_MINI_APP }} />);
    await user.type(screen.getByLabelText("Номер телефона"), "9991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    await screen.findByLabelText("Код подтверждения");
    await user.type(screen.getByLabelText("Код подтверждения"), "111111");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/patient/home"));
    expect(screen.queryByText(/Придумайте PIN/i)).not.toBeInTheDocument();
  });

  it("shows delivery_failed API message in toast for new user Telegram OTP start", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/oauth/providers")) {
          return oauthProvidersDisabled();
        }
        if (url.includes("/api/auth/check-phone")) {
          return jsonRes({ ok: true, exists: false, methods: { sms: true, pin: false, telegram: true } });
        }
        if (url.includes("/api/auth/phone/start")) {
          return jsonRes(
            {
              ok: false,
              error: "delivery_failed",
              message: "Не удалось отправить код. Попробуйте позже.",
            },
            { ok: false, status: 503 },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: true, google: false, apple: false },
          telegramBotUsername: "test_bot",
          maxBotOpenUrl: "https://max.ru/test_bot_nick",
          fetchedAt: Date.now(),
        }}
      />,
    );
    await user.type(screen.getByLabelText("Номер телефона"), "9991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    await screen.findByRole("button", { name: "Получить код в Telegram" });
    await user.click(screen.getByRole("button", { name: "Получить код в Telegram" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Не удалось отправить код. Попробуйте позже."),
    );
  });

  it("auto-starts email OTP for existing user when only email channel is available", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/oauth/providers")) {
        return oauthProvidersDisabled();
      }
      if (url.includes("/api/auth/check-phone")) {
        return jsonRes({
          ok: true,
          exists: true,
          methods: { sms: true, email: true, emailAddress: "u@example.com" },
        });
      }
      if (url.includes("/api/auth/phone/start")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        expect(body.deliveryChannel).toBe("email");
        return jsonRes({ ok: true, challengeId: "ch-email", retryAfterSeconds: 60 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthFlowV2 nextParam={null} prefetchedAuthConfig={{ ...PRE_MINI_APP }} />);
    await user.type(screen.getByLabelText("Номер телефона"), "9991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    await screen.findByLabelText("Код подтверждения");
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("AuthFlowV2 — browser", () => {
  beforeEach(() => {
    replace.mockClear();
    toastError.mockClear();
    isMiniAppHost.mockReturnValue(false);
    sessionStorage.clear();
    if (!globalThis.crypto?.randomUUID) {
      vi.stubGlobal("crypto", { randomUUID: () => "test-web-chat-id" });
    }
  });

  it("shows email/password directly when OAuth is disabled in prefetch", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonRes({})));

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await waitFor(() => expect(document.getElementById("auth-flow-v2-email-password")).toBeTruthy());
    expect(screen.getByRole("tab", { name: "Вход" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Войти через Яндекс" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Номер телефона")).not.toBeInTheDocument();
  });

  it("restores pending register verify UI from sessionStorage", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonRes({})));

    sessionStorage.setItem(
      "bc_auth_flow_pending_v1",
      JSON.stringify({
        v: 1,
        mode: "register_verify",
        email: "user@example.com",
        challengeId: "chal-restore",
        retryAfterSeconds: 60,
        savedAt: Date.now(),
        displayName: "User",
      }),
    );

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await waitFor(() => expect(screen.getByText(/Код отправлен на user@example\.com/i)).toBeInTheDocument());
    expect(screen.getByLabelText("Код подтверждения")).toBeInTheDocument();
  });

  it("email flow shows login vs registration choice after opening email from oauth-first", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(() => jsonRes({})));

    render(<AuthFlowV2 nextParam={null} prefetchedAuthConfig={{ ...PRE_WEB_OAUTH }} />);

    await waitFor(() => expect(document.getElementById("auth-flow-v2-oauth-first")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Войти по email" }));
    expect(await screen.findByRole("tab", { name: "Вход" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Регистрация" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Забыли пароль?" })).toBeInTheDocument();
  });

  it("oauth-first shows email login button alongside OAuth", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonRes({})));

    render(<AuthFlowV2 nextParam={null} prefetchedAuthConfig={{ ...PRE_WEB_OAUTH }} />);

    await waitFor(() => expect(document.getElementById("auth-flow-v2-oauth-first")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Войти по email" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти через Яндекс" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Другие варианты" })).not.toBeInTheDocument();
  });

  it("does not show Apple when Yandex or Google is enabled alongside Apple", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonRes({})));

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: true, google: false, apple: true },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await waitFor(() => expect(document.getElementById("auth-flow-v2-oauth-first")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Войти через Яндекс" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Войти через Apple" })).not.toBeInTheDocument();
  });

  it("shows Apple when only Apple OAuth is configured (Yandex and Google off)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/oauth/providers")) {
          return oauthProvidersAppleOnly();
        }
        return jsonRes({});
      }),
    );

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: true },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await waitFor(() => expect(document.getElementById("auth-flow-v2-oauth-first")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Войти через Apple" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Войти через Яндекс" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Войти через Google" })).not.toBeInTheDocument();
  });

  it("opens forgot-password subflow from login form", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(() => jsonRes({})));

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await waitFor(() => expect(document.getElementById("auth-flow-v2-email-password")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Забыли пароль?" }));
    expect(screen.getByRole("button", { name: "Отправить код" })).toBeInTheDocument();
    expect(screen.getByText(/одинаковым независимо/i)).toBeInTheDocument();
  });
});
