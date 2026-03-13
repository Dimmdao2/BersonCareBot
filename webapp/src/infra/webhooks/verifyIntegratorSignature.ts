import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";

function sign(value: string): string {
  return createHmac("sha256", env.INTEGRATOR_SHARED_SECRET).update(value).digest("base64url");
}

export function verifyIntegratorSignature(timestamp: string, body: string, signature: string): boolean {
  const expected = sign(`${timestamp}.${body}`);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);

  return left.length === right.length && timingSafeEqual(left, right);
}
