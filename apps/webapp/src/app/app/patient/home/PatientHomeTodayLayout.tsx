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

function getDesktopBlockClass(code: PatientHomeBlockCode): string {
  switch (code) {
    case "daily_warmup":
      return "lg:col-start-1 lg:order-[10]";
    case "booking":
      return "lg:col-start-2 lg:order-[10]";
    case "situations":
      return "lg:col-start-1 lg:order-[20]";
    case "next_reminder":
      return "lg:col-start-2 lg:order-[20]";
    case "progress":
      return "lg:col-start-1 lg:order-[30]";
    case "sos":
      return "lg:col-start-2 lg:order-[30]";
    case "plan":
      return "lg:col-start-1 lg:order-[40]";
    case "mood_checkin":
      return "lg:col-start-2 lg:order-[40]";
    case "courses":
      return "lg:col-start-1 lg:order-[50]";
    case "subscription_carousel":
      return "lg:col-span-2 lg:order-[60]";
    default:
      return "";
  }
}

export function PatientHomeTodayLayout({ personalizedName, timeOfDayPrefix, blocks }: Props) {
  return (
    <div className="flex flex-col gap-6 pb-6">
      <PatientHomeGreeting personalizedName={personalizedName} timeOfDayPrefix={timeOfDayPrefix} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" data-testid="patient-home-layout-grid">
        {blocks.map((block) => (
          <div key={block.code} className={cn("min-w-0", getDesktopBlockClass(block.code))} data-patient-home-block={block.code}>
            {block.node}
          </div>
        ))}
      </div>
    </div>
  );
}
