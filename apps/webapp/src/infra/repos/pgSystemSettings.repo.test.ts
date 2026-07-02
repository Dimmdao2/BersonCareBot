import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runWebappPgTextMock, runWebappTransactionMock } = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(),
  runWebappTransactionMock: vi.fn(),
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  runWebappTransaction: (...args: unknown[]) => runWebappTransactionMock(...args),
}));

import {
  createPgSystemSettingsPort,
  readAdminSystemSettingBoolean,
  readAdminSystemSettingString,
  readSystemSettingInnerValueByScopes,
} from "./pgSystemSettings";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("pgSystemSettings (runtime constraints)", () => {
  it("uses runWebappPgText only — no getPool / pool.query / client.query", () => {
    const src = readFileSync(join(__dirname, "pgSystemSettings.ts"), "utf8");
    expect(src).not.toMatch(/\bgetPool\b/);
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).not.toMatch(/\bclient\.query\b/);
    expect(src).toContain("runWebappPgText");
    expect(src).toContain("runWebappTransaction");
  });
});

describe("createPgSystemSettingsPort (repo SQL parity)", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappTransactionMock.mockReset();
    runWebappTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({}));
  });

  it("getByKey selects by key and scope", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgSystemSettingsPort();
    await port.getByKey("support_contact_url", "admin");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("FROM system_settings");
    expect(sql).toContain("key = $1 AND scope = $2");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["support_contact_url", "admin"]);
  });

  it("upsertManyInTransaction uses runWebappTransaction", async () => {
    runWebappPgTextMock.mockResolvedValue({
      rows: [
        {
          key: "dev_mode",
          scope: "admin",
          value_json: { value: true },
          updated_at: "2026-06-06T00:00:00.000Z",
          updated_by: null,
        },
      ],
    });
    const port = createPgSystemSettingsPort();
    const out = await port.upsertManyInTransaction([
      { key: "dev_mode", scope: "admin", valueJson: { value: true }, updatedBy: null },
    ]);
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(1);
    expect(out[0]?.key).toBe("dev_mode");
  });

  it("readAdminSystemSettingString returns admin envelope value as string", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ scope: "admin", value_json: { value: " configured " } }],
    });

    await expect(readAdminSystemSettingString("support_contact_url")).resolves.toBe("configured");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("FROM system_settings");
    expect(sql).toContain("scope = ANY($2::text[])");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["support_contact_url", ["admin"]]);
  });

  it("readSystemSettingInnerValueByScopes preserves caller scope priority", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        { scope: "admin", value_json: { value: false } },
        { scope: "doctor", value_json: { value: true } },
      ],
    });

    await expect(readSystemSettingInnerValueByScopes("sms_fallback_enabled", ["doctor", "admin"])).resolves.toBe(true);
  });

  it("readAdminSystemSettingBoolean supports string boolean envelopes", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ scope: "admin", value_json: { value: "false" } }],
    });

    await expect(readAdminSystemSettingBoolean("booking_rubitime_bridge_enabled", true)).resolves.toBe(false);
  });
});
