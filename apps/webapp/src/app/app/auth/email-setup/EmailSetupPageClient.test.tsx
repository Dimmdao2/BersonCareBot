/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmailSetupPageClient from "./EmailSetupPageClient";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe("EmailSetupPageClient", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(),
    );
  });

  it("shows password form with readonly email when token is valid", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, email: "user@example.com", status: "ready" }), {
        status: 200,
      }),
    );

    render(<EmailSetupPageClient initialToken="est_valid" />);

    await waitFor(() => {
      expect(screen.getByLabelText("Email")).toHaveValue("user@example.com");
    });
    const emailInput = screen.getByLabelText("Email");
    expect(emailInput).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Пароль")).toBeInTheDocument();
  });

  it("shows expired resend UI", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "expired", email: "user@example.com" }), {
        status: 410,
      }),
    );

    render(<EmailSetupPageClient initialToken="est_expired" />);

    await waitFor(() => {
      expect(screen.getByText("Ссылка устарела")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Отправить новую ссылку" })).toBeInTheDocument();
  });

  it("submits password and redirects on success", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, email: "user@example.com", status: "ready" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, redirectTo: "/app/patient" }), { status: 200 }),
      );

    const user = userEvent.setup();
    render(<EmailSetupPageClient initialToken="est_valid" />);

    await waitFor(() => expect(screen.getByLabelText("Пароль")).toBeInTheDocument());
    await user.type(screen.getByLabelText("Пароль"), "secret1234");
    await user.click(screen.getByRole("button", { name: "Создать доступ" }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/app/patient");
    });
  });

  it("shows login hint when token belongs to account with password", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "already_has_login" }), { status: 409 }),
    );

    render(<EmailSetupPageClient initialToken="est_used_account" />);

    await waitFor(() => {
      expect(screen.getByText("Доступ по этой почте уже настроен. Войдите с паролем.")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Перейти ко входу" })).toHaveAttribute("href", "/app");
  });

  it("не зависает на 'Проверка ссылки…' при сетевой ошибке validate", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    render(<EmailSetupPageClient initialToken="est_network_fail" />);

    await waitFor(() => {
      expect(
        screen.getByText("Не удалось проверить ссылку. Проверьте интернет и обновите страницу."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Проверка ссылки…")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти ко входу" })).toHaveAttribute("href", "/app");
  });

  it("показывает текст сетевой ошибки при отправке пароля и не зависает в submitting", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, email: "user@example.com", status: "ready" }), {
          status: 200,
        }),
      )
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const user = userEvent.setup();
    render(<EmailSetupPageClient initialToken="est_submit_network_fail" />);

    await waitFor(() => expect(screen.getByLabelText("Пароль")).toBeInTheDocument());
    await user.type(screen.getByLabelText("Пароль"), "secret1234");
    await user.click(screen.getByRole("button", { name: "Создать доступ" }));

    await waitFor(() => {
      expect(
        screen.getByText("Не удалось проверить ссылку. Проверьте интернет и обновите страницу."),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Создать доступ" })).not.toBeDisabled();
  });
});
