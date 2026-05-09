/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomePlanCard } from "./PatientHomePlanCard";
import { routePaths } from "@/app-layer/routes/paths";

describe("PatientHomePlanCard", () => {
  it("«Начать занятие» ведёт на переданный startLessonHref", () => {
    const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const itemId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const href = routePaths.patientTreatmentProgramItem(id, itemId, "exec", "program");
    render(
      <PatientHomePlanCard instance={{ id, title: "Plan title" }} startLessonHref={href} />,
    );
    const cta = screen.getByRole("link", { name: /Начать занятие/i });
    expect(cta).toHaveAttribute("href", href);
  });

  it("renders «День N» и строку «Сегодня» с точкой", () => {
    render(
      <PatientHomePlanCard
        instance={{ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", title: "Plan title" }}
        startLessonHref={routePaths.patientTreatmentProgram("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")}
        progressDay={12}
        todayPracticeDone={false}
      />,
    );
    expect(screen.getByText(/День 12/)).toBeInTheDocument();
    expect(screen.getByText("Сегодня:")).toBeInTheDocument();
    expect(screen.getByLabelText(/Сегодня занятий по программе не отмечено/i)).toBeInTheDocument();
  });

  it("при отметках за сегодня — доступное описание для точки", () => {
    render(
      <PatientHomePlanCard
        instance={{ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", title: "Plan title" }}
        startLessonHref={routePaths.patientTreatmentProgram("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")}
        progressDay={3}
        todayPracticeDone
      />,
    );
    expect(screen.getByLabelText(/Сегодня занятие отмечено/i)).toBeInTheDocument();
  });

  it("renders custom leading icon when blockIconImageUrl is set", () => {
    const { container } = render(
      <PatientHomePlanCard
        instance={{ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", title: "Plan title" }}
        startLessonHref={routePaths.patientTreatmentProgram("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")}
        blockIconImageUrl="/api/media/ffffffff-ffff-4fff-8fff-ffffffffffff"
      />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/api/media/ffffffff-ffff-4fff-8fff-ffffffffffff");
  });
});
