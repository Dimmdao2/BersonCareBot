import type { ReactNode } from "react";
import type { PatientHomeBlockCode } from "@/modules/patient-home/ports";
import { cn } from "@/lib/utils";
import {
  patientHomeTodayGridCellPadBorderedSymClass,
  patientHomeTodayGridCellPadMoodTopClass,
  patientHomeTodayGridCellPadProgressBottomClass,
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
  unreadChatCount?: number;
  blocks: PatientHomeTodayLayoutBlock[];
};

/** `sm+` (640px+): одна строка «разминка | полезный пост», если оба блока есть; иначе каждый на полную ширину. Порядок — по DOM (после «Мой план» из {@link reorderPatientHomeLayoutBlocks}), без `order`, иначе пара уезжает вниз. */
function smHeroRowLayout(
  code: PatientHomeTodayLayoutBlockCode,
  ctx: { hasDailyWarmup: boolean; hasUsefulPost: boolean },
): string {
  if (code === "daily_warmup") {
    return ctx.hasUsefulPost ? "sm:col-span-8 sm:col-start-1" : "sm:col-span-12 sm:col-start-1";
  }
  if (code === "useful_post") {
    return ctx.hasDailyWarmup ? "sm:col-span-4 sm:col-start-9" : "sm:col-span-12 sm:col-start-1";
  }
  return "sm:col-span-12 sm:col-start-1";
}

/** Wide-viewport grid placement (`md+`): Tailwind classes + stable `data-md-*` for tests (avoid coupling tests to full class strings). */
function desktopBlockLayout(
  code: PatientHomeTodayLayoutBlockCode,
  ctx: { hasDailyWarmup: boolean; hasUsefulPost: boolean; hasPlan: boolean; hasSituations: boolean },
): {
  className: string;
  "data-md-order"?: string;
  "data-md-col-start"?: string;
  "data-md-col-span"?: string;
} {
  switch (code) {
    case "daily_warmup":
      return {
        className: ctx.hasUsefulPost ?
          "md:col-span-8 md:col-start-1 md:order-[10]"
        : "md:col-span-12 md:col-start-1 md:order-[10]",
        "data-md-order": "10",
        "data-md-col-start": "1",
        "data-md-col-span": ctx.hasUsefulPost ? "8" : "12",
      };
    case "useful_post":
      return {
        className: ctx.hasDailyWarmup ?
          "md:col-span-4 md:col-start-9 md:order-[10]"
        : "md:col-span-12 md:col-start-1 md:order-[10]",
        "data-md-order": "10",
        "data-md-col-start": ctx.hasDailyWarmup ? "9" : "1",
        "data-md-col-span": ctx.hasDailyWarmup ? "4" : "12",
      };
    case "situations":
      return ctx.hasPlan ?
          {
            className: "md:col-span-8 md:col-start-1 md:order-[20]",
            "data-md-order": "20",
            "data-md-col-start": "1",
            "data-md-col-span": "8",
          }
        : {
            className: "md:col-span-12 md:col-start-1 md:order-[20]",
            "data-md-order": "20",
            "data-md-col-start": "1",
            "data-md-col-span": "12",
          };
    case "booking":
      return {
        className: "md:col-span-4 md:col-start-9 md:order-[21]",
        "data-md-order": "21",
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
    /** Compact desktop row: SOS под полноширинным блоком настроения (тот же `order`, новая строка). */
    case "sos":
      return {
        className: "md:col-span-4 md:col-start-5 md:order-[40]",
        "data-md-order": "40",
        "data-md-col-start": "5",
        "data-md-col-span": "4",
      };
    /** «Сегодня выполнено» — под блоком самочувствия, полная ширина, перед SOS+запись. */
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
      return ctx.hasSituations ?
          {
            className: "md:col-span-4 md:col-start-9 md:order-[20]",
            "data-md-order": "20",
            "data-md-col-start": "9",
            "data-md-col-span": "4",
          }
        : {
            className: "md:col-span-12 md:col-start-1 md:order-[20]",
            "data-md-order": "20",
            "data-md-col-start": "1",
            "data-md-col-span": "12",
          };
    /** Полная ширина: неделя + самочувствие (на `md+` не сжимать в 4 колонки). */
    case "mood_checkin":
      return {
        className: "md:col-span-12 md:col-start-1 md:order-[40]",
        "data-md-order": "40",
        "data-md-col-start": "1",
        "data-md-col-span": "12",
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

export function PatientHomeTodayLayout({ personalizedName, timeOfDayPrefix, unreadChatCount, blocks }: Props) {
  const hasDailyWarmup = blocks.some((b) => b.code === "daily_warmup");
  const hasUsefulPost = blocks.some((b) => b.code === "useful_post");
  const hasPlan = blocks.some((b) => b.code === "plan");
  const hasSituations = blocks.some((b) => b.code === "situations");
  const heroRowCtx = { hasDailyWarmup, hasUsefulPost };
  const desktopCtx = { hasDailyWarmup, hasUsefulPost, hasPlan, hasSituations };

  return (
    <div
      id="patient-home-today-layout"
      className="flex min-w-0 flex-col gap-4 overflow-x-hidden pb-4 md:gap-5"
    >
      <PatientHomeGreeting
        personalizedName={personalizedName}
        timeOfDayPrefix={timeOfDayPrefix}
        unreadChatCount={unreadChatCount}
      />

      <div
        /**
         * `sm:grid-flow-row-dense` / `md:grid-flow-row-dense` — при соседних 8+4 в одной строке плотнее заполняет сетку;
         * на `sm` порядок строк — по DOM (без `sm:order` у hero-пары), на `md+` — по `md:order-*`.
         */
        className="grid w-full min-w-0 gap-5 sm:grid-cols-12 sm:grid-flow-row-dense sm:items-stretch md:grid-flow-row-dense md:gap-6 xl:gap-7"
        data-testid="patient-home-layout-grid"
      >
        {blocks.map((block) => {
          const layout = desktopBlockLayout(block.code, desktopCtx);
          return (
            <div
              key={block.code}
              className={cn(
                "min-w-0",
                block.code === "next_reminder" && patientHomeTodayGridCellPullNextReminderAfterProgressClass,
                (block.code === "sos_booking_split" || block.code === "booking" || block.code === "sos") &&
                  patientHomeTodayGridCellPadBorderedSymClass,
                block.code === "mood_checkin" && patientHomeTodayGridCellPadMoodTopClass,
                block.code === "progress" && patientHomeTodayGridCellPadProgressBottomClass,
                smHeroRowLayout(block.code, heroRowCtx),
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
