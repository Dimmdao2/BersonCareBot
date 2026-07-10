import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

const routeExpectations: Array<{ file: string; sources: string[] }> = [
  {
    file: "patient-packages/route.ts",
    sources: [
      "doctor.booking-engine.patient-packages.manual-create",
      "doctor.booking-engine.patient-packages.catalog-offer",
    ],
  },
  {
    file: "patient-packages/[id]/route.ts",
    sources: ["doctor.booking-engine.patient-packages.notes.update"],
  },
  {
    file: "patient-packages/[id]/consume/route.ts",
    sources: ["doctor.booking-engine.patient-packages.consume"],
  },
  {
    file: "products/[id]/pay-link/route.ts",
    sources: ["doctor.booking-engine.products.pay-link.create"],
  },
  {
    file: "patient-products/[id]/consume/route.ts",
    sources: ["doctor.booking-engine.patient-products.consume"],
  },
];

describe("doctor booking-engine residual principal coverage", () => {
  it.each(routeExpectations)(
    "$file wraps doctor booking residual mutations with the doctor workspace principal",
    ({ file, sources }) => {
      const src = readFileSync(join(__dirname, file), "utf8");

      expect(src).toContain("withDoctorWorkspacePrincipal");
      for (const source of sources) {
        expect(src).toContain(source);
      }
    },
  );
});
