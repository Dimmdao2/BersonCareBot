/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PatientHomeTodayLayout, type PatientHomeTodayLayoutBlock } from "./PatientHomeTodayLayout";

function block(code: PatientHomeTodayLayoutBlock["code"], label: string): PatientHomeTodayLayoutBlock {
  return {
    code,
    node: <section aria-label={label}>{label}</section>,
  };
}

describe("PatientHomeTodayLayout", () => {
  it("renders dashboard grid with stable desktop placement metadata on blocks", () => {
    const { container } = render(
      <PatientHomeTodayLayout
        personalizedName={null}
        blocks={[
          block("daily_warmup", "Warmup"),
          block("booking", "Booking"),
          block("situations", "Situations"),
          block("progress", "Progress"),
          block("next_reminder", "Reminder"),
          block("sos", "SOS"),
          block("mood_checkin", "Mood"),
          block("plan", "Plan"),
          block("courses", "Courses"),
          block("subscription_carousel", "Subscription"),
        ]}
      />,
    );

    const layoutGrid = screen.getByTestId("patient-home-layout-grid");
    expect(layoutGrid).toBeInTheDocument();
    expect(layoutGrid.children).toHaveLength(10);

    const warmup = container.querySelector('[data-patient-home-block="daily_warmup"]');
    expect(warmup).toHaveAttribute("data-lg-order", "10");
    expect(warmup).toHaveAttribute("data-lg-col-start", "1");
    expect(within(warmup as HTMLElement).getByText("Warmup")).toBeInTheDocument();

    const booking = container.querySelector('[data-patient-home-block="booking"]');
    expect(booking).toHaveAttribute("data-lg-order", "10");
    expect(booking).toHaveAttribute("data-lg-col-start", "2");
    expect(within(booking as HTMLElement).getByText("Booking")).toBeInTheDocument();

    const subscription = container.querySelector('[data-patient-home-block="subscription_carousel"]');
    expect(subscription).toHaveAttribute("data-lg-order", "60");
    expect(subscription).toHaveAttribute("data-lg-col-span", "2");
    expect(within(subscription as HTMLElement).getByText("Subscription")).toBeInTheDocument();
  });

  it("does not render full-width carousel wrapper when carousel block is absent", () => {
    const { container } = render(
      <PatientHomeTodayLayout
        personalizedName={null}
        blocks={[
          block("daily_warmup", "Warmup"),
          block("booking", "Booking"),
        ]}
      />,
    );

    expect(container.querySelector('[data-patient-home-block="subscription_carousel"]')).not.toBeInTheDocument();
  });
});
