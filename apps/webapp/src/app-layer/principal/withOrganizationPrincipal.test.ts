import { describe, expect, it } from "vitest";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import {
  withDoctorWorkspacePrincipal,
  withExplicitOrganizationPrincipal,
} from "./withOrganizationPrincipal";

const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

describe("withExplicitOrganizationPrincipal", () => {
  it("runs work under the requested organization principal and clears it afterwards", async () => {
    const value = await withExplicitOrganizationPrincipal(
      {
        organizationId: ORGANIZATION_ID,
        source: "unit-test",
      },
      async () => {
        expect(getCurrentDbPrincipalOrganizationId()).toBe(ORGANIZATION_ID);
        return "ok";
      },
    );

    expect(value).toBe("ok");
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });

  it("rejects an empty source before entering principal context", async () => {
    await expect(
      withExplicitOrganizationPrincipal(
        {
          organizationId: ORGANIZATION_ID,
          source: " ",
        },
        async () => {
          throw new Error("should_not_run");
        },
      ),
    ).rejects.toThrow("principal_source_required");

    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });
});

describe("withDoctorWorkspacePrincipal", () => {
  it("uses the resolved doctor workspace organization id", async () => {
    const result = await withDoctorWorkspacePrincipal(
      { organizationId: ORGANIZATION_ID },
      "doctor-workspace-test",
      async () => getCurrentDbPrincipalOrganizationId(),
    );

    expect(result).toBe(ORGANIZATION_ID);
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });
});
