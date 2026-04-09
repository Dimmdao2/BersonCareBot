import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock })));

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { pgUserByPhonePort } from "./pgUserByPhone";

describe("pgUserByPhonePort.findByPhone", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("returns null when no user", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const u = await pgUserByPhonePort.findByPhone("+79991234567");
    expect(u).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when more than one row (ambiguous phone; safe degradation)", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: "a", display_name: "A", role: "client", phone_normalized: "+79991234567" },
        { id: "b", display_name: "B", role: "client", phone_normalized: "+79991234567" },
      ],
    });
    const u = await pgUserByPhonePort.findByPhone("+79991234567");
    expect(u).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("returns user when exactly one row", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: "u1" }],
      })
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
      })
      .mockResolvedValueOnce({
        rows: [{ id: "u1", display_name: "N", role: "client", phone_normalized: "+79991234567" }],
      })
      .mockResolvedValueOnce({
        rows: [] as { channel_code: string; external_id: string }[],
      });
    const u = await pgUserByPhonePort.findByPhone("+79991234567");
    expect(u).not.toBeNull();
    expect(u?.userId).toBe("u1");
    expect(queryMock).toHaveBeenCalledTimes(4);
  });
});
