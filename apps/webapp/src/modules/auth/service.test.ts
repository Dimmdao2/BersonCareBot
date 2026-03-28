import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encodeBase64Url } from "@/shared/utils/base64url";
import { integratorWebappEntrySecret } from "@/config/env";
import { exchangeIntegratorToken } from "./service";

const serviceSourcePath = join(dirname(fileURLToPath(import.meta.url)), "service.ts");

function signPayload(payload: string): string {
  return createHmac("sha256", integratorWebappEntrySecret()).update(payload).digest("base64url");
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
