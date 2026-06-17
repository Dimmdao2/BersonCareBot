"use client";

/**
 * PatientTabComms — «Коммуникации» tab for the patient card.
 *
 * Two sections stacked vertically:
 *  1. «Чат» — bounded-height chat panel with bubble layout (DoctorClientEmbeddedChat →
 *     DoctorChatPanel → ChatView). The card has a fixed height so the ChatView
 *     overflow-y-auto scroll constraint works correctly.
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

/**
 * Fixed height for the chat card so that ChatView's `flex-1 overflow-y-auto`
 * scroll region is correctly bounded. Without a fixed-height ancestor the flex
 * expands to content size — every message just stacks in an unbounded flat list
 * with no visible scroll or chat-panel feel.
 */
const CHAT_CARD_HEIGHT = "h-[min(65vh,580px)]";

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
          CHAT SECTION — bounded height so ChatView scroll works
      ================================================================ */}
      <div
        className={cn(
          "rounded-xl border border-border bg-card",
          "flex flex-col overflow-hidden",
          CHAT_CARD_HEIGHT,
        )}
      >
        {/* Section title strip — shrink-0 so it never competes with chat for height */}
        <div className="shrink-0 border-b border-border/60 px-3 py-2.5">
          <p className={doctorSectionTitleClass}>Чат</p>
        </div>

        {/* Chat fills all remaining height; overflow-hidden passes the bound down
            to DoctorClientEmbeddedChat → DoctorChatPanel → ChatView scroll region */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <DoctorClientEmbeddedChat patientUserId={userId} />
        </div>
      </div>

      {/* ================================================================
          PROGRAM DISCUSSION SECTION
      ================================================================ */}
      <div className={doctorSectionCardClass}>
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
