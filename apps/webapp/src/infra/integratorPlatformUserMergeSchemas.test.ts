/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  integratorMergeBodySchema,
  integratorUserIdNumericKey,
  parseIntegratorMergeHttpDetails,
  parseIntegratorMergeHttpError,
  platformUserMergePrecheckRowSchema,
} from "./integratorPlatformUserMergeSchemas";

const T = "00000000-0000-4000-8000-000000000011";
const D = "00000000-0000-4000-8000-000000000022";

describe("integratorPlatformUserMergeSchemas", () => {
  it("integratorMergeBodySchema accepts valid body", () => {
    const r = integratorMergeBodySchema.safeParse({ targetId: T, duplicateId: D, dryRun: true });
    expect(r.success).toBe(true);
  });

  it("integratorMergeBodySchema rejects non-uuid ids", () => {
    const r = integratorMergeBodySchema.safeParse({ targetId: "x", duplicateId: D });
    expect(r.success).toBe(false);
  });

  it("platformUserMergePrecheckRowSchema accepts integrator_user_id as numeric string", () => {
    const r = platformUserMergePrecheckRowSchema.safeParse({
      id: T,
      role: "client",
      merged_into_id: null,
      integrator_user_id: "200",
    });
    expect(r.success).toBe(true);
  });

  it("parseIntegratorMergeHttpError parses USER_NOT_FOUND payload", () => {
    const parsed = parseIntegratorMergeHttpError(
      JSON.stringify({ error: "USER_NOT_FOUND", missingIntegratorUserIds: ["200"] }),
    );
    expect(parsed?.error).toBe("USER_NOT_FOUND");
    expect(parsed?.missingIntegratorUserIds).toEqual(["200"]);
  });

  it("parseIntegratorMergeHttpError returns null for invalid JSON", () => {
    expect(parseIntegratorMergeHttpError("not-json")).toBeNull();
  });

  it("parseIntegratorMergeHttpError returns null for JSON array", () => {
    expect(parseIntegratorMergeHttpError("[1,2]")).toBeNull();
  });

  it("parseIntegratorMergeHttpDetails returns parsed object for M2M error JSON", () => {
    const body = JSON.stringify({ error: "CONFLICT", extra: true });
    expect(parseIntegratorMergeHttpDetails(body)).toEqual({ error: "CONFLICT", extra: true });
  });

  it("parseIntegratorMergeHttpDetails returns raw text when JSON invalid", () => {
    expect(parseIntegratorMergeHttpDetails("plain-error")).toBe("plain-error");
  });

  it("integratorUserIdNumericKey normalizes integrator ids", () => {
    expect(integratorUserIdNumericKey("200")).toBe("200");
    expect(integratorUserIdNumericKey(" 200 ")).toBe("200");
  });
});
