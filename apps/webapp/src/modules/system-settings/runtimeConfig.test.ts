import { describe, expect, it, vi } from "vitest";
import { createRuntimeConfigProvider, type RuntimeConfigPort } from "./runtimeConfig";

const context = {
  patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

describe("runtime config provider", () => {
  it("resolves a typed boolean flag through the generic safe port", async () => {
    const getEffective = vi.fn<RuntimeConfigPort["getEffective"]>().mockResolvedValue({
      key: "patient_program_discussion_ui_enabled",
      scope: "admin",
      organizationId: context.organizationId,
      audience: "authenticated_client",
      valueJson: { value: true },
    });
    const provider = createRuntimeConfigProvider({ getEffective });

    await expect(
      provider.isFlagEnabled("patient_program_discussion_ui_enabled", context),
    ).resolves.toBe(true);
    expect(getEffective).toHaveBeenCalledWith({
      key: "patient_program_discussion_ui_enabled",
      scope: "admin",
      organizationId: context.organizationId,
      allowedAudiences: ["authenticated_client", "public"],
    });
  });

  it("fails closed for missing or invalid values", async () => {
    const getEffective = vi.fn<RuntimeConfigPort["getEffective"]>().mockResolvedValue({
      key: "patient_program_discussion_ui_enabled",
      scope: "admin",
      organizationId: null,
      audience: "authenticated_client",
      valueJson: { value: "true" },
    });
    const provider = createRuntimeConfigProvider({ getEffective });

    await expect(
      provider.isFlagEnabled("patient_program_discussion_ui_enabled", context),
    ).resolves.toBe(false);
    await expect(
      provider.isFlagEnabled("patient_program_discussion_ui_enabled", { ...context, organizationId: "" }),
    ).rejects.toThrow("runtime_config_context_required");
  });

  it("resolves patient-safe doctor support defaults through the same generic port", async () => {
    const getEffective = vi.fn<RuntimeConfigPort["getEffective"]>().mockResolvedValue({
      key: "doctor_patient_support_comments_without_support_default_enabled",
      scope: "doctor",
      organizationId: null,
      audience: "authenticated_client",
      valueJson: { value: true },
    });
    const provider = createRuntimeConfigProvider({ getEffective });

    await expect(
      provider.getBoolean(
        "doctor_patient_support_comments_without_support_default_enabled",
        context,
      ),
    ).resolves.toBe(true);
    expect(getEffective).toHaveBeenCalledWith({
      key: "doctor_patient_support_comments_without_support_default_enabled",
      scope: "doctor",
      organizationId: context.organizationId,
      allowedAudiences: ["authenticated_client", "public"],
    });
  });
});
