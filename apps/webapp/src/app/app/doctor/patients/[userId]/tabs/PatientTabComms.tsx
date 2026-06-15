"use client";

/**
 * PatientTabComms — «Коммуникации» tab for the patient card.
 *
 * Two sections stacked vertically:
 *  1. «Чат» — embedded support chat with DoctorClientEmbeddedChat
 *  2. «Комментарии к программе» — fetches the active treatment program instance on
 *     mount and opens DoctorProgramInstanceDiscussionDialog when the doctor clicks
 *     «Открыть обсуждение». Shows «Нет активной программы» when none exists.
 */

import { useEffect, useState } from "react";
import { DoctorClientEmbeddedChat } from "@/app/app/doctor/clients/DoctorClientEmbeddedChat";
import { DoctorProgramInstanceDiscussionDialog } from "@/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/DoctorProgramInstanceDiscussionDialog";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
} from "@/shared/ui/doctor/doctorVisual";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { cn } from "@/lib/utils";

type Props = {
  userId: string;
};

export function PatientTabComms({ userId }: Props) {
  const [activeInstance, setActiveInstance] = useState<TreatmentProgramInstanceSummary | null>(null);
  const [instanceLoading, setInstanceLoading] = useState(true);
  const [discussionOpen, setDiscussionOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setInstanceLoading(true);
    fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/treatment-program-instances`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data: { ok?: boolean; items?: TreatmentProgramInstanceSummary[] }) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.items)) {
          const active = data.items.find((i) => i.status !== "completed") ?? null;
          setActiveInstance(active);
        }
      })
      .catch(() => {
        // Silently ignore — fall through to «Нет активной программы»
      })
      .finally(() => {
        if (!cancelled) setInstanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="flex flex-col gap-3">
      {/* ================================================================
          CHAT SECTION
      ================================================================ */}
      <div className={cn(doctorSectionCardClass, "gap-3")}>
        <p className={doctorSectionTitleClass}>Чат</p>
        <DoctorClientEmbeddedChat patientUserId={userId} />
      </div>

      {/* ================================================================
          PROGRAM DISCUSSION SECTION
      ================================================================ */}
      <div className={cn(doctorSectionCardClass, "gap-3")}>
        <p className={doctorSectionTitleClass}>Комментарии к программе</p>

        {instanceLoading ? (
          <div className="h-10 animate-pulse rounded-md bg-muted/30" aria-busy />
        ) : activeInstance ? (
          <>
            <p className="text-sm text-muted-foreground">
              Активная программа:{" "}
              <span className="font-medium text-foreground">
                {activeInstance.title || "без названия"}
              </span>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setDiscussionOpen(true)}
            >
              Открыть обсуждение
            </Button>

            <DoctorProgramInstanceDiscussionDialog
              instanceId={activeInstance.id}
              programItems={[]}
              open={discussionOpen}
              onOpenChange={setDiscussionOpen}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Нет активной программы</p>
        )}
      </div>
    </div>
  );
}
