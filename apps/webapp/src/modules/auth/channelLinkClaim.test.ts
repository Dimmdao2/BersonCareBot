import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyChannelBindingOwnerForLink } from "@/infra/repos/pgChannelLinkClaim";

const STUB_ID = "11111111-1111-4111-8111-111111111111";

const runWebappPgTextMock = vi.fn();

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

function mockSequence(sequence: Array<{ rows: unknown[] }>): void {
  let idx = 0;
  runWebappPgTextMock.mockImplementation(async () => {
    const row = sequence[idx];
    if (row === undefined) {
      throw new Error(`classifyChannelBindingOwnerForLink: unexpected query index ${idx}`);
    }
    idx += 1;
    return { rows: row.rows };
  });
}

describe("classifyChannelBindingOwnerForLink", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("returns disposable when stub matches all conservative checks", async () => {
    mockSequence([
      { rows: [{ merged_into_id: null, phone_normalized: null, role: "client" }] },
      { rows: [{ c: "1" }] },
      { rows: [{ c: "0" }] },
      { rows: [{ c: "0" }] },
      { rows: [{ c: "0" }] },
      { rows: [{ c: "0" }] },
      { rows: [{ c: "0" }] },
      { rows: [{ c: "0" }] },
    ]);
    await expect(classifyChannelBindingOwnerForLink({} as never, STUB_ID)).resolves.toEqual({ kind: "disposable" });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(8);
  });

  it("returns real stub_user_missing when platform_users row absent", async () => {
    mockSequence([{ rows: [] }]);
    await expect(classifyChannelBindingOwnerForLink({} as never, STUB_ID)).resolves.toEqual({
      kind: "real",
      reason: "stub_user_missing",
    });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
  });

  it("returns real stub_has_phone when phone_normalized set", async () => {
    mockSequence([
      { rows: [{ merged_into_id: null, phone_normalized: "+79001234567", role: "client" }] },
    ]);
    await expect(classifyChannelBindingOwnerForLink({} as never, STUB_ID)).resolves.toEqual({
      kind: "real",
      reason: "stub_has_phone",
    });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
  });

  it("returns real stub_multiple_channel_bindings when binding count > 1", async () => {
    mockSequence([
      { rows: [{ merged_into_id: null, phone_normalized: null, role: "client" }] },
      { rows: [{ c: "2" }] },
    ]);
    await expect(classifyChannelBindingOwnerForLink({} as never, STUB_ID)).resolves.toEqual({
      kind: "real",
      reason: "stub_multiple_channel_bindings",
    });
  });

  it("returns real stub_no_channel_bindings when binding count is 0", async () => {
    mockSequence([
      { rows: [{ merged_into_id: null, phone_normalized: null, role: "client" }] },
      { rows: [{ c: "0" }] },
    ]);
    await expect(classifyChannelBindingOwnerForLink({} as never, STUB_ID)).resolves.toEqual({
      kind: "real",
      reason: "stub_no_channel_bindings",
    });
  });

  it("returns real stub_has_oauth when oauth bindings exist", async () => {
    mockSequence([
      { rows: [{ merged_into_id: null, phone_normalized: null, role: "client" }] },
      { rows: [{ c: "1" }] },
      { rows: [{ c: "1" }] },
    ]);
    await expect(classifyChannelBindingOwnerForLink({} as never, STUB_ID)).resolves.toEqual({
      kind: "real",
      reason: "stub_has_oauth",
    });
  });

  it("returns real stub_has_non_system_symptom_trackings when meaningful symptoms exist", async () => {
    mockSequence([
      { rows: [{ merged_into_id: null, phone_normalized: null, role: "client" }] },
      { rows: [{ c: "1" }] },
      { rows: [{ c: "0" }] },
      { rows: [{ c: "1" }] },
    ]);
    await expect(classifyChannelBindingOwnerForLink({} as never, STUB_ID)).resolves.toEqual({
      kind: "real",
      reason: "stub_has_non_system_symptom_trackings",
    });
  });
});
