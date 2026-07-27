import { describe, expect, it } from "vitest";

import { isPasswordBearingSettingKey, redactSettingValueForAudit } from "./auditRedaction";

describe("redactSettingValueForAudit", () => {
  it("removes the IMAP password from anything bound for the audit trail", () => {
    const out = redactSettingValueForAudit("operator_health_imap", {
      value: { host: "imap.example.org", port: 993, login: "probe@example.org", password: "s3cret", folder: "INBOX" },
    }) as { value: Record<string, unknown> };
    expect(out.value.password).toBe("[REDACTED]");
    expect(out.value.host).toBe("imap.example.org");
    expect(JSON.stringify(out)).not.toContain("s3cret");
  });

  it("keeps the SMTP password out too — the ledger is durable, unlike a log line", () => {
    const out = redactSettingValueForAudit("smtp_outbound", {
      value: { host: "mail.example.org", user: "no-reply@example.org", password: "hunter2" },
    });
    expect(JSON.stringify(out)).not.toContain("hunter2");
  });

  it("renders an empty password as empty, not as a fake redaction marker", () => {
    const out = redactSettingValueForAudit("operator_health_imap", { value: { password: "   " } }) as {
      value: Record<string, unknown>;
    };
    expect(out.value.password).toBe("");
  });

  it("passes non-secret settings through untouched", () => {
    const value = { value: { intervalMs: 600_000 } };
    expect(redactSettingValueForAudit("operator_health_probe_config", value)).toBe(value);
    expect(isPasswordBearingSettingKey("operator_health_probe_config")).toBe(false);
  });
});
