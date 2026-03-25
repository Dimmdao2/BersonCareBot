import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({
    query: queryMock,
  }),
}));

vi.mock("@/config/env", () => ({
  env: {
    DATABASE_URL: "postgres://test/test",
  },
}));

import { getQuoteForDay } from "./newsMotivation";

describe("getQuoteForDay (QA-03, EXEC A.5 — mocked DB)", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("same daySeed and referenceDate return identical quote on two calls", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "4" }] })
      .mockResolvedValueOnce({
        rows: [{ id: "quote-uuid", body_text: "Текст", author: "Автор" }],
      })
      .mockResolvedValueOnce({ rows: [{ count: "4" }] })
      .mockResolvedValueOnce({
        rows: [{ id: "quote-uuid", body_text: "Текст", author: "Автор" }],
      });

    const ref = new Date("2025-12-01T00:00:00.000Z");
    const a = await getQuoteForDay("patient-42", ref);
    const b = await getQuoteForDay("patient-42", ref);
    expect(a).toEqual(b);
    expect(a?.id).toBe("quote-uuid");
    expect(queryMock).toHaveBeenCalledTimes(4);
  });
});
