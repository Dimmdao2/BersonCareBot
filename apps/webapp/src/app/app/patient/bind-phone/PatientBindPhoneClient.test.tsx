/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PatientBindPhoneClient } from "./PatientBindPhoneClient";

const navMocks = vi.hoisted(() => ({
  router: { refresh: vi.fn() },
}));

const gateMocks = vi.hoisted(() => ({
  getDetail: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navMocks.router,
}));

vi.mock("@/shared/lib/miniAppSessionRecovery", () => ({
  ensureMessengerMiniAppWebappSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/lib/patientMessengerContactGate", () => ({
  getPatientMessengerContactGateDetail: () => gateMocks.getDetail(),
  resolveBotHrefAfterMessengerSessionLoss: vi.fn().mockResolvedValue("https://t.me/fallback"),
  resolveMessengerContactGateBotHref: vi.fn().mockResolvedValue("https://t.me/gate"),
}));

vi.mock("@/shared/lib/messengerMiniApp", () => ({
  closeMessengerMiniApp: vi.fn(),
  inferMessengerChannelForRequestContact: vi.fn(),
  isMessengerMiniAppHost: vi.fn(() => true),
}));

vi.mock("@/shared/lib/patientMessengerContactClient", () => ({
  postPatientMessengerRequestContact: vi.fn().mockResolvedValue({ ok: false, error: "unknown" }),
}));

vi.mock("@/shared/ui/patient/PatientPhonePromptChromeContext", () => ({
  usePatientPhonePromptChrome: () => null,
}));

describe("PatientBindPhoneClient", () => {
  beforeEach(() => {
    navMocks.router.refresh.mockClear();
    gateMocks.getDetail.mockReset();
  });

  it("при ошибке recovery показывает панель me_unavailable вместо вечной загрузки", async () => {
    gateMocks.getDetail.mockRejectedValueOnce(new Error("network"));

    render(
      <PatientBindPhoneClient telegramId="1" maxId="" supportContactHref="/app/patient/support" />,
    );

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Не удалось проверить статус аккаунта/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Предоставить контакт/i })).toBeInTheDocument();
  });
});
