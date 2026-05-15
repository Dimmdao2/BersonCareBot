import type { Pool, QueryResult } from "pg";
import { describe, expect, it, vi } from "vitest";
import { classifyChannelBindingOwnerForLink } from "./channelLinkClaim";

const STUB_ID = "11111111-1111-4111-8111-111111111111";

function makeQueryable(sequence: Array<{ rows: unknown[] }>): Pick<Pool, "query"> {
  let idx = 0;
  const query = vi.fn(async (): Promise<QueryResult> => {
    const row = sequence[idx];
    if (row === undefined) {
      throw new Error(`classifyChannelBindingOwnerForLink: unexpected query index ${idx}`);
    }
    idx += 1;
    return {
      rows: row.rows,
      rowCount: row.rows.length,
      command: "",
      oid: 0,
      fields: [],
    };
  });
  return { query: query as Pool["query"] };
}

describe("classifyChannelBindingOwnerForLink", () => {
  it("returns disposable when stub matches all conservative checks", async () => {
    const db = makeQueryable([
      { rows: [{ merged_into_id: null, phone_normalized: null, role: "client" }] },
      { rows: [{ c: "1" }] },
      { rows: [{ c: "0" }] },
      { rows: [{ c: "0" }] },
      { rows: [{ c: "0" }] },
      { rows: [{ c: "0" }] },
      { rows: [{ c: "0" }] },
      { rows: [{ c: "0" }] },
    ]);
    await expect(classifyChannelBindingOwnerForLink(db, STUB_ID)).resolves.toEqual({ kind: "disposable" });
    expect(db.query).toHaveBeenCalledTimes(8);
  });

  it("returns real stub_user_missing when platform_users row absent", async () => {
    const db = makeQueryable([{ rows: [] }]);
    await expect(classifyChannelBindingOwnerForLink(db, STUB_ID)).resolves.toEqual({
      kind: "real",
      reason: "stub_user_missing",
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("returns real stub_has_phone when phone_normalized set", async () => {
    const db = makeQueryable([
      { rows: [{ merged_into_id: null, phone_normalized: "+79001234567", role: "client" }] },
    ]);
    await expect(classifyChannelBindingOwnerForLink(db, STUB_ID)).resolves.toEqual({
      kind: "real",
      reason: "stub_has_phone",
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("returns real stub_multiple_channel_bindings when binding count > 1", async () => {
    const db = makeQueryable([
      { rows: [{ merged_into_id: null, phone_normalized: null, role: "client" }] },
      { rows: [{ c: "2" }] },
    ]);
    await expect(classifyChannelBindingOwnerForLink(db, STUB_ID)).resolves.toEqual({
      kind: "real",
      reason: "stub_multiple_channel_bindings",
    });
  });

  it("returns real stub_no_channel_bindings when binding count is 0", async () => {
    const db = makeQueryable([
      { rows: [{ merged_into_id: null, phone_normalized: null, role: "client" }] },
      { rows: [{ c: "0" }] },
    ]);
    await expect(classifyChannelBindingOwnerForLink(db, STUB_ID)).resolves.toEqual({
      kind: "real",
      reason: "stub_no_channel_bindings",
    });
  });

  it("returns real stub_has_oauth when oauth bindings exist", async () => {
    const db = makeQueryable([
      { rows: [{ merged_into_id: null, phone_normalized: null, role: "client" }] },
      { rows: [{ c: "1" }] },
      { rows: [{ c: "1" }] },
    ]);
    await expect(classifyChannelBindingOwnerForLink(db, STUB_ID)).resolves.toEqual({
      kind: "real",
      reason: "stub_has_oauth",
    });
  });

  it("returns real stub_has_non_system_symptom_trackings when meaningful symptoms exist", async () => {
    const db = makeQueryable([
      { rows: [{ merged_into_id: null, phone_normalized: null, role: "client" }] },
      { rows: [{ c: "1" }] },
      { rows: [{ c: "0" }] },
      { rows: [{ c: "1" }] },
    ]);
    await expect(classifyChannelBindingOwnerForLink(db, STUB_ID)).resolves.toEqual({
      kind: "real",
      reason: "stub_has_non_system_symptom_trackings",
    });
  });
});
