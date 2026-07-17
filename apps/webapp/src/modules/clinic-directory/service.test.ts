import { describe, expect, it, vi } from "vitest";
import { createClinicDirectoryService } from "./service";
import type { ClinicDirectoryPort } from "./ports";

function buildPort(resolved: string | null): ClinicDirectoryPort {
  return { resolveOrganizationIdBySlug: vi.fn(async () => resolved) };
}

describe("clinicDirectoryService", () => {
  it("normalizes case/whitespace before calling the port", async () => {
    const port = buildPort("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const service = createClinicDirectoryService(port);

    await expect(service.resolveOrganizationIdBySlug("  Clinic-A  ")).resolves.toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(port.resolveOrganizationIdBySlug).toHaveBeenCalledWith("clinic-a");
  });

  it("fails closed (null, no throw, no DB call) for malformed slug input without leaking why", async () => {
    const port = buildPort("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const service = createClinicDirectoryService(port);

    await expect(service.resolveOrganizationIdBySlug("../../etc/passwd")).resolves.toBeNull();
    await expect(service.resolveOrganizationIdBySlug("clinic a")).resolves.toBeNull();
    await expect(service.resolveOrganizationIdBySlug("")).resolves.toBeNull();
    await expect(service.resolveOrganizationIdBySlug("a".repeat(200))).resolves.toBeNull();
    expect(port.resolveOrganizationIdBySlug).not.toHaveBeenCalled();
  });

  it("passes through a null resolution unchanged (unknown/unpublished/inactive)", async () => {
    const port = buildPort(null);
    const service = createClinicDirectoryService(port);

    await expect(service.resolveOrganizationIdBySlug("saas-test-clinic-a")).resolves.toBeNull();
  });
});
