import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createInMemoryPatientHomeLegacyContentPort } from "./inMemoryPatientHomeLegacyContent";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("pgPatientHomeLegacyContent (runtime constraints)", () => {
  it("uses Drizzle only — no getPool / pool.query / client.query", () => {
    const src = readFileSync(join(__dirname, "pgPatientHomeLegacyContent.ts"), "utf8");
    expect(src).not.toMatch(/\bgetPool\b/);
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).not.toMatch(/\bclient\.query\b/);
    expect(src).toContain("getDrizzle");
  });
});

describe("inMemoryPatientHomeLegacyContent", () => {
  it("getQuoteForDay is stable for the same seed and UTC day", async () => {
    const port = createInMemoryPatientHomeLegacyContentPort({
      quotes: [
        { id: "a", bodyText: "A", author: null, sortOrder: 0 },
        { id: "b", bodyText: "B", author: null, sortOrder: 1 },
        { id: "c", bodyText: "C", author: null, sortOrder: 2 },
        { id: "d", bodyText: "D", author: null, sortOrder: 3 },
      ],
    });
    const ref = new Date("2025-12-01T00:00:00.000Z");
    const a = await port.getQuoteForDay("patient-42", ref);
    const b = await port.getQuoteForDay("patient-42", ref);
    expect(a).toEqual(b);
    expect(a?.id).toBeTypeOf("string");
  });

  it("returns null when there are no active quotes", async () => {
    const port = createInMemoryPatientHomeLegacyContentPort();
    const q = await port.getQuoteForDay("user-1");
    expect(q).toBeNull();
  });

  it("QA-03: same daySeed and referenceDate return identical quote on two calls", async () => {
    const port = createInMemoryPatientHomeLegacyContentPort({
      quotes: [{ id: "quote-uuid", bodyText: "Текст", author: "Автор", sortOrder: 0 }],
    });
    const ref = new Date("2025-12-01T00:00:00.000Z");
    const a = await port.getQuoteForDay("patient-42", ref);
    const b = await port.getQuoteForDay("patient-42", ref);
    expect(a).toEqual(b);
    expect(a?.id).toBe("quote-uuid");
    expect(a?.body).toBe("Текст");
  });
});
