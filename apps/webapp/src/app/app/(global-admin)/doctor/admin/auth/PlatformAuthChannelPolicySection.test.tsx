/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformAuthChannelPolicySection } from "./PlatformAuthChannelPolicySection";

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn() } }));

describe("PlatformAuthChannelPolicySection", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("loads global policy and patches one explicit channel key", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        settings: [
          { key: "auth_email_enabled", valueJson: { value: true } },
          { key: "auth_sms_enabled", valueJson: { value: false } },
          { key: "auth_telegram_enabled", valueJson: { value: true } },
          { key: "auth_max_enabled", valueJson: { value: true } },
          { key: "patient_unsupported_client_fallback_enabled", valueJson: { value: false } },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PlatformAuthChannelPolicySection />);
    const switches = await screen.findAllByRole("switch");
    await waitFor(() => expect(switches[0]).toBeEnabled());
    expect(switches[0]).toBeChecked();
    expect(switches[1]).not.toBeChecked();

    await userEvent.click(switches[1]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/platform/settings");
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body))).toEqual({
      key: "auth_sms_enabled",
      value: true,
    });
  });

  it("keeps the client-compatibility fallback off until the global admin enables it", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        settings: [{ key: "patient_unsupported_client_fallback_enabled", valueJson: { value: false } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PlatformAuthChannelPolicySection />);
    const switches = await screen.findAllByRole("switch");
    const fallbackSwitch = switches.at(-1);
    expect(fallbackSwitch).toBeDefined();
    if (!fallbackSwitch) throw new Error("fallback switch is missing");
    await waitFor(() => expect(fallbackSwitch).toBeEnabled());
    expect(fallbackSwitch).not.toBeChecked();
    await userEvent.click(fallbackSwitch);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body))).toEqual({
      key: "patient_unsupported_client_fallback_enabled",
      value: true,
    });
  });
});
