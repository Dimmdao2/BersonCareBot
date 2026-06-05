import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: vi.fn(),
}));

import { getCachedResponse, isKeyValid, setCachedResponse } from "./pgStore";
import { runWebappPgText } from "@/infra/db/runWebappSql";

describe("pgStore", () => {
  beforeEach(() => {
    vi.mocked(runWebappPgText).mockReset();
  });

  describe("isKeyValid", () => {
    it("rejects empty and overlong keys", () => {
      expect(isKeyValid("")).toBe(false);
      expect(isKeyValid("a".repeat(257))).toBe(false);
      expect(isKeyValid("ok-key")).toBe(true);
    });
  });

  describe("getCachedResponse", () => {
    it("returns empty body when response_body is not a record", async () => {
      vi.mocked(runWebappPgText).mockResolvedValue({
        rows: [{ request_hash: "h1", status: 200, response_body: "not-json-object" }],
      });

      const r = await getCachedResponse("key-1", "h1");
      expect(r).toEqual({ hit: true, status: 200, body: {} });
    });

    it("returns parsed record body on cache hit", async () => {
      vi.mocked(runWebappPgText).mockResolvedValue({
        rows: [{ request_hash: "h2", status: 201, response_body: { ok: true, n: 1 } }],
      });

      const r = await getCachedResponse("key-2", "h2");
      expect(r).toEqual({ hit: true, status: 201, body: { ok: true, n: 1 } });
    });
  });

  describe("setCachedResponse", () => {
    it("returns true when insert returns a row", async () => {
      vi.mocked(runWebappPgText).mockResolvedValue({ rows: [{ key: "k" }], rowCount: 1 });

      const wrote = await setCachedResponse("k", "h", 200, { ok: true });
      expect(wrote).toBe(true);
    });
  });
});
