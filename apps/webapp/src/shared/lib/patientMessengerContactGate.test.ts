/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPatientMessengerContactGateDetail } from "./patientMessengerContactGate";

describe("getPatientMessengerContactGateDetail", () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("returns me_unavailable when /api/me is not ok and not 401", async () => {
    globalThis.fetch = vi.fn(async (url: string | Request) => {
      const u = typeof url === "string" ? url : (url as Request).url;
      if (u.includes("/api/me")) {
        return new Response(JSON.stringify({ ok: false }), { status: 503 });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    const d = await getPatientMessengerContactGateDetail();
    expect(d.kind).toBe("me_unavailable");
  });

  it("returns unauthenticated for 401", async () => {
    globalThis.fetch = vi.fn(async (url: string | Request) => {
      const u = typeof url === "string" ? url : (url as Request).url;
      if (u.includes("/api/me")) {
        return new Response(JSON.stringify({ ok: false }), { status: 401 });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    const d = await getPatientMessengerContactGateDetail();
    expect(d.kind).toBe("unauthenticated");
  });

  it("returns me_unavailable when platformAccessUnresolved with messenger binding", async () => {
    globalThis.fetch = vi.fn(async (url: string | Request) => {
      const u = typeof url === "string" ? url : (url as Request).url;
      if (u.includes("/api/me")) {
        return new Response(
          JSON.stringify({
            ok: true,
            user: {
              phone: "+79990001122",
              bindings: { telegramId: "1", maxId: "" },
            },
            platformAccess: null,
            platformAccessUnresolved: true,
          }),
          { status: 200 },
        );
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    const d = await getPatientMessengerContactGateDetail();
    expect(d.kind).toBe("me_unavailable");
    expect(d.hasTelegram).toBe(true);
  });
});
