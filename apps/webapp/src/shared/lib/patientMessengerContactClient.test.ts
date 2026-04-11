/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inferSpy = vi.fn();

vi.mock("@/shared/lib/messengerMiniApp", () => ({
  inferMessengerChannelForRequestContact: () => inferSpy(),
}));

import { postPatientMessengerRequestContact } from "./patientMessengerContactClient";

describe("postPatientMessengerRequestContact", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    inferSpy.mockReturnValue(undefined);
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.clearAllMocks();
  });

  it("returns ok:true when API returns ok", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const r = await postPatientMessengerRequestContact();
    expect(r).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/patient/messenger/request-contact",
      expect.objectContaining({ method: "POST", credentials: "include", headers: {} }),
    );
  });

  it("sends X-Bersoncare-Contact-Channel when infer returns max", async () => {
    inferSpy.mockReturnValue("max");
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect(init).toMatchObject({
        headers: { "X-Bersoncare-Contact-Channel": "max" },
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await postPatientMessengerRequestContact();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("sends X-Bersoncare-Contact-Channel when infer returns telegram", async () => {
    inferSpy.mockReturnValue("telegram");
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect(init).toMatchObject({
        headers: { "X-Bersoncare-Contact-Channel": "telegram" },
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await postPatientMessengerRequestContact();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns error code from JSON body on failure", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const r = await postPatientMessengerRequestContact();
    expect(r).toEqual({ ok: false, error: "rate_limited" });
  });
});
