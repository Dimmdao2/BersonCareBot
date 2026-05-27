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
    expect(warmup).toHaveAttribute("data-md-order", "10");
    expect(warmup).toHaveAttribute("data-md-col-start", "1");
    expect(warmup).toHaveAttribute("data-md-col-span", "8");
    expect(warmup).toHaveClass("sm:col-span-8");

    const usefulPost = container.querySelector('[data-patient-home-block="useful_post"]');
    expect(usefulPost).toHaveAttribute("data-md-order", "10");
    expect(usefulPost).toHaveAttribute("data-md-col-start", "9");
    expect(usefulPost).toHaveAttribute("data-md-col-span", "4");
    expect(usefulPost).toHaveClass("sm:col-span-4");

    const booking = container.querySelector('[data-patient-home-block="booking"]');
    expect(booking).toHaveAttribute("data-md-order", "21");
    expect(booking).toHaveAttribute("data-md-col-start", "9");
    expect(booking).toHaveAttribute("data-md-col-span", "4");

    const situations = container.querySelector('[data-patient-home-block="situations"]');
    expect(situations).toHaveAttribute("data-md-order", "20");
    expect(situations).toHaveAttribute("data-md-col-start", "1");
    expect(situations).toHaveAttribute("data-md-col-span", "8");

    const nextReminder = container.querySelector('[data-patient-home-block="next_reminder"]');
    expect(nextReminder).toHaveAttribute("data-md-order", "42");
    expect(nextReminder).toHaveAttribute("data-md-col-start", "1");
    expect(nextReminder).toHaveAttribute("data-md-col-span", "12");
    expect(nextReminder).toHaveClass("md:order-[42]");

    const progressEl = container.querySelector('[data-patient-home-block="progress"]');
    expect(progressEl).toHaveAttribute("data-md-order", "41");
    expect(progressEl).toHaveAttribute("data-md-col-start", "1");
    expect(progressEl).toHaveAttribute("data-md-col-span", "12");

    const sos = container.querySelector('[data-patient-home-block="sos"]');
    expect(sos).toHaveAttribute("data-md-order", "40");
    expect(sos).toHaveAttribute("data-md-col-start", "5");
    expect(sos).toHaveAttribute("data-md-col-span", "4");
    expect(sos).toHaveClass("md:order-[40]");

    const plan = container.querySelector('[data-patient-home-block="plan"]');
    expect(plan).toHaveAttribute("data-md-order", "20");
    expect(plan).toHaveAttribute("data-md-col-start", "9");
    expect(plan).toHaveAttribute("data-md-col-span", "4");
    expect(plan).toHaveClass("md:order-[20]");

    const mood = container.querySelector('[data-patient-home-block="mood_checkin"]');
    expect(mood).toHaveAttribute("data-md-order", "40");
    expect(mood).toHaveAttribute("data-md-col-start", "1");
    expect(mood).toHaveAttribute("data-md-col-span", "12");
    expect(mood).toHaveClass("md:order-[40]");

    const subscription = container.querySelector('[data-patient-home-block="subscription_carousel"]');
    expect(subscription).toHaveAttribute("data-md-order", "50");
    expect(subscription).toHaveAttribute("data-md-col-start", "1");
    expect(subscription).toHaveAttribute("data-md-col-span", "12");
    expect(subscription).toHaveClass("md:order-[50]");
    expect(within(subscription as HTMLElement).getByText("Subscription")).toBeInTheDocument();

    const courses = container.querySelector('[data-patient-home-block="courses"]');
    expect(courses).toHaveAttribute("data-md-order", "60");
    expect(courses).toHaveAttribute("data-md-col-start", "1");
    expect(courses).toHaveAttribute("data-md-col-span", "12");
    expect(courses).toHaveClass("md:order-[60]");
  });

  it("places sos_booking_split full width below next reminder row (order 43)", () => {
    const { container } = render(
      <PatientHomeTodayLayout personalizedName={null} blocks={[block("sos_booking_split", "Split")]} />,
    );
    const split = container.querySelector('[data-patient-home-block="sos_booking_split"]');
    expect(split).toHaveAttribute("data-md-order", "43");
    expect(split).toHaveAttribute("data-md-col-start", "1");
    expect(split).toHaveAttribute("data-md-col-span", "12");
    expect(split).toHaveClass("md:order-[43]");
  });

  it("stretches plan full-width when situations block is absent", () => {
    const { container } = render(
      <PatientHomeTodayLayout
        personalizedName={null}
        blocks={[block("mood_checkin", "Mood"), block("plan", "Plan"), block("daily_warmup", "Warmup")]}
      />,
    );
    const plan = container.querySelector('[data-patient-home-block="plan"]');
    expect(plan).toHaveAttribute("data-md-order", "20");
    expect(plan).toHaveAttribute("data-md-col-start", "1");
    expect(plan).toHaveAttribute("data-md-col-span", "12");
    expect(plan).toHaveClass("md:col-span-12");
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

    const warmupOnly = container.querySelector('[data-patient-home-block="daily_warmup"]');
    expect(warmupOnly).toHaveClass("sm:col-span-12");
    expect(warmupOnly).toHaveClass("md:col-span-12");
    expect(warmupOnly).toHaveAttribute("data-md-col-span", "12");
  });

  it("stretches useful post full-width when warmup block is absent", () => {
    const { container } = render(
      <PatientHomeTodayLayout
        personalizedName={null}
        blocks={[
          block("useful_post", "UsefulPost"),
          block("booking", "Booking"),
        ]}
      />,
    );

    const usefulPostOnly = container.querySelector('[data-patient-home-block="useful_post"]');
    expect(usefulPostOnly).toHaveClass("sm:col-span-12");
    expect(usefulPostOnly).toHaveClass("md:col-span-12");
    expect(usefulPostOnly).toHaveAttribute("data-md-col-start", "1");
    expect(usefulPostOnly).toHaveAttribute("data-md-col-span", "12");
  });

  it("keeps md placement stable across useful_post and situations combinations", () => {
    const cases = [
      {
        name: "post on, situations on",
        blocks: [block("daily_warmup", "Warmup"), block("useful_post", "UsefulPost"), block("situations", "Situations"), block("plan", "Plan")],
        expected: {
          daily_warmup: ["1", "8"],
          useful_post: ["9", "4"],
          situations: ["1", "8"],
          plan: ["9", "4"],
        },
      },
      {
        name: "post off, situations on",
        blocks: [block("daily_warmup", "Warmup"), block("situations", "Situations"), block("plan", "Plan")],
        expected: {
          daily_warmup: ["1", "12"],
          situations: ["1", "8"],
          plan: ["9", "4"],
        },
      },
      {
        name: "post on, situations off",
        blocks: [block("daily_warmup", "Warmup"), block("useful_post", "UsefulPost"), block("plan", "Plan")],
        expected: {
          daily_warmup: ["1", "8"],
          useful_post: ["9", "4"],
          plan: ["1", "12"],
        },
      },
      {
        name: "post off, situations off",
        blocks: [block("daily_warmup", "Warmup"), block("plan", "Plan")],
        expected: {
          daily_warmup: ["1", "12"],
          plan: ["1", "12"],
        },
      },
    ] as const;

    for (const testCase of cases) {
      const { container, unmount } = render(
        <PatientHomeTodayLayout personalizedName={null} blocks={[...testCase.blocks]} />,
      );

      for (const [code, [colStart, colSpan]] of Object.entries(testCase.expected)) {
        const node = container.querySelector(`[data-patient-home-block="${code}"]`);
        expect(node, testCase.name).toHaveAttribute("data-md-col-start", colStart);
        expect(node, testCase.name).toHaveAttribute("data-md-col-span", colSpan);
      }

      unmount();
    }
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
