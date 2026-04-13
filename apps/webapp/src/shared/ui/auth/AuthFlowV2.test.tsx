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

describe("AuthFlowV2", () => {
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

    render(<AuthFlowV2 nextParam={null} />);
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

    render(<AuthFlowV2 nextParam={null} />);
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

    render(<AuthFlowV2 nextParam={null} />);
    await user.type(screen.getByLabelText("Номер телефона"), "9991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    await screen.findByRole("button", { name: "Получить код в Telegram" });
    await user.click(screen.getByRole("button", { name: "Получить код в Telegram" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Не удалось отправить код. Попробуйте позже."),
    );
  });

  it("shows Telegram landing when not mini app and bot username is configured", async () => {
    isMiniAppHost.mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/telegram-login/config")) {
          return jsonRes({ ok: true, botUsername: "test_bot" });
        }
        if (url.includes("/api/auth/oauth/providers")) {
          return oauthProvidersDisabled();
        }
        return jsonRes({});
      }),
    );

    render(<AuthFlowV2 nextParam={null} />);
    await waitFor(() => expect(document.getElementById("auth-flow-v2-landing")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Другие способы входа" })).toBeInTheDocument();
  });

  it("does not show OAuth buttons when providers endpoint reports all disabled", async () => {
    isMiniAppHost.mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/telegram-login/config")) {
          return jsonRes({ ok: true, botUsername: "test_bot" });
        }
        if (url.includes("/api/auth/oauth/providers")) {
          return oauthProvidersDisabled();
        }
        return jsonRes({});
      }),
    );

    render(<AuthFlowV2 nextParam={null} />);
    await waitFor(() => expect(document.getElementById("auth-flow-v2-landing")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Другие способы входа" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Войти через Яндекс" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Войти через Google" })).not.toBeInTheDocument();
  });
});
