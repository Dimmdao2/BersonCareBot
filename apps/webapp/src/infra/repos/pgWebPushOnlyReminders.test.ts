import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Contract test: web-push-only port must not load bot-linked rules (integrator path).
 */
describe("pgWebPushOnlyReminders", () => {
  it("filters reminder_rules with integrator_user_id IS NULL", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(dir, "pgWebPushOnlyReminders.ts"), "utf8");
    expect(source).toContain("rr.integrator_user_id IS NULL");
    expect(source).toContain("rr.platform_user_id IS NOT NULL");
    expect(source).toContain("rr.is_enabled = true");
  });
});
