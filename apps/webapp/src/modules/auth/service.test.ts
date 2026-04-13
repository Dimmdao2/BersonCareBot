import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { encodeBase64Url } from "@/shared/utils/base64url";
import { exchangeIntegratorToken } from "./service";

const TEST_ENTRY_SECRET = "test-integrator-entry-secret";
vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getIntegratorWebappEntrySecret: async () => TEST_ENTRY_SECRET,
  getTelegramBotToken: async () => "",
  getMaxBotApiKey: async () => "",
}));

const serviceSourcePath = join(dirname(fileURLToPath(import.meta.url)), "service.ts");

function signPayload(payload: string): string {
  return createHmac("sha256", TEST_ENTRY_SECRET).update(payload).digest("base64url");
}

describe("auth service", () => {
  it("SESSION_TTL_SECONDS is 90 days for client (non-doctor) sessions", () => {
    const src = readFileSync(serviceSourcePath, "utf8");
    expect(src).toMatch(/const\s+SESSION_TTL_SECONDS\s*=\s*60\s*\*\s*60\s*\*\s*24\s*\*\s*90/);
  });

  it("returns null for malformed signed integrator token payload", async () => {
    const payload = encodeBase64Url("not-json");
    const signature = signPayload(payload);
    const token = `${payload}.${signature}`;

    await expect(exchangeIntegratorToken(token)).resolves.toBeNull();
  });
});
