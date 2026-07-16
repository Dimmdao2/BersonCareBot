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
      operationFamily: "patient_runtime_config",
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
      operationFamily: "patient_runtime_config",
    });
  });

  it("resolves the bounded patient treatment cooldown without reading restricted settings", async () => {
    const getEffective = vi.fn<RuntimeConfigPort["getEffective"]>().mockResolvedValue({
      key: "patient_treatment_plan_item_done_repeat_cooldown_minutes",
      scope: "admin",
      organizationId: context.organizationId,
      audience: "authenticated_client",
      valueJson: { value: 75 },
    });
    const provider = createRuntimeConfigProvider({ getEffective });

    await expect(
      provider.getInteger(
        "patient_treatment_plan_item_done_repeat_cooldown_minutes",
        context,
      ),
    ).resolves.toBe(75);
    expect(getEffective).toHaveBeenCalledWith({
      key: "patient_treatment_plan_item_done_repeat_cooldown_minutes",
      scope: "admin",
      organizationId: context.organizationId,
      allowedAudiences: ["authenticated_client", "public"],
      operationFamily: "patient_runtime_config",
    });
  });

  it("clamps legacy cooldown values and uses the default for a missing row", async () => {
    const getEffective = vi.fn<RuntimeConfigPort["getEffective"]>()
      .mockResolvedValueOnce({
        key: "patient_treatment_plan_item_done_repeat_cooldown_minutes",
        scope: "admin",
        organizationId: null,
        audience: "authenticated_client",
        valueJson: { value: 181 },
      })
      .mockResolvedValueOnce(null);
    const provider = createRuntimeConfigProvider({ getEffective });

    await expect(
      provider.getInteger("patient_treatment_plan_item_done_repeat_cooldown_minutes", context),
    ).resolves.toBe(180);
    await expect(
      provider.getInteger("patient_treatment_plan_item_done_repeat_cooldown_minutes", context),
    ).resolves.toBe(60);
  });

  it("uses the closed public operation and fails safe on a DB error", async () => {
    const getEffective = vi.fn<RuntimeConfigPort["getEffective"]>()
      .mockRejectedValue(new Error("permission denied"));
    const provider = createRuntimeConfigProvider({ getEffective });

    await expect(
      provider.getPublicBoolean("oauth_google_enabled", "public_auth_config"),
    ).resolves.toBe(false);
    expect(getEffective).toHaveBeenCalledWith({
      key: "oauth_google_enabled",
      scope: "admin",
      organizationId: null,
      allowedAudiences: ["public"],
      operationFamily: "public_auth_config",
    });
  });

  it("keeps patient booking resolution scoped to the active organization", async () => {
    const getEffective = vi.fn<RuntimeConfigPort["getEffective"]>().mockResolvedValue({
      key: "patient_booking_url",
      scope: "admin",
      organizationId: context.organizationId,
      audience: "authenticated_client",
      valueJson: { value: "https://booking.example.test" },
    });
    const provider = createRuntimeConfigProvider({ getEffective });

    await expect(
      provider.getAuthenticatedString("patient_booking_url", context.organizationId),
    ).resolves.toBe("https://booking.example.test");
    expect(getEffective).toHaveBeenCalledWith({
      key: "patient_booking_url",
      scope: "admin",
      organizationId: context.organizationId,
      allowedAudiences: ["authenticated_client", "public"],
      operationFamily: "patient_runtime_config",
    });
  });
});
