import { describe, expect, it } from "vitest";
import {
  ALLOWED_KEYS,
  RESTRICTED_SYSTEM_SETTING_KEYS,
  RUNTIME_FLAG_DEFINITIONS,
  RUNTIME_SYSTEM_SETTING_KEYS,
  SYSTEM_SETTING_REGISTRY,
} from "./registry";

describe("S5-0 system-settings registry", () => {
  it("derives the complete, duplicate-free allowlist and an exhaustive storage partition", () => {
    expect(new Set(ALLOWED_KEYS).size).toBe(ALLOWED_KEYS.length);
    expect(Object.keys(SYSTEM_SETTING_REGISTRY).sort()).toEqual([...ALLOWED_KEYS].sort());
    expect(new Set([...RUNTIME_SYSTEM_SETTING_KEYS, ...RESTRICTED_SYSTEM_SETTING_KEYS])).toEqual(new Set(ALLOWED_KEYS));
    expect(RUNTIME_SYSTEM_SETTING_KEYS.some((key) => RESTRICTED_SYSTEM_SETTING_KEYS.includes(key))).toBe(false);
  });

  it("is default-deny: every key has an explicit ownership, audience and value contract", () => {
    for (const key of ALLOWED_KEYS) {
      const definition = SYSTEM_SETTING_REGISTRY[key];
      expect(definition).toBeDefined();
      expect(definition.legacySource).toBe("system_settings");
      expect(typeof definition.defaultValue).toBe("string");
    }
  });

  it("records setting, mechanic and all sources without evaluating unmerged S4 entitlements", () => {
    expect(RUNTIME_FLAG_DEFINITIONS.discussion.source).toMatchObject({ kind: "setting" });
    expect(RUNTIME_FLAG_DEFINITIONS.booking.source).toMatchObject({ kind: "mechanic", mechanic: "booking" });
    expect(RUNTIME_FLAG_DEFINITIONS.payments.source).toMatchObject({ kind: "all" });
    expect(RUNTIME_FLAG_DEFINITIONS.patient_app.source).toMatchObject({ kind: "mechanic", mechanic: "patient_app" });
    for (const definition of Object.values(RUNTIME_FLAG_DEFINITIONS)) {
      expect(definition.evaluation).toBe("deferred_until_s4_merge");
    }
  });
});
