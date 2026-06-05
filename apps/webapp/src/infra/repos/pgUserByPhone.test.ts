import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({ query: queryMock }),
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  runPgPoolPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  getWebappSqlFromPgClient: (client: unknown) => client,
}));

import { pgUserByPhonePort } from "./pgUserByPhone";

describe("pgUserByPhonePort.findByPhone", () => {
  beforeEach(() => {
    queryMock.mockReset();
    runWebappPgTextMock.mockReset();
  });

  it("returns null when no user", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const u = await pgUserByPhonePort.findByPhone("+79991234567");
    expect(u).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });

  it("returns null when more than one row (ambiguous phone; safe degradation)", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "a" }, { id: "b" }],
    });
    const u = await pgUserByPhonePort.findByPhone("+79991234567");
    expect(u).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });

  it("returns user when exactly one row", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "u1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "u1",
            phone_normalized: "+79991234567",
            integrator_user_id: null,
            merged_into_id: null,
            display_name: "N",
            role: "client",
          },
        ],
      });
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [{ id: "u1", display_name: "N", first_name: null, role: "client", phone_normalized: "+79991234567" }],
      })
      .mockResolvedValueOnce({ rows: [] as { channel_code: string; external_id: string }[] });

    const u = await pgUserByPhonePort.findByPhone("+79991234567");
    expect(u).not.toBeNull();
    expect(u?.userId).toBe("u1");
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
  });
});

describe("pgUserByPhonePort read helpers", () => {
  beforeEach(() => {
    queryMock.mockReset();
    runWebappPgTextMock.mockReset();
  });

  it("getPhoneByUserId returns normalized phone", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "u1",
          phone_normalized: "+79991234567",
          integrator_user_id: null,
          merged_into_id: null,
          display_name: "N",
          role: "client",
        },
      ],
    });
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ phone_normalized: "+79991234567" }] });

    const phone = await pgUserByPhonePort.getPhoneByUserId("u1");
    expect(phone).toBe("+79991234567");
  });

  it("findByUserId returns null when canonical user missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const user = await pgUserByPhonePort.findByUserId("missing");
    expect(user).toBeNull();
  });
});
