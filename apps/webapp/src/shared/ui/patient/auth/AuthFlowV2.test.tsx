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

vi.mock("@/shared/lib/telegramChannelLinkOpen", () => ({
  finishChannelLinkNavigation: vi.fn(),
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
  specialistSignupEnabled: false,
  fetchedAt: Date.now(),
} as const;

const PRE_WEB_OAUTH = {
  oauthProviders: { yandex: true, google: false, apple: false },
  telegramBotUsername: "test_bot",
  maxBotOpenUrl: null as string | null,
  specialistSignupEnabled: false,
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

  it("moves direct phone OTP staff login into the shared factor form", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/check-phone")) {
        return jsonRes({ ok: true, exists: true, methods: { sms: false, telegram: true } });
      }
      if (url.includes("/api/auth/phone/start")) {
        return jsonRes({ ok: true, challengeId: "ch-staff", retryAfterSeconds: 60 });
      }
      if (url.includes("/api/auth/phone/confirm")) {
        return jsonRes({ ok: true, factorRequired: true });
      }
      if (url.includes("/api/auth/email-password/login/factor")) {
        return jsonRes({ ok: true, redirectTo: "/app/doctor" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthFlowV2 nextParam={null} prefetchedAuthConfig={{ ...PRE_MINI_APP }} />);
    await user.type(screen.getByLabelText("Номер телефона"), "9991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await user.type(await screen.findByLabelText("Код подтверждения"), "123456");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText("Введите код из приложения-аутентификатора.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Код"), "123456");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/doctor"));
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
          specialistSignupEnabled: false,
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
  const locationAssign = vi.fn();

  beforeEach(() => {
    replace.mockClear();
    toastError.mockClear();
    locationAssign.mockClear();
    Object.defineProperty(window, "location", {
      value: { assign: locationAssign, href: "http://localhost/" },
      writable: true,
      configurable: true,
    });
    isMiniAppHost.mockReturnValue(false);
    sessionStorage.clear();
    if (!globalThis.crypto?.randomUUID) {
      vi.stubGlobal("crypto", { randomUUID: () => "test-web-chat-id" });
    }
  });

  it("shows email OTP form directly when OAuth is disabled in prefetch", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonRes({})));

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          specialistSignupEnabled: false,
          fetchedAt: Date.now(),
        }}
      />,
    );

    // With all OAuth disabled, app goes straight to email_password step (OTP form).
    await waitFor(() => expect(document.getElementById("auth-flow-v2-email-password")).toBeTruthy());
    // New passwordless UI: email input + "Получить код" button (no tabs, no password).
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Получить код" })).toBeInTheDocument();
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
          specialistSignupEnabled: false,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await waitFor(() => expect(screen.getByText(/Код отправлен на user@example\.com/i)).toBeInTheDocument());
    expect(screen.getByLabelText("Код подтверждения")).toBeInTheDocument();
  });

  it("email flow shows OTP email form after opening email from oauth-first", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(() => jsonRes({})));

    render(<AuthFlowV2 nextParam={null} prefetchedAuthConfig={{ ...PRE_WEB_OAUTH }} />);

    await waitFor(() => expect(document.getElementById("auth-flow-v2-oauth-first")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Войти по email" }));
    // New passwordless UI: email input + "Получить код" — no tabs, no password.
    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Получить код" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Вход" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Регистрация" })).not.toBeInTheDocument();
  });

  it("oauth-first shows email login button alongside OAuth", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonRes({})));

    render(<AuthFlowV2 nextParam={null} prefetchedAuthConfig={{ ...PRE_WEB_OAUTH }} />);

    await waitFor(() => expect(document.getElementById("auth-flow-v2-oauth-first")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Войти по email" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти через Яндекс" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Другие варианты" })).not.toBeInTheDocument();
  });

  it("oauth-first opens phone login flow via link", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(() => jsonRes({})));

    render(<AuthFlowV2 nextParam={null} prefetchedAuthConfig={{ ...PRE_WEB_OAUTH }} />);

    await waitFor(() => expect(document.getElementById("auth-flow-v2-oauth-first")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Войти по номеру телефона" }));
    expect(await screen.findByRole("heading", { name: "Вход по номеру" })).toBeInTheDocument();
    expect(document.getElementById("auth-flow-v2-phone-login")).toBeTruthy();
  });

  it("phone login path: check-phone, messenger bind, confirm", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/config")) {
        return jsonRes({
          oauthProviders: { yandex: true, google: false, apple: false },
          telegramBotUsername: "testbot",
          maxBotOpenUrl: null,
        });
      }
      if (url.includes("/api/auth/check-phone")) {
        return jsonRes({ ok: true, exists: false, methods: { sms: false } });
      }
      if (url.includes("/api/auth/phone/messenger-bind/start")) {
        return jsonRes({
          ok: true,
          setupToken: "auth_flow",
          url: "https://t.me/testbot?start=auth_flow",
        });
      }
      if (url.includes("/api/auth/phone/messenger-bind/status")) {
        statusCalls += 1;
        return jsonRes({
          ok: true,
          status: "otp_ready",
          challengeId: "ch-auth",
          retryAfterSeconds: 60,
        });
      }
      if (url.includes("/api/auth/phone/confirm")) {
        return jsonRes({ ok: true, redirectTo: "/app/patient", role: "client" });
      }
      return jsonRes({});
    });
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    render(<AuthFlowV2 nextParam={null} prefetchedAuthConfig={{ ...PRE_WEB_OAUTH }} />);
    await waitFor(() => expect(document.getElementById("auth-flow-v2-oauth-first")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Войти по номеру телефона" }));
    await user.type(screen.getByLabelText("Номер телефона"), "9991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await user.click(await screen.findByRole("button", { name: "Telegram" }));
    await user.type(await screen.findByLabelText("Код подтверждения"), "123456");
    await user.click(screen.getByRole("button", { name: "Войти" }));
    await waitFor(() => expect(locationAssign).toHaveBeenCalled());
    expect(statusCalls).toBeGreaterThanOrEqual(1);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/api/auth/phone/confirm"))).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/api/auth/phone/messenger-bind/finish"))).toBe(false);
  });

  it("moves embedded phone login into the existing staff factor form", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/check-phone")) {
        return jsonRes({ ok: true, exists: true, methods: { sms: false, telegram: true } });
      }
      if (url.includes("/api/auth/phone/start")) {
        return jsonRes({ ok: true, challengeId: "ch-embedded-staff", retryAfterSeconds: 60 });
      }
      if (url.includes("/api/auth/phone/confirm")) {
        return jsonRes({ ok: true, factorRequired: true });
      }
      return jsonRes({});
    }));

    render(<AuthFlowV2 nextParam={null} prefetchedAuthConfig={{ ...PRE_WEB_OAUTH }} />);
    await user.click(await screen.findByRole("button", { name: "Войти по номеру телефона" }));
    await user.type(screen.getByLabelText("Номер телефона"), "9991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await user.type(await screen.findByLabelText("Код подтверждения"), "123456");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText("Введите код из приложения-аутентификатора.")).toBeInTheDocument();
    expect(locationAssign).not.toHaveBeenCalled();
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
          specialistSignupEnabled: false,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await waitFor(() => expect(document.getElementById("auth-flow-v2-oauth-first")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Войти через Яндекс" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Войти через Apple" })).not.toBeInTheDocument();
  });

  it("shows network toast when OAuth start request fails at transport level", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/oauth/start")) {
          return Promise.reject(new TypeError("Failed to fetch"));
        }
        return jsonRes({});
      }),
    );

    render(<AuthFlowV2 nextParam={null} prefetchedAuthConfig={{ ...PRE_WEB_OAUTH }} />);
    await waitFor(() => expect(document.getElementById("auth-flow-v2-oauth-first")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Войти через Яндекс" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Нет связи с сервером. Проверьте интернет и повторите.");
    });
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
          specialistSignupEnabled: false,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await waitFor(() => expect(document.getElementById("auth-flow-v2-oauth-first")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Войти через Apple" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Войти через Яндекс" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Войти через Google" })).not.toBeInTheDocument();
  });

  it("email OTP form submits to /api/auth/email-otp/start and shows code entry on success", async () => {
    // The register tab is removed in the passwordless flow. This test verifies the new OTP start path.
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/email-otp/start")) {
          return jsonRes({ ok: true, challengeId: "ch-otp-123", retryAfterSeconds: 60 });
        }
        return jsonRes({});
      }),
    );

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          specialistSignupEnabled: false,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await waitFor(() => expect(document.getElementById("auth-flow-v2-email-password")).toBeTruthy());
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Получить код" }));

    // Should show OTP code entry form
    expect(await screen.findByLabelText("Код подтверждения")).toBeInTheDocument();
  });

  it("email OTP form shows error toast when code send fails", async () => {
    // The "Забыли пароль?" button is removed from the new passwordless email form.
    // This test verifies that email_send_failed error shows a toast.
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/email-otp/start")) {
          return jsonRes(
            { ok: false, error: "email_send_failed", message: "Не удалось отправить код" },
            { ok: false, status: 503 },
          );
        }
        return jsonRes({});
      }),
    );

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          specialistSignupEnabled: false,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await waitFor(() => expect(document.getElementById("auth-flow-v2-email-password")).toBeTruthy());
    await user.type(screen.getByLabelText("Email"), "fail@example.com");
    await user.click(screen.getByRole("button", { name: "Получить код" }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // Code entry should NOT appear
    expect(screen.queryByLabelText("Код подтверждения")).not.toBeInTheDocument();
  });

  it("keeps ordinary code login FIO-free and opens a separate structured patient registration", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(() => jsonRes({})));
    render(<AuthFlowV2 nextParam={null} prefetchedAuthConfig={{ ...PRE_MINI_APP }} />);
    await screen.findByRole("button", { name: "Получить код" });
    expect(screen.queryByLabelText("Фамилия")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Зарегистрироваться" }));
    expect(await screen.findByLabelText("Фамилия")).toBeInTheDocument();
    expect(screen.getByLabelText("Имя")).toBeInTheDocument();
    expect(screen.getByLabelText("Отчество")).toBeInTheDocument();
    expect(screen.queryByLabelText(/display/i)).not.toBeInTheDocument();
  });

  it("validates and persists structured patient registration for refresh and resend", async () => {
    const user = userEvent.setup();
    const payloads: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/email-otp/register")) {
        payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return jsonRes({ ok: true, challengeId: `patient-ch-${payloads.length}`, retryAfterSeconds: 0 });
      }
      return jsonRes({});
    }));
    render(<AuthFlowV2 nextParam={null} prefetchedAuthConfig={{ ...PRE_MINI_APP }} />);
    await user.click(await screen.findByRole("button", { name: "Зарегистрироваться" }));
    await user.click(screen.getByRole("button", { name: "Зарегистрироваться" }));
    expect(toastError).toHaveBeenCalledWith("Укажите email, фамилию и имя");
    await user.type(screen.getByLabelText("Email"), "patient@example.com");
    await user.type(screen.getByLabelText("Фамилия"), "Иванов");
    await user.type(screen.getByLabelText("Имя"), "Иван");
    await user.type(screen.getByLabelText("Отчество"), "Иванович");
    await user.click(screen.getByRole("button", { name: "Зарегистрироваться" }));
    expect(await screen.findByLabelText("Код подтверждения")).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem("bc_auth_flow_pending_v1") ?? "{}")).toMatchObject({
      purpose: "patient_email_otp", lastName: "Иванов", firstName: "Иван", patronymic: "Иванович",
    });
    await user.click(await screen.findByRole("button", { name: "Отправить код повторно" }));
    expect(payloads).toEqual([
      { email: "patient@example.com", lastName: "Иванов", firstName: "Иван", patronymic: "Иванович" },
      { email: "patient@example.com", lastName: "Иванов", firstName: "Иван", patronymic: "Иванович" },
    ]);
  });

  it("can switch from patient email login to specialist signup and back", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(() => jsonRes({})));

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          specialistSignupEnabled: true,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await waitFor(() => expect(document.getElementById("auth-flow-v2-email-password")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Я специалист" }));
    expect(await screen.findByLabelText("Фамилия")).toBeInTheDocument();
    expect(screen.getByLabelText("Имя")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать кабинет" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Войти как пациент" }));
    expect(await screen.findByRole("button", { name: "Получить код" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Фамилия")).not.toBeInTheDocument();
  });

  it("opens the explicit registration surface without creating an authenticated public role", async () => {
    isMiniAppHost.mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn(() => jsonRes({})));

    render(
      <AuthFlowV2
        nextParam={null}
        initialDevView="registration"
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          specialistSignupEnabled: true,
          fetchedAt: Date.now(),
        }}
      />,
    );

    expect(await screen.findByLabelText("Название организации")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать кабинет" })).toBeInTheDocument();
  });

  it("completes the staff password login through a one-time recovery factor", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/email-password/login/factor")) {
          expect(JSON.parse(String(init?.body))).toEqual({ recoveryCode: "ABCD-EFGH-IJKL-MNOP" });
          return jsonRes({ ok: true, recoveryMode: true, redirectTo: "/app/account?tab=security" });
        }
        if (url.includes("/api/auth/email-password/login")) {
          return jsonRes({ ok: true, factorRequired: true });
        }
        return jsonRes({});
      }),
    );

    render(
      <AuthFlowV2
        nextParam={null}
        supportContactHref="/app/contact-support"
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          specialistSignupEnabled: true,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Войти по паролю" }));
    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Пароль"), "password12");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText("Введите код из приложения-аутентификатора.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Нет доступа к приложению и резервным кодам" })).toHaveAttribute(
      "href",
      "/app/contact-support?from=staff-factor",
    );
    await user.click(screen.getByRole("button", { name: "Использовать резервный код" }));
    await user.type(screen.getByLabelText("Код"), "ABCD-EFGH-IJKL-MNOP");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/account?tab=security"));
  });

  it("specialist signup starts verification and confirms into doctor redirect", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/specialist-signup/start")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        expect(body).toMatchObject({
          email: "doctor@example.com",
          password: "password12",
          lastName: "Doctor",
          firstName: "Owner",
          patronymic: "Middle",
          organizationTitle: "Clinic One",
        });
        return jsonRes({ ok: true, challengeId: "signup-ch-1", retryAfterSeconds: 60 });
      }
      if (url.includes("/api/auth/specialist-signup/confirm")) {
        return jsonRes({ ok: true, redirectTo: "/app/doctor" });
      }
      return jsonRes({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          specialistSignupEnabled: true,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await waitFor(() => expect(document.getElementById("auth-flow-v2-email-password")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Я специалист" }));
    await user.type(screen.getByLabelText("Email"), "doctor@example.com");
    await user.type(screen.getByLabelText("Пароль"), "password12");
    await user.type(screen.getByLabelText("Фамилия"), "Doctor");
    await user.type(screen.getByLabelText("Имя"), "Owner");
    await user.type(screen.getByLabelText("Отчество"), "Middle");
    await user.type(screen.getByLabelText("Название организации"), "Clinic One");
    await user.click(screen.getByRole("button", { name: "Создать кабинет" }));

    expect(await screen.findByText(/Код отправлен на doctor@example\.com/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Код подтверждения"), "123456");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/doctor"));
  });

  it("retains structured specialist FIO for a resend", async () => {
    const user = userEvent.setup();
    const payloads: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/specialist-signup/start")) {
          payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return jsonRes({ ok: true, challengeId: `signup-ch-${payloads.length}`, retryAfterSeconds: 0 });
        }
        return jsonRes({});
      }),
    );

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          specialistSignupEnabled: true,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Я специалист" }));
    await user.type(screen.getByLabelText("Email"), "doctor@example.com");
    await user.type(screen.getByLabelText("Пароль"), "password12");
    await user.type(screen.getByLabelText("Фамилия"), "Doctor");
    await user.type(screen.getByLabelText("Имя"), "Owner");
    await user.type(screen.getByLabelText("Отчество"), "Middle");
    await user.type(screen.getByLabelText("Название организации"), "Clinic One");
    await user.click(screen.getByRole("button", { name: "Создать кабинет" }));
    await user.click(await screen.findByRole("button", { name: "Отправить код повторно" }));

    expect(payloads).toEqual([
      {
        email: "doctor@example.com",
        password: "password12",
        lastName: "Doctor",
        firstName: "Owner",
        patronymic: "Middle",
        organizationTitle: "Clinic One",
      },
      {
        email: "doctor@example.com",
        password: "password12",
        lastName: "Doctor",
        firstName: "Owner",
        patronymic: "Middle",
        organizationTitle: "Clinic One",
      },
    ]);
  });

  it("specialist signup shows duplicate email error from start endpoint", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/specialist-signup/start")) {
          return jsonRes({ ok: false, error: "duplicate_email" }, { ok: false, status: 409 });
        }
        return jsonRes({});
      }),
    );

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          specialistSignupEnabled: true,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await waitFor(() => expect(document.getElementById("auth-flow-v2-email-password")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Я специалист" }));
    await user.type(screen.getByLabelText("Email"), "doctor@example.com");
    await user.type(screen.getByLabelText("Пароль"), "password12");
    await user.type(screen.getByLabelText("Фамилия"), "Doctor");
    await user.type(screen.getByLabelText("Имя"), "Owner");
    await user.type(screen.getByLabelText("Название организации"), "Clinic One");
    await user.click(screen.getByRole("button", { name: "Создать кабинет" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Аккаунт с этой почтой уже существует."));
  });

  it("specialist signup confirm shows invalid code and too many attempts errors", async () => {
    const user = userEvent.setup();
    let specialistConfirmCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/specialist-signup/start")) {
          return jsonRes({ ok: true, challengeId: "signup-ch-1", retryAfterSeconds: 0 });
        }
        if (url.includes("/api/auth/specialist-signup/confirm")) {
          specialistConfirmCalls += 1;
          if (specialistConfirmCalls === 1) {
            return jsonRes({ ok: false, error: "invalid_code" }, { ok: false, status: 400 });
          }
          return jsonRes({ ok: false, error: "too_many_attempts", retryAfterSeconds: 60 }, { ok: false, status: 429 });
        }
        return jsonRes({});
      }),
    );

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          specialistSignupEnabled: true,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await waitFor(() => expect(document.getElementById("auth-flow-v2-email-password")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Я специалист" }));
    await user.type(screen.getByLabelText("Email"), "doctor@example.com");
    await user.type(screen.getByLabelText("Пароль"), "password12");
    await user.type(screen.getByLabelText("Фамилия"), "Doctor");
    await user.type(screen.getByLabelText("Имя"), "Owner");
    await user.type(screen.getByLabelText("Название организации"), "Clinic One");
    await user.click(screen.getByRole("button", { name: "Создать кабинет" }));

    const codeInput = await screen.findByLabelText("Код подтверждения");
    await user.type(codeInput, "123456");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(await screen.findByText("Неверный код")).toBeInTheDocument();

    await user.clear(codeInput);
    await user.type(codeInput, "654321");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(await screen.findByText(/Превышено количество попыток/i)).toBeInTheDocument();
  });

  it("specialist signup confirm shows disabled message when rollout is turned off before provisioning", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/specialist-signup/start")) {
          return jsonRes({ ok: true, challengeId: "signup-ch-1", retryAfterSeconds: 60 });
        }
        if (url.includes("/api/auth/specialist-signup/confirm")) {
          return jsonRes({ ok: false, error: "specialist_signup_disabled" }, { ok: false, status: 423 });
        }
        return jsonRes({});
      }),
    );

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          specialistSignupEnabled: true,
          fetchedAt: Date.now(),
        }}
      />,
    );

    await waitFor(() => expect(document.getElementById("auth-flow-v2-email-password")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Я специалист" }));
    await user.type(screen.getByLabelText("Email"), "doctor@example.com");
    await user.type(screen.getByLabelText("Пароль"), "password12");
    await user.type(screen.getByLabelText("Фамилия"), "Doctor");
    await user.type(screen.getByLabelText("Имя"), "Owner");
    await user.type(screen.getByLabelText("Название организации"), "Clinic One");
    await user.click(screen.getByRole("button", { name: "Создать кабинет" }));

    const codeInput = await screen.findByLabelText("Код подтверждения");
    await user.type(codeInput, "123456");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(await screen.findByText("Регистрация кабинета специалиста пока недоступна.")).toBeInTheDocument();
  });

  it("hides specialist signup entry when rollout flag is disabled", async () => {
    render(<AuthFlowV2 nextParam={null} prefetchedAuthConfig={{ ...PRE_MINI_APP }} />);

    await waitFor(() => expect(document.getElementById("auth-flow-v2-email-password")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Я специалист" })).not.toBeInTheDocument();
  });
});
