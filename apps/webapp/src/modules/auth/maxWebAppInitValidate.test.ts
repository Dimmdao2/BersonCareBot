import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseMaxWebAppInitDataValidated } from "./maxWebAppInitValidate";

function buildSignedMaxInitData(botToken: string, userId: number): string {
  const authDate = Math.floor(Date.now() / 1000);
  const user = JSON.stringify({
    id: userId,
    first_name: "Max",
    last_name: "User",
    username: null,
    language_code: "ru",
    photo_url: null,
  });
  const pairs: [string, string][] = [
    ["auth_date", String(authDate)],
    ["query_id", "4c0ab423-342b-4e45-aea4-2747dbc500cd"],
    ["user", user],
  ];
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  const launchParams = pairs.map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = createHmac("sha256", Buffer.from("WebAppData", "utf8")).update(botToken, "utf8").digest();
  const hashHex = createHmac("sha256", secretKey).update(launchParams, "utf8").digest("hex");
  const all: [string, string][] = [...pairs, ["hash", hashHex]];
  return all.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

describe("parseMaxWebAppInitDataValidated", () => {
  it("accepts correctly signed initData", () => {
    const token = "test-max-bot-token-32chars!!";
    const raw = buildSignedMaxInitData(token, 207278131);
    const parsed = parseMaxWebAppInitDataValidated(raw, token);
    expect(parsed).toEqual({
      maxUserId: "207278131",
      displayName: "Max User",
    });
  });

  it("rejects wrong token", () => {
    const token = "test-max-bot-token-32chars!!";
    const raw = buildSignedMaxInitData(token, 1);
    expect(parseMaxWebAppInitDataValidated(raw, "other-token")).toBeNull();
  });

  it("rejects tampered payload", () => {
    const token = "test-max-bot-token-32chars!!";
    let raw = buildSignedMaxInitData(token, 1);
    raw = raw.replace(encodeURIComponent("1"), encodeURIComponent("2"));
    expect(parseMaxWebAppInitDataValidated(raw, token)).toBeNull();
  });
});
