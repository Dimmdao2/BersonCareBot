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
  it("keeps mobile and md as a single stack while lg uses two columns", () => {
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
    expect(layoutGrid).toHaveClass("grid");
    expect(layoutGrid).toHaveClass("gap-5");
    expect(layoutGrid).toHaveClass("lg:gap-6");
    expect(layoutGrid).toHaveClass("lg:grid-cols-[3fr_2fr]");
    expect(layoutGrid).toHaveClass("lg:items-start");

    const warmup = container.querySelector('[data-patient-home-block="daily_warmup"]');
    expect(warmup).toHaveClass("lg:col-start-1");
    expect(warmup).toHaveClass("lg:order-[10]");
    expect(within(warmup as HTMLElement).getByText("Warmup")).toBeInTheDocument();

    const booking = container.querySelector('[data-patient-home-block="booking"]');
    expect(booking).toHaveClass("lg:col-start-2");
    expect(booking).toHaveClass("lg:order-[10]");
    expect(within(booking as HTMLElement).getByText("Booking")).toBeInTheDocument();

    const subscription = container.querySelector('[data-patient-home-block="subscription_carousel"]');
    expect(subscription).toHaveClass("lg:col-span-2");
    expect(subscription).toHaveClass("lg:order-[60]");
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
