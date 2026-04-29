/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PatientHomeBlockRuntimeStatus } from "@/modules/patient-home/patientHomeRuntimeStatus";
import { PatientHomeBlockRuntimeStatusBadge } from "./PatientHomeBlockRuntimeStatusBadge";

function status(p: Partial<PatientHomeBlockRuntimeStatus> & Pick<PatientHomeBlockRuntimeStatus, "kind">): PatientHomeBlockRuntimeStatus {
  return {
    blockCode: "situations",
    visibleResolvedItems: 0,
    visibleConfiguredItems: 0,
    unresolvedConfiguredItems: 0,
    ...p,
  };
}

describe("PatientHomeBlockRuntimeStatusBadge", () => {
  it("renders Скрыт for hidden", () => {
    render(<PatientHomeBlockRuntimeStatusBadge status={status({ kind: "hidden", blockCode: "booking" })} />);
    const el = screen.getByTestId("patient-home-runtime-status-badge");
    expect(el).toHaveTextContent("Скрыт");
    expect(el.getAttribute("data-runtime-kind")).toBe("hidden");
  });

  it("renders Пусто for empty", () => {
    render(<PatientHomeBlockRuntimeStatusBadge status={status({ kind: "empty", blockCode: "daily_warmup" })} />);
    expect(screen.getByTestId("patient-home-runtime-status-badge")).toHaveTextContent("Пусто");
  });

  it("renders Готово for ready", () => {
    render(
      <PatientHomeBlockRuntimeStatusBadge
        status={status({ kind: "ready", visibleResolvedItems: 2, visibleConfiguredItems: 2 })}
      />,
    );
    expect(screen.getByTestId("patient-home-runtime-status-badge")).toHaveTextContent("Готово");
  });

  it("exposes title with counters", () => {
    render(
      <PatientHomeBlockRuntimeStatusBadge
        status={status({
          kind: "ready",
          blockCode: "courses",
          visibleResolvedItems: 1,
          visibleConfiguredItems: 1,
          unresolvedConfiguredItems: 0,
        })}
      />,
    );
    const title = screen.getByTestId("patient-home-runtime-status-badge").getAttribute("title");
    expect(title).toContain("видимых элементов: 1");
    expect(title).toContain("Дают карточку");
  });
});
