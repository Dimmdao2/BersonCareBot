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
          block("useful_post", "UsefulPost"),
          block("booking", "Booking"),
          block("situations", "Situations"),
          block("progress", "Progress"),
          block("next_reminder", "Reminder"),
          block("sos", "SOS"),
          block("plan", "Plan"),
          block("mood_checkin", "Mood"),
          block("courses", "Courses"),
          block("subscription_carousel", "Subscription"),
        ]}
      />,
    );

    const layoutGrid = screen.getByTestId("patient-home-layout-grid");
    expect(layoutGrid).toBeInTheDocument();
    expect(layoutGrid.children).toHaveLength(11);

    const warmup = container.querySelector('[data-patient-home-block="daily_warmup"]');
    expect(warmup).toHaveAttribute("data-lg-order", "10");
    expect(warmup).toHaveAttribute("data-lg-col-start", "1");
    expect(warmup).toHaveAttribute("data-lg-col-span", "8");

    const usefulPost = container.querySelector('[data-patient-home-block="useful_post"]');
    expect(usefulPost).toHaveAttribute("data-lg-order", "10");
    expect(usefulPost).toHaveAttribute("data-lg-col-start", "9");
    expect(usefulPost).toHaveAttribute("data-lg-col-span", "4");

    const booking = container.querySelector('[data-patient-home-block="booking"]');
    expect(booking).toHaveAttribute("data-lg-order", "20");
    expect(booking).toHaveAttribute("data-lg-col-start", "9");
    expect(booking).toHaveAttribute("data-lg-col-span", "4");

    const sos = container.querySelector('[data-patient-home-block="sos"]');
    expect(sos).toHaveAttribute("data-lg-order", "35");
    expect(sos).toHaveAttribute("data-lg-col-start", "1");
    expect(sos).toHaveAttribute("data-lg-col-span", "12");

    const plan = container.querySelector('[data-patient-home-block="plan"]');
    expect(plan).toHaveAttribute("data-lg-order", "40");
    expect(plan).toHaveAttribute("data-lg-col-start", "1");
    expect(plan).toHaveAttribute("data-lg-col-span", "8");

    const mood = container.querySelector('[data-patient-home-block="mood_checkin"]');
    expect(mood).toHaveAttribute("data-lg-order", "40");
    expect(mood).toHaveAttribute("data-lg-col-start", "9");
    expect(mood).toHaveAttribute("data-lg-col-span", "4");

    const subscription = container.querySelector('[data-patient-home-block="subscription_carousel"]');
    expect(subscription).toHaveAttribute("data-lg-order", "50");
    expect(subscription).toHaveAttribute("data-lg-col-start", "9");
    expect(subscription).toHaveAttribute("data-lg-col-span", "4");
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
