import { describe, expect, it } from "vitest";
import { httpFromDatabaseError } from "./_httpErrors";

describe("httpFromDatabaseError", () => {
  it("maps 23505 to 409 unique_violation", () => {
    const e = Object.assign(new Error("duplicate"), { code: "23505" });
    expect(httpFromDatabaseError(e)).toEqual({ status: 409, error: "unique_violation" });
  });

  it("maps 23503 to 400 foreign_key_violation", () => {
    const e = Object.assign(new Error("fk"), { code: "23503" });
    expect(httpFromDatabaseError(e)).toEqual({ status: 400, error: "foreign_key_violation" });
  });

  it("maps duplicate key message to 409", () => {
    expect(
      httpFromDatabaseError(new Error('duplicate key value violates unique constraint "uq_x"')),
    ).toEqual({ status: 409, error: "unique_violation" });
  });

  it("returns null for unrelated errors", () => {
    expect(httpFromDatabaseError(new Error("timeout"))).toBeNull();
  });
});
