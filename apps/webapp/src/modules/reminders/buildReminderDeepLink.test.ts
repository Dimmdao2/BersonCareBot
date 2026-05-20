import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getAppBaseUrlSync: () => "https://app.example",
}));

import { buildReminderDeepLink } from "./buildReminderDeepLink";

describe("buildReminderDeepLink", () => {
  it("warmup intent uses go daily-warmup URL", () => {
    expect(
      buildReminderDeepLink({
        linkedObjectType: "content_section",
        linkedObjectId: "warmups",
        reminderIntent: "warmup",
      }),
    ).toBe("https://app.example/app/patient/go/daily-warmup?from=reminder");
  });

  it("generic intent + warmups section slug uses go daily-warmup URL (legacy rules)", () => {
    expect(
      buildReminderDeepLink({
        linkedObjectType: "content_section",
        linkedObjectId: "warmups",
        reminderIntent: "generic",
      }),
    ).toBe("https://app.example/app/patient/go/daily-warmup?from=reminder");
  });

  it("generic intent + renamed warmups slug via warmupsSectionSlugs uses go URL", () => {
    expect(
      buildReminderDeepLink(
        {
          linkedObjectType: "content_section",
          linkedObjectId: "razminki",
          reminderIntent: "generic",
        },
        { warmupsSectionSlugs: new Set(["razminki"]) },
      ),
    ).toBe("https://app.example/app/patient/go/daily-warmup?from=reminder");
  });

  it("generic intent + non-warmups section uses section list URL", () => {
    expect(
      buildReminderDeepLink({
        linkedObjectType: "content_section",
        linkedObjectId: "lessons",
        reminderIntent: "generic",
      }),
    ).toBe("https://app.example/app/patient/sections/lessons?from=reminder");
  });
});
