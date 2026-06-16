"use client";

import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/shared/ui/doctor/primitives/dialog";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button";
import { appointmentStatusLabel } from "@/modules/booking-calendar/appointmentStatusLabels";
import { patientCardHref } from "./patients/patientCardHref";
import type { TodayAppointmentItem } from "./loadDoctorTodayDashboard";

type Props = {
  appt: TodayAppointmentItem | null;
  onClose: () => void;
};

export function TodayAppointmentModal({ appt, onClose }: Props) {
  return (
    <Dialog open={appt !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      {appt && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{appt.clientLabel}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="font-medium text-foreground">{appt.time}</span>
              {appt.branchName ? (
                <span>· {appt.branchName}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Тип:</span>
              <span>{appt.type}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Статус:</span>
              <span>{appointmentStatusLabel(appt.status)}</span>
            </div>
          </div>

          <DialogFooter>
            {appt.clientUserId ? (
              <>
                <DialogClose
                  render={
                    <Link
                      href={patientCardHref(appt.clientUserId)}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Карточка пациента
                    </Link>
                  }
                />
                <DialogClose
                  render={
                    <Link
                      href={patientCardHref(appt.clientUserId, {
                        tab: "karta",
                        createVisitFrom: appt.id,
                      })}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      + Создать визит из записи
                    </Link>
                  }
                />
              </>
            ) : null}
            <Link
              href="/app/doctor/schedule"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Открыть расписание
            </Link>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
