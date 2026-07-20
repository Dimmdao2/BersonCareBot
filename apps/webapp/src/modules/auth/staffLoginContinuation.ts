import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env, isProduction } from "@/config/env";
import { decodeBase64Url, encodeBase64Url } from "@/shared/utils/base64url";

export const STAFF_LOGIN_CONTINUATION_COOKIE = "bersoncare_staff_factor";

type StaffLoginContinuation = {
  purpose: "staff_factor";
  userId: string;
  token: string;
  expiresAt: number;
};

function signature(payload: string): string {
  return createHmac("sha256", env.SESSION_COOKIE_SECRET)
    .update(`staff-login-continuation:v1:${payload}`)
    .digest("base64url");
}

function encode(value: StaffLoginContinuation): string {
  const payload = encodeBase64Url(JSON.stringify(value));
  return `${payload}.${signature(payload)}`;
}

function decode(raw: string): StaffLoginContinuation | null {
  const [payload, actualSignature] = raw.split(".");
  if (!payload || !actualSignature) return null;
  const expected = Buffer.from(signature(payload));
  const actual = Buffer.from(actualSignature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as StaffLoginContinuation;
    if (
      parsed.purpose !== "staff_factor" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.token !== "string" ||
      !Number.isSafeInteger(parsed.expiresAt) ||
      parsed.expiresAt <= Math.floor(Date.now() / 1000)
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

function cookieOptions(maxAge: number) {
  return { httpOnly: true as const, sameSite: "lax" as const, secure: isProduction, path: "/", maxAge };
}

export async function issueStaffLoginContinuation(input: {
  userId: string;
  token: string;
  expiresAt: string;
}): Promise<void> {
  const expiresAt = Math.floor(Date.parse(input.expiresAt) / 1000);
  const store = await cookies();
  store.set(
    STAFF_LOGIN_CONTINUATION_COOKIE,
    encode({ purpose: "staff_factor", userId: input.userId, token: input.token, expiresAt }),
    cookieOptions(Math.max(0, expiresAt - Math.floor(Date.now() / 1000))),
  );
}

export async function readStaffLoginContinuation(): Promise<StaffLoginContinuation | null> {
  const raw = (await cookies()).get(STAFF_LOGIN_CONTINUATION_COOKIE)?.value;
  return raw ? decode(raw) : null;
}

export async function clearStaffLoginContinuation(): Promise<void> {
  (await cookies()).set(STAFF_LOGIN_CONTINUATION_COOKIE, "", cookieOptions(0));
}
