"use client";

import Link from "next/link";
import { MessageSquare, ImageIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import type { DoctorClientProgramInboxRow } from "@/modules/doctor-client-card/types";
import { doctorClientTreatmentProgramInstanceHref } from "./doctorClientInstanceHref";
import { doctorClientStackedCardClass } from "./doctorClientCardChrome";
import { cn } from "@/lib/utils";

type Props = {
  userId: string;
  profileListScope?: string;
  rows: DoctorClientProgramInboxRow[];
};

const KIND_META: Record<
  DoctorClientProgramInboxRow["kind"],
  { label: string; Icon: typeof MessageSquare }
> = {
  comment: { label: "Комментарий", Icon: MessageSquare },
  media: { label: "Медиа", Icon: ImageIcon },
};

export function DoctorClientProgramInbox({ userId, profileListScope, rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Нет новых комментариев и медиа от пациента.</p>
    );
  }

  return (
    <ul className="m-0 list-none space-y-2 p-0">
      {rows.map((row) => {
        const meta = KIND_META[row.kind];
        const Icon = meta.Icon;
        return (
          <li key={`${row.stageItemId}-${row.kind}`} className={doctorClientStackedCardClass}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{row.title}</p>
                <p className="text-xs text-muted-foreground">{meta.label} от пациента</p>
              </div>
            </div>
            <Link
              href={doctorClientTreatmentProgramInstanceHref(userId, row.instanceId, {
                profileListScope,
                discussionItemId: row.stageItemId,
              })}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "mt-3 inline-flex w-full sm:w-auto",
              )}
            >
              Ответить в программе
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
