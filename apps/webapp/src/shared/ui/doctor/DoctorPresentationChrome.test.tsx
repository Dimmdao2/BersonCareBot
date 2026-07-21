/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DoctorSection } from "@/shared/ui/doctor/DoctorSection";
import {
  doctorDnaFlatListInsetClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from "@/shared/ui/doctor/DoctorDnaFlatListRow";
import { Button, buttonVariants } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Select, SelectTrigger } from "@/shared/ui/doctor/primitives/select";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";

describe("doctor presentation chrome", () => {
  it("uses the owner block radius and 18px padding on shared page sections", () => {
    render(<DoctorSection data-testid="section">Содержимое</DoctorSection>);

    expect(screen.getByTestId("section")).toHaveClass(
      "rounded-[var(--doctor-page-block-radius,12px)]",
      "p-[var(--doctor-block-padding,18px)]",
    );
  });

  it("keeps the page header white and exposes a full-width right slot", () => {
    render(
      <DoctorPageHeader title="Клиенты" tabsClassName="w-full" tabs={<div>Поиск</div>} />,
    );

    const header = screen.getByRole("banner");
    expect(header).toHaveClass("bg-[var(--doctor-page-header-background,#fff)]");
    expect(header.querySelector("[data-doctor-page-header-tabs]")).toHaveClass("w-full");
  });

  it("applies doctor-only pill controls and a white input without defeating explicit row radii", () => {
    render(
      <>
        <Button>Сохранить</Button>
        <Input aria-label="Название" />
        <Select defaultValue="all">
          <SelectTrigger aria-label="Период" displayLabel="Все" />
        </Select>
      </>,
    );

    expect(screen.getByRole("button", { name: "Сохранить" })).toHaveClass(
      "bg-primary",
      "rounded-[var(--doctor-control-radius,24px)]",
    );
    expect(screen.getByRole("textbox", { name: "Название" })).toHaveClass(
      "rounded-[var(--doctor-control-radius,24px)]",
      "bg-white",
    );
    expect(screen.getByRole("combobox", { name: "Период" })).toHaveClass(
      "rounded-[var(--doctor-control-radius,24px)]",
      "bg-white",
    );
    expect(buttonVariants({ className: "rounded-none" })).toContain("rounded-none");
    expect(buttonVariants({ className: "rounded-none" })).not.toContain(
      "rounded-[var(--doctor-control-radius,24px)]",
    );
  });

  it("uses 18px row alignment with larger, lighter primary list text", () => {
    expect(doctorDnaFlatListInsetClass).toContain(
      "mx-[var(--doctor-block-padding,18px)]",
    );
    expect(doctorDnaFlatListRowClass).toContain(
      "px-[var(--doctor-list-inline-padding,18px)]",
    );
    expect(doctorDnaFlatListRowClass).toContain("border-t");
    expect(doctorDnaFlatListPrimaryClass).toContain("text-base");
    expect(doctorDnaFlatListPrimaryClass).toContain("font-normal");
  });
});
