import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const mutatingRouteFiles = [
  "src/app/api/doctor/clients/[userId]/notes/route.ts",
  "src/app/api/doctor/clients/[userId]/support-settings/route.ts",
  "src/app/api/doctor/clients/[userId]/tasks/route.ts",
  "src/app/api/doctor/tasks/route.ts",
  "src/app/api/doctor/tasks/[taskId]/route.ts",
  "src/app/api/doctor/tasks/[taskId]/complete/route.ts",
] as const;

const principalBackedRepoFiles = [
  "src/infra/repos/pgDoctorNotes.ts",
  "src/infra/repos/pgDoctorPatientSupport.ts",
  "src/infra/repos/pgSpecialistTasks.ts",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("doctor support/task workspace principal cutover", () => {
  it.each(mutatingRouteFiles)("%s wraps mutating work in doctor workspace principal", (file) => {
    const src = readSource(file);
    expect(src).toContain("requireDoctorWorkspaceApiContext");
    expect(src).toContain("withDoctorWorkspacePrincipal");
  });

  it.each(principalBackedRepoFiles)("%s uses principal-aware transactions and organization stamping", (file) => {
    const src = readSource(file);
    expect(src).toContain("runDrizzleMutationTransaction");
    expect(src).toContain("organizationId: currentWriteOrganizationId");
  });

  it("task update/delete/complete routes reject tasks outside the selected workspace", () => {
    const taskRoute = readSource("src/app/api/doctor/tasks/[taskId]/route.ts");
    const completeRoute = readSource("src/app/api/doctor/tasks/[taskId]/complete/route.ts");
    expect(taskRoute).toContain("existing.organizationId !== gate.ctx.organizationId");
    expect(completeRoute).toContain("existing.organizationId !== gate.ctx.organizationId");
  });

  it("patient-bound create routes resolve the patient inside the selected organization", () => {
    for (const file of [
      "src/app/api/doctor/clients/[userId]/notes/route.ts",
      "src/app/api/doctor/clients/[userId]/support-settings/route.ts",
      "src/app/api/doctor/clients/[userId]/tasks/route.ts",
      "src/app/api/doctor/tasks/route.ts",
    ]) {
      const src = readSource(file);
      expect(src).toContain("getClientIdentityForOrganization");
      expect(src).toContain("gate.ctx.organizationId");
    }
  });
});
