import type { ReactNode } from "react";
import type { PatientHomeBlockCode } from "@/modules/patient-home/ports";
import { cn } from "@/lib/utils";
import { PatientHomeGreeting, type PatientGreetingPrefix } from "./PatientHomeGreeting";

export type PatientHomeTodayLayoutBlock = {
  code: PatientHomeBlockCode;
  node: ReactNode;
};

type Props = {
  personalizedName: string | null;
  timeOfDayPrefix?: PatientGreetingPrefix;
  blocks: PatientHomeTodayLayoutBlock[];
};

/** Desktop grid placement: Tailwind classes + stable `data-lg-*` for tests (avoid coupling tests to full class strings). */
function desktopBlockLayout(code: PatientHomeBlockCode): {
  className: string;
  "data-lg-order"?: string;
  "data-lg-col-start"?: string;
  "data-lg-col-span"?: string;
} {
  switch (code) {
    case "daily_warmup":
      return {
        className: "lg:col-span-8 lg:order-[10]",
        "data-lg-order": "10",
        "data-lg-col-start": "1",
        "data-lg-col-span": "8",
      };
    case "booking":
      return {
        className: "lg:col-span-4 lg:order-[10]",
        "data-lg-order": "10",
        "data-lg-col-start": "9",
        "data-lg-col-span": "4",
      };
    case "situations":
      return {
        className: "lg:col-span-8 lg:order-[20]",
        "data-lg-order": "20",
        "data-lg-col-start": "1",
        "data-lg-col-span": "8",
      };
    case "next_reminder":
      return {
        className: "lg:col-span-4 lg:order-[20]",
        "data-lg-order": "20",
        "data-lg-col-start": "9",
        "data-lg-col-span": "4",
      };
    case "progress":
      return {
        className: "lg:col-span-8 lg:order-[30]",
        "data-lg-order": "30",
        "data-lg-col-start": "1",
        "data-lg-col-span": "8",
      };
    case "sos":
      return {
        className: "lg:col-span-4 lg:order-[30]",
        "data-lg-order": "30",
        "data-lg-col-start": "9",
        "data-lg-col-span": "4",
      };
    case "plan":
      return {
        className: "lg:col-span-8 lg:order-[40]",
        "data-lg-order": "40",
        "data-lg-col-start": "1",
        "data-lg-col-span": "8",
      };
    case "mood_checkin":
      return {
        className: "lg:col-span-4 lg:order-[40]",
        "data-lg-order": "40",
        "data-lg-col-start": "9",
        "data-lg-col-span": "4",
      };
    case "courses":
      return {
        className: "lg:col-span-8 lg:order-[50]",
        "data-lg-order": "50",
        "data-lg-col-start": "1",
        "data-lg-col-span": "8",
      };
    case "subscription_carousel":
      return {
        className: "lg:col-span-4 lg:order-[50]",
        "data-lg-order": "50",
        "data-lg-col-start": "9",
        "data-lg-col-span": "4",
      };
  }
}

export function PatientHomeTodayLayout({ personalizedName, timeOfDayPrefix, blocks }: Props) {
  return (
    <div
      id="patient-home-today-layout"
      className="flex flex-col gap-5 pb-6 lg:gap-6"
    >
      <PatientHomeGreeting personalizedName={personalizedName} timeOfDayPrefix={timeOfDayPrefix} />

      <div
        className="grid w-full min-w-0 gap-5 lg:grid-cols-12 lg:items-stretch lg:gap-5 xl:gap-6"
        data-testid="patient-home-layout-grid"
      >
        {blocks.map((block) => {
          const layout = desktopBlockLayout(block.code);
          return (
            <div
              key={block.code}
              className={cn("min-w-0", layout.className)}
              data-patient-home-block={block.code}
              data-lg-order={layout["data-lg-order"]}
              data-lg-col-start={layout["data-lg-col-start"]}
              data-lg-col-span={layout["data-lg-col-span"]}
            >
              {block.node}
            </div>
          );
        })}
      </div>
    </div>
  );
}
