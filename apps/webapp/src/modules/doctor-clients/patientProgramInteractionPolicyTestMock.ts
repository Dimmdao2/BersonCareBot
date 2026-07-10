import { vi } from "vitest";
import type { PatientProgramInteractionPolicy } from "./supportPolicy";

const DEFAULT_POLICY: PatientProgramInteractionPolicy = {
  organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  onSupport: true,
  commentsAllowed: true,
  mediaAllowed: true,
};

/** Mock `deps.doctorClients` for patient API route tests (support policy gate). */
export function createDoctorClientsPolicyTestMock(
  policy: Partial<PatientProgramInteractionPolicy> = {},
) {
  const resolved: PatientProgramInteractionPolicy = { ...DEFAULT_POLICY, ...policy };
  return {
    getPatientProgramInteractionPolicy: vi.fn().mockResolvedValue(resolved),
  };
}
