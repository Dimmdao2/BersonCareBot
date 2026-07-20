import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath: string): string {
  return readFileSync(join(srcRoot, relativePath), "utf8");
}

describe("staff recovery route isolation", () => {
  it("keeps general account mutations behind the guard that rejects restricted sessions", () => {
    expect(read("app/api/doctor/account/email/route.ts")).toContain("requireDoctorApiSession");
    expect(read("app/api/doctor/account/timezone/route.ts")).toContain("requireDoctorApiSession");
    expect(read("app/api/account/first-run/bind-specialist/route.ts")).toContain(
      "requireAdminWorkspaceApiContext",
    );
  });

  it("exposes factor replacement through the identity-self security guard only", () => {
    for (const route of [
      "app/api/account/security/status/route.ts",
      "app/api/account/security/totp/start/route.ts",
      "app/api/account/security/totp/verify/route.ts",
      "app/api/account/security/recovery/confirm/route.ts",
      "app/api/account/security/sessions/revoke/route.ts",
    ]) {
      const source = read(route);
      expect(source).toContain("requireStaffSecurityApiSession");
      expect(source).not.toContain("requireDoctorWorkspaceApiContext");
    }
  });
});
