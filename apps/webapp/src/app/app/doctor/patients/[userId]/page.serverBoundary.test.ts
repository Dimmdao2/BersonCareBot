import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("doctor patient card server boundary", () => {
  it("uses the server-safe button variant helper", () => {
    expect(pageSource).toContain(
      'from "@/shared/ui/doctor/primitives/button-variants"',
    );
    expect(pageSource).not.toContain(
      'from "@/shared/ui/doctor/primitives/button"',
    );
  });
});
