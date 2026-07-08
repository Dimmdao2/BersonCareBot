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
    expect(sql).toContain("organization_id IS NULL");
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
    expect(sql).toContain("organization_id IS NULL");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["support_contact_url", ["admin"]]);
  });

	  it("upsert targets the global partial unique index", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            key: "dev_mode",
            scope: "admin",
            value_json: { value: true },
            updated_at: "2026-06-06T00:00:00.000Z",
            updated_by: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const port = createPgSystemSettingsPort();
    await port.upsert("dev_mode", "admin", { value: true }, null);

    const selectSql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    const upsertSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
    expect(selectSql).toContain("organization_id IS NULL");
    expect(upsertSql).toContain("ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE");
	  });

  it("upsert with organization context targets the org partial unique index", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            key: "support_contact_url",
            scope: "admin",
            organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            value_json: { value: "https://org.example" },
            updated_at: "2026-06-06T00:00:00.000Z",
            updated_by: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const port = createPgSystemSettingsPort();
    const row = await port.upsert("support_contact_url", "admin", { value: "https://org.example" }, null, {
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    const selectSql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    const upsertSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
    const auditSql = String(runWebappPgTextMock.mock.calls[2]?.[0] ?? "");
    expect(selectSql).toContain("organization_id = $3::uuid");
    expect(upsertSql).toContain(
      "ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO UPDATE",
    );
    expect(auditSql).toContain("organization_id");
    expect(row.organizationId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("getByKey with organization context prefers org row before global fallback", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          key: "support_contact_url",
          scope: "admin",
          organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          value_json: { value: "org" },
          updated_at: "2026-06-06T00:00:00.000Z",
          updated_by: null,
        },
      ],
    });

    const port = createPgSystemSettingsPort();
    const row = await port.getByKey("support_contact_url", "admin", {
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("organization_id = $3::uuid OR organization_id IS NULL");
    expect(sql).toContain("ORDER BY organization_id IS NULL ASC");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
      "support_contact_url",
      "admin",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]);
    expect(row?.organizationId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("getByScope with organization context merges one row per key", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });

    const port = createPgSystemSettingsPort();
    await port.getByScope("admin", { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });

    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("SELECT DISTINCT ON (key)");
    expect(sql).toContain("organization_id = $2::uuid OR organization_id IS NULL");
    expect(sql).toContain("ORDER BY key, organization_id IS NULL ASC");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
      "admin",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]);
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

  it("readSystemSettingInnerValueByScopes with organization context picks per-scope org fallback rows", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ scope: "admin", organization_id: null, value_json: { value: "global" } }],
    });

    await expect(
      readSystemSettingInnerValueByScopes("support_contact_url", ["admin"], {
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).resolves.toBe("global");

    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("SELECT DISTINCT ON (scope)");
    expect(sql).toContain("organization_id = $3::uuid OR organization_id IS NULL");
    expect(sql).toContain("ORDER BY scope, organization_id IS NULL ASC");
  });

  it("readAdminSystemSettingBoolean supports string boolean envelopes", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ scope: "admin", value_json: { value: "false" } }],
    });

    await expect(readAdminSystemSettingBoolean("booking_rubitime_bridge_enabled", true)).resolves.toBe(false);
  });
});
