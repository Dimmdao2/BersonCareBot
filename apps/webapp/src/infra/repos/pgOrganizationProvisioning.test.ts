import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("createPgOrganizationProvisioningPort", () => {
  it("routes public signup intent create/read through RLS definer functions", () => {
    const src = readFileSync(join(__dirname, "pgOrganizationProvisioning.ts"), "utf8");
    const publicSignupSrc = src.slice(src.indexOf("async createSpecialistSignupIntent"), src.indexOf("async provisionSpecialistOwner"));

    expect(publicSignupSrc).toContain("app.create_specialist_signup_intent");
    expect(publicSignupSrc).toContain("app.get_pending_specialist_signup_intent");
    expect(publicSignupSrc).toContain("app.get_specialist_signup_intent_by_challenge");
    expect(publicSignupSrc).not.toContain(".insert(specialistSignupIntents)");
    expect(publicSignupSrc).not.toContain(".from(specialistSignupIntents)");
  });

  it("routes specialist owner signup provisioning through the RLS definer function", () => {
    const src = readFileSync(join(__dirname, "pgOrganizationProvisioning.ts"), "utf8");
    const phase1Src = src.slice(src.indexOf("async provisionSpecialistOwner"), src.indexOf("async ensureOwnBookableSpecialist"));

    expect(phase1Src).toContain("runWebappTransaction");
    expect(phase1Src).toContain("SELECT * FROM app.provision_specialist_owner($1, $2)");
    expect(phase1Src).not.toContain(".insert(beOrganizations)");
    expect(phase1Src).not.toContain(".insert(beSpecialists)");
    expect(phase1Src).not.toContain("orgEnrollments");
  });

  it("keeps staff-context specialist backfill guarded on the current membership", () => {
    const src = readFileSync(join(__dirname, "pgOrganizationProvisioning.ts"), "utf8");

    expect(src).toContain("beSpecialists");
    expect(src).toContain("beOrganizationMembers");
    expect(src).toContain("ensureOwnBookableSpecialist");
    expect(src).toContain('.for("update")');
    expect(src).toContain("isNull(beOrganizationMembers.specialistId)");
  });
});
