import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePatientContentPaths } from "./revalidatePatientContentPaths";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from "next/cache";

describe("revalidatePatientContentPaths", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  it("revalidates help index and article when section is help", () => {
    revalidatePatientContentPaths({ slug: "preparation", section: "help" });
    const paths = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(paths).toContain("/app/patient/help");
    expect(paths).toContain("/app/patient/booking/new");
    expect(paths).toContain("/app/patient/help/preparation");
    expect(paths).toContain("/app/patient/content/preparation");
  });

  it("revalidates help when page moved out of help section", () => {
    revalidatePatientContentPaths({
      slug: "moved",
      section: "antistress",
      previousSection: "help",
      previousSlug: "old",
    });
    const paths = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(paths).toContain("/app/patient/help");
    expect(paths).toContain("/app/patient/help/moved");
    expect(paths).toContain("/app/patient/help/old");
  });

  it("skips help paths for non-help section only", () => {
    revalidatePatientContentPaths({ slug: "x", section: "antistress" });
    const paths = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(paths).not.toContain("/app/patient/help");
    expect(paths).toContain("/app/patient/content/x");
  });
});
