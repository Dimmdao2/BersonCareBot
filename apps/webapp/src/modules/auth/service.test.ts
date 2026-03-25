import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encodeBase64Url } from "@/shared/utils/base64url";
import { integratorWebappEntrySecret } from "@/config/env";
import { exchangeIntegratorToken } from "./service";

function signPayload(payload: string): string {
  return createHmac("sha256", integratorWebappEntrySecret()).update(payload).digest("base64url");
}

describe("auth service", () => {
  it("returns null for malformed signed integrator token payload", async () => {
    const payload = encodeBase64Url("not-json");
    const signature = signPayload(payload);
    const token = `${payload}.${signature}`;

    await expect(exchangeIntegratorToken(token)).resolves.toBeNull();
  });
});
