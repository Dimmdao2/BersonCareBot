import type { ReactNode } from "react";
import type { PatientHomeBlockCode } from "@/modules/patient-home/ports";
import { cn } from "@/lib/utils";
import {
  patientHomeTodayGridCellPadBorderedSymClass,
  patientHomeTodayGridCellPadMoodTopClass,
  patientHomeTodayGridCellPadProgressBottomClass,
  patientHomeTodayGridCellPadSituationsClass,
  patientHomeTodayGridCellPullNextReminderAfterProgressClass,
} from "./patientHomeCardStyles";
import { PatientHomeGreeting, type PatientGreetingPrefix } from "./PatientHomeGreeting";

export type PatientHomeTodayLayoutBlockCode = PatientHomeBlockCode | "sos_booking_split";

export type PatientHomeTodayLayoutBlock = {
  code: PatientHomeTodayLayoutBlockCode;
  node: ReactNode;
};

type Props = {
  personalizedName: string | null;
  timeOfDayPrefix?: PatientGreetingPrefix;
  blocks: PatientHomeTodayLayoutBlock[];
};

/** Wide-viewport grid placement (`md+`): Tailwind classes + stable `data-md-*` for tests (avoid coupling tests to full class strings). */
function desktopBlockLayout(code: PatientHomeTodayLayoutBlockCode): {
  className: string;
  "data-md-order"?: string;
  "data-md-col-start"?: string;
  "data-md-col-span"?: string;
} {
  switch (code) {
    case "daily_warmup":
      return {
        className: "md:col-span-8 md:col-start-1 md:order-[10]",
        "data-md-order": "10",
        "data-md-col-start": "1",
        "data-md-col-span": "8",
      };
    case "useful_post":
      return {
        className: "md:col-span-4 md:col-start-9 md:order-[10]",
        "data-md-order": "10",
        "data-md-col-start": "9",
        "data-md-col-span": "4",
      };
    case "situations":
      return {
        className: "md:col-span-12 md:col-start-1 md:order-[20]",
        "data-md-order": "20",
        "data-md-col-start": "1",
        "data-md-col-span": "12",
      };
    case "booking":
      return {
        className: "md:col-span-4 md:col-start-9 md:order-[20]",
        "data-md-order": "20",
        "data-md-col-start": "9",
        "data-md-col-span": "4",
      };
    /** Полная ширина: напоминание сразу под «Сегодня выполнено» (md:order после progress). */
    case "next_reminder":
      return {
        className: "md:col-span-12 md:col-start-1 md:order-[42]",
        "data-md-order": "42",
        "data-md-col-start": "1",
        "data-md-col-span": "12",
      };
    /** Compact desktop row: mood / SOS / rehab plan. */
    case "sos":
      return {
        className: "md:col-span-4 md:col-start-5 md:order-[40]",
        "data-md-order": "40",
        "data-md-col-start": "5",
        "data-md-col-span": "4",
      };
    /** «Сегодня выполнено» — под строкой mood | plan, полная ширина, перед SOS+запись. */
    case "progress":
      return {
        className: "md:col-span-12 md:col-start-1 md:order-[41]",
        "data-md-order": "41",
        "data-md-col-start": "1",
        "data-md-col-span": "12",
      };
    /** SOS + запись — под напоминанием (md:order после next_reminder). */
    case "sos_booking_split":
      return {
        className: "md:col-span-12 md:col-start-1 md:order-[43]",
        "data-md-order": "43",
        "data-md-col-start": "1",
        "data-md-col-span": "12",
      };
    case "plan":
      return {
        className: "md:col-span-4 md:col-start-9 md:order-[40]",
        "data-md-order": "40",
        "data-md-col-start": "9",
        "data-md-col-span": "4",
      };
    case "mood_checkin":
      return {
        className: "md:col-span-4 md:col-start-1 md:order-[40]",
        "data-md-order": "40",
        "data-md-col-start": "1",
        "data-md-col-span": "4",
      };
    case "courses":
      return {
        className: "md:col-span-12 md:col-start-1 md:order-[60]",
        "data-md-order": "60",
        "data-md-col-start": "1",
        "data-md-col-span": "12",
      };
    case "subscription_carousel":
      return {
        className: "md:col-span-12 md:col-start-1 md:order-[50]",
        "data-md-order": "50",
        "data-md-col-start": "1",
        "data-md-col-span": "12",
      };
  }
}

export function PatientHomeTodayLayout({ personalizedName, timeOfDayPrefix, blocks }: Props) {
  return (
    <div
      id="patient-home-today-layout"
      className="flex min-w-0 flex-col gap-4 overflow-x-hidden pb-4 md:gap-5"
    >
      <PatientHomeGreeting personalizedName={personalizedName} timeOfDayPrefix={timeOfDayPrefix} />

      <div
        /**
         * `md:grid-flow-row-dense` — чтобы пары (col-span-8 + col-span-4) держались на одной строке
         * вне зависимости от DOM-порядка (`sort_order` в БД может ставить правый col перед левым).
         */
        className="grid w-full min-w-0 gap-5 md:grid-cols-12 md:grid-flow-row-dense md:items-stretch md:gap-6 xl:gap-7"
        data-testid="patient-home-layout-grid"
      >
        {blocks.map((block) => {
          const layout = desktopBlockLayout(block.code);
          return (
            <div
              key={block.code}
              className={cn(
                "min-w-0",
                block.code === "next_reminder" && patientHomeTodayGridCellPullNextReminderAfterProgressClass,
                block.code === "situations" && patientHomeTodayGridCellPadSituationsClass,
                (block.code === "sos_booking_split" || block.code === "booking" || block.code === "sos") &&
                  patientHomeTodayGridCellPadBorderedSymClass,
                block.code === "mood_checkin" && patientHomeTodayGridCellPadMoodTopClass,
                block.code === "progress" && patientHomeTodayGridCellPadProgressBottomClass,
                layout.className,
              )}
              data-patient-home-block={block.code}
              data-md-order={layout["data-md-order"]}
              data-md-col-start={layout["data-md-col-start"]}
              data-md-col-span={layout["data-md-col-span"]}
            >
              {block.node}
            </div>
          );
        })}
      </div>
    </div>
  );
}
