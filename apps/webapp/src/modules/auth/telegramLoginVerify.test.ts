import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  TELEGRAM_LOGIN_AUTH_MAX_AGE_SEC,
  verifyTelegramLoginWidgetSignature,
} from "./telegramLoginVerify";

function widgetHash(botToken: string, fields: Record<string, string>): string {
  const pairs = Object.entries(fields)
    .filter(([k]) => k !== "hash")
    .sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  return createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

describe("verifyTelegramLoginWidgetSignature", () => {
  const botToken = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

  it("accepts valid signature", () => {
    const auth_date = String(Math.floor(Date.now() / 1000));
    const id = "424242424";
    const hash = widgetHash(botToken, {
      auth_date,
      first_name: "Ann",
      id,
    });
    const r = verifyTelegramLoginWidgetSignature(
      { auth_date, first_name: "Ann", id, hash },
      botToken,
    );
    expect(r).toEqual({ ok: true, telegramId: id });
  });

  it("rejects wrong hash", () => {
    const auth_date = String(Math.floor(Date.now() / 1000));
    const r = verifyTelegramLoginWidgetSignature(
      { auth_date, id: "1", hash: "00".repeat(32) },
      botToken,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_hash");
  });

  it("rejects expired auth_date", () => {
    const auth_date = String(Math.floor(Date.now() / 1000) - TELEGRAM_LOGIN_AUTH_MAX_AGE_SEC - 120);
    const id = "1";
    const hash = widgetHash(botToken, { auth_date, id });
    const r = verifyTelegramLoginWidgetSignature({ auth_date, id, hash }, botToken);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });
});
