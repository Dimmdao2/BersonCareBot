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

    const situations = container.querySelector('[data-patient-home-block="situations"]');
    expect(situations).toHaveAttribute("data-lg-order", "20");
    expect(situations).toHaveAttribute("data-lg-col-start", "1");
    expect(situations).toHaveAttribute("data-lg-col-span", "12");

    const sos = container.querySelector('[data-patient-home-block="sos"]');
    expect(sos).toHaveAttribute("data-lg-order", "40");
    expect(sos).toHaveAttribute("data-lg-col-start", "5");
    expect(sos).toHaveAttribute("data-lg-col-span", "4");
    expect(sos).toHaveClass("lg:order-[40]");

    const plan = container.querySelector('[data-patient-home-block="plan"]');
    expect(plan).toHaveAttribute("data-lg-order", "40");
    expect(plan).toHaveAttribute("data-lg-col-start", "9");
    expect(plan).toHaveAttribute("data-lg-col-span", "4");
    expect(plan).toHaveClass("lg:order-[40]");

    const mood = container.querySelector('[data-patient-home-block="mood_checkin"]');
    expect(mood).toHaveAttribute("data-lg-order", "40");
    expect(mood).toHaveAttribute("data-lg-col-start", "1");
    expect(mood).toHaveAttribute("data-lg-col-span", "4");
    expect(mood).toHaveClass("lg:order-[40]");

    const subscription = container.querySelector('[data-patient-home-block="subscription_carousel"]');
    expect(subscription).toHaveAttribute("data-lg-order", "50");
    expect(subscription).toHaveAttribute("data-lg-col-start", "1");
    expect(subscription).toHaveAttribute("data-lg-col-span", "12");
    expect(subscription).toHaveClass("lg:order-[50]");
    expect(within(subscription as HTMLElement).getByText("Subscription")).toBeInTheDocument();

    const courses = container.querySelector('[data-patient-home-block="courses"]');
    expect(courses).toHaveAttribute("data-lg-order", "60");
    expect(courses).toHaveAttribute("data-lg-col-start", "1");
    expect(courses).toHaveAttribute("data-lg-col-span", "12");
    expect(courses).toHaveClass("lg:order-[60]");
  });

  it("places sos_booking_split full width below mood row (order 41)", () => {
    const { container } = render(
      <PatientHomeTodayLayout personalizedName={null} blocks={[block("sos_booking_split", "Split")]} />,
    );
    const split = container.querySelector('[data-patient-home-block="sos_booking_split"]');
    expect(split).toHaveAttribute("data-lg-order", "41");
    expect(split).toHaveAttribute("data-lg-col-start", "1");
    expect(split).toHaveAttribute("data-lg-col-span", "12");
    expect(split).toHaveClass("lg:order-[41]");
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

  it("keeps mobile block order in the same order as resolved settings", () => {
    render(
      <PatientHomeTodayLayout
        personalizedName={null}
        blocks={[
          block("daily_warmup", "Warmup"),
          block("situations", "Situations"),
          block("booking", "Booking"),
        ]}
      />,
    );

    const layoutGrid = screen.getByTestId("patient-home-layout-grid");
    expect([...layoutGrid.children].map((child) => child.getAttribute("data-patient-home-block"))).toEqual([
      "daily_warmup",
      "situations",
      "booking",
    ]);
  });
});
