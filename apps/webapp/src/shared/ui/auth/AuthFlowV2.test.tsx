/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthFlowV2 } from "./AuthFlowV2";
import { routePaths } from "@/app-layer/routes/paths";

const { replace, toastError } = vi.hoisted(() => ({
  replace: vi.fn(),
  toastError: vi.fn(),
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

describe("AuthFlowV2", () => {
  beforeEach(() => {
    replace.mockClear();
    toastError.mockClear();
    sessionStorage.clear();
    if (!globalThis.crypto?.randomUUID) {
      vi.stubGlobal("crypto", { randomUUID: () => "test-web-chat-id" });
    }
  });

  it("after 3 wrong PIN attempts opens channel picker with recovery hint", async () => {
    const user = userEvent.setup();
    let pinCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/check-phone")) {
          return jsonRes({ ok: true, exists: true, methods: { sms: true, pin: true } });
        }
        if (url.includes("/api/auth/pin/login")) {
          pinCalls += 1;
          return jsonRes({ ok: false, message: "Неверный PIN" }, { ok: false, status: 401 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    render(<AuthFlowV2 nextParam={null} />);
    await user.type(screen.getByLabelText("Номер телефона"), "+79991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    await screen.findByText(/PIN-код/i);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      for (let i = 0; i < 4; i += 1) {
        await user.type(screen.getByLabelText(`Цифра ${i + 1} из 4`), String((attempt + i) % 10));
      }
      await waitFor(() => expect(pinCalls).toBe(attempt + 1));
    }

    expect(sessionStorage.getItem("bersoncare_pin_recovery")).toBe("1");
    await screen.findByText(/После входа по коду откройте/);
    expect(screen.getByRole("group", { name: "Способ получения кода" })).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/Выберите другой способ/));
  });

  it("after OTP recovery confirms, redirects patient to profile PIN hash", async () => {
    const user = userEvent.setup();
    let pinCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/check-phone")) {
          return jsonRes({ ok: true, exists: true, methods: { sms: true, pin: true } });
        }
        if (url.includes("/api/auth/pin/login")) {
          pinCalls += 1;
          return jsonRes({ ok: false, message: "Неверный PIN" }, { ok: false, status: 401 });
        }
        if (url.includes("/api/auth/phone/start")) {
          return jsonRes({ ok: true, challengeId: "ch-recovery", retryAfterSeconds: 60 });
        }
        if (url.includes("/api/auth/phone/confirm")) {
          const body = init?.body ? (JSON.parse(String(init.body)) as { code?: string }) : {};
          expect(body.code).toBe("654321");
          return jsonRes({ ok: true, redirectTo: "/app/patient/home" });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    render(<AuthFlowV2 nextParam={null} />);
    await user.type(screen.getByLabelText("Номер телефона"), "+79991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      for (let i = 0; i < 4; i += 1) {
        await user.type(screen.getByLabelText(`Цифра ${i + 1} из 4`), String((attempt + i + 1) % 10));
      }
      await waitFor(() => expect(pinCalls).toBe(attempt + 1));
    }

    await user.click(screen.getByRole("button", { name: "Получить код по SMS" }));
    await screen.findByLabelText("Код подтверждения");
    await user.type(screen.getByLabelText("Код подтверждения"), "654321");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(`${routePaths.profile}#patient-profile-pin`),
    );
    expect(sessionStorage.getItem("bersoncare_pin_recovery")).toBeNull();
  });

  it("set_pin: mismatch on second step returns to first PIN step", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/auth/check-phone")) {
          return jsonRes({ ok: true, exists: true, methods: { sms: true, pin: false } });
        }
        if (url.includes("/api/auth/phone/start")) {
          return jsonRes({ ok: true, challengeId: "ch-new", retryAfterSeconds: 60 });
        }
        if (url.includes("/api/auth/phone/confirm")) {
          return jsonRes({ ok: true, redirectTo: "/app/patient/home" });
        }
        if (url.includes("/api/auth/pin/set")) {
          throw new Error("pin/set should not be called on mismatch");
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    render(<AuthFlowV2 nextParam={null} />);
    await user.type(screen.getByLabelText("Номер телефона"), "+79991234567");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    await screen.findByLabelText("Код подтверждения");
    await user.type(screen.getByLabelText("Код подтверждения"), "111111");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    await screen.findByText(/Придумайте PIN/);
    for (let i = 0; i < 4; i += 1) {
      await user.type(screen.getByLabelText(`Цифра ${i + 1} из 4`), "1");
    }
    await screen.findByText(/Повторите PIN/);
    for (let i = 0; i < 4; i += 1) {
      await user.type(screen.getByLabelText(`Цифра ${i + 1} из 4`), "2");
    }

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/не совпадает/)));
    await screen.findByText(/Придумайте PIN/);
  });
});
