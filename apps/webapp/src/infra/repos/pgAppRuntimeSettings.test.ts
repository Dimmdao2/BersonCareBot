/** @vitest-environment node */

import {
  getCurrentDbPrincipal,
  runWithDbPatientPrincipal,
  runWithDbStaffPrincipal,
} from "@bersoncare/db-principal";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentWebappDbOperationFamily } from "@/infra/db/saasIsolationOperationContext";
import { createPgAppRuntimeSettingsPort } from "@/infra/repos/pgAppRuntimeSettings";

const { runWebappPgTextMock } = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(),
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

const ORGANIZATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("createPgAppRuntimeSettingsPort", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it.each([
    ["staff", runWithDbStaffPrincipal],
    ["patient", runWithDbPatientPrincipal],
  ] as const)("uses a nested bootstrap checkout for public config under an outer %s principal", async (kind, runOuter) => {
    runWebappPgTextMock.mockImplementation(async () => {
      expect(getCurrentDbPrincipal()?.kind).toBe("bootstrap");
      expect(getCurrentWebappDbOperationFamily()).toBe("public_auth_config");
      return {
        rows: [{
          key: "oauth_google_enabled",
          scope: "admin",
          organization_id: null,
          audience: "public",
          value_json: { value: true },
        }],
      };
    });

    const port = createPgAppRuntimeSettingsPort();
    await runOuter({ organizationId: ORGANIZATION_ID, platformUserId: USER_ID }, async () => {
      expect(getCurrentDbPrincipal()?.kind).toBe(kind);
      await port.getEffective({
        key: "oauth_google_enabled",
        scope: "admin",
        organizationId: null,
        allowedAudiences: ["public"],
        operationFamily: "public_auth_config",
      });
      expect(getCurrentDbPrincipal()?.kind).toBe(kind);
      expect(getCurrentWebappDbOperationFamily()).toBeUndefined();
    });

    expect(getCurrentDbPrincipal()).toBeUndefined();
    expect(getCurrentWebappDbOperationFamily()).toBeUndefined();
  });
});
