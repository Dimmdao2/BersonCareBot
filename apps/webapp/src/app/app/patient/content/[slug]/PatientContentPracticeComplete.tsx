"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { routePaths } from "@/app-layer/routes/paths";
import { appLoginWithNextHref } from "@/app/app/patient/home/patientHomeGuestNav";
import { PageSection } from "@/components/common/layout/PageSection";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PracticeSource } from "@/modules/patient-practice/types";
import { cn } from "@/lib/utils";
import {
  patientCardClass,
  patientInlineLinkClass,
  patientMutedTextClass,
  patientPrimaryActionClass,
} from "@/shared/ui/patientVisual";

type Props = {
  contentPageId: string;
  contentPath: string;
  practiceSource: PracticeSource;
  guest: boolean;
  needsActivation: boolean;
};

export function PatientContentPracticeComplete({
  contentPageId,
  contentPath,
  practiceSource,
  guest,
  needsActivation,
}: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const loginHref = appLoginWithNextHref(contentPath);

  async function submitWithFeeling(feeling: number | null) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/patient/practice/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentPageId,
          source: practiceSource,
          feeling,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.status === 401) {
        toast.error("Войдите, чтобы сохранить выполнение.");
        return;
      }
      if (res.status === 403 && data.error === "patient_activation_required") {
        toast.error("Подтвердите профиль пациента, чтобы сохранять прогресс.");
        return;
      }
      if (!res.ok || !data.ok) {
        toast.error("Не удалось сохранить. Попробуйте позже.");
        return;
      }
      setSaved(true);
      setDialogOpen(false);
      toast.success("Записано.");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (guest) {
    return (
      <PageSection as="section" id="patient-content-practice-complete" className="mt-4">
        <div className={patientCardClass}>
          <p className={patientMutedTextClass}>
            <Link href={loginHref} className={patientInlineLinkClass}>
              Войдите
            </Link>
            , чтобы отмечать выполнение практики.
          </p>
        </div>
      </PageSection>
    );
  }

  if (needsActivation) {
    return (
      <PageSection as="section" id="patient-content-practice-complete" className="mt-4">
        <div className={patientCardClass}>
          <p className={patientMutedTextClass}>
            Активируйте профиль пациента, чтобы отмечать прогресс.{" "}
            <Link
              href={`${routePaths.bindPhone}?next=${encodeURIComponent(contentPath)}`}
              className={patientInlineLinkClass}
            >
              Подтвердить телефон
            </Link>
          </p>
        </div>
      </PageSection>
    );
  }

  if (saved) {
    return (
      <PageSection as="section" id="patient-content-practice-complete" className="mt-4">
        <div className={patientCardClass}>
          <p className={patientMutedTextClass}>Практика отмечена выполненной.</p>
        </div>
      </PageSection>
    );
  }

  return (
    <>
      <PageSection as="section" id="patient-content-practice-complete" className="mt-4">
        <div className={patientCardClass}>
          <Button type="button" className={cn(patientPrimaryActionClass, "w-full sm:w-auto")} onClick={() => setDialogOpen(true)}>
            Я выполнил(а) практику
          </Button>
        </div>
      </PageSection>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Как самочувствие после?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                type="button"
                variant="outline"
                disabled={submitting}
                className="min-w-12"
                aria-label={`Оценка ${n} из 5`}
                onClick={() => void submitWithFeeling(n)}
              >
                {n}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => void submitWithFeeling(null)}>
              Пропустить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
