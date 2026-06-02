"use client";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import type { DoctorClientProgramCardAggregates } from "@/modules/doctor-client-card/types";
import type { DoctorClientTabId } from "@/modules/doctor-client-card/types";
import { cn } from "@/lib/utils";

type ChipVariant = "default" | "destructive" | "outline" | "secondary";

type PatientActionStripProps = {
  pendingTestsCount: number;
  chatUnreadCount: number;
  aggregates: DoctorClientProgramCardAggregates;
  onNavigateTab: (tab: DoctorClientTabId) => void;
  onNavigateAnchor: (anchorId: string) => void;
};

export function PatientActionStrip({
  pendingTestsCount,
  chatUnreadCount,
  aggregates,
  onNavigateTab,
  onNavigateAnchor,
}: PatientActionStripProps) {
  const chips: { key: string; label: string; variant: ChipVariant; onClick: () => void }[] = [];

  if (pendingTestsCount > 0) {
    chips.push({
      key: "tests",
      label: `К проверке · ${pendingTestsCount}`,
      variant: "default",
      onClick: () => {
        onNavigateTab("program");
        onNavigateAnchor("doctor-client-section-pending-program-tests");
      },
    });
  }
  if (aggregates.newCommentsCount > 0) {
    chips.push({
      key: "comments",
      label: `Новые комментарии · ${aggregates.newCommentsCount}`,
      variant: "default",
      onClick: () => {
        onNavigateTab("program");
        onNavigateAnchor("doctor-client-section-program-inbox");
      },
    });
  }
  if (aggregates.patientMediaCount > 0) {
    chips.push({
      key: "media",
      label: `Медиа от пациента · ${aggregates.patientMediaCount}`,
      variant: "default",
      onClick: () => {
        onNavigateTab("program");
        onNavigateAnchor("doctor-client-section-program-inbox");
      },
    });
  }
  if (chatUnreadCount > 0) {
    chips.push({
      key: "chat",
      label: `Сообщение в чате · ${chatUnreadCount}`,
      variant: "destructive",
      onClick: () => {
        onNavigateTab("communications");
        onNavigateAnchor("doctor-client-section-communications");
      },
    });
  }
  if (aggregates.planNotOpened) {
    chips.push({
      key: "plan",
      label: "План не открыт",
      variant: "outline",
      onClick: () => onNavigateTab("overview"),
    });
  }

  return (
    <div className="border-b border-border bg-muted/25 px-4 py-2.5">
      {chips.length === 0 ? (
        <p className="text-xs text-muted-foreground">Срочных задач нет</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Сейчас</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [-webkit-overflow-scrolling:touch]">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={cn(
                  buttonVariants({ variant: chip.variant, size: "sm" }),
                  "shrink-0 whitespace-nowrap",
                )}
                onClick={chip.onClick}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function programTabBadgeCount(
  pendingTestsCount: number,
  aggregates: DoctorClientProgramCardAggregates,
): number {
  return pendingTestsCount + aggregates.newCommentsCount + aggregates.patientMediaCount;
}

export function ProgramTabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-[10px] tabular-nums">
      {count}
    </Badge>
  );
}
