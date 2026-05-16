import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { patientInlineLinkClass } from "@/shared/ui/patientVisual";

type Props = {
  sectionSlug: string;
  className?: string;
};

/** Полоска под {@link PatientTopNav}: возврат к списку материалов CMS-раздела. */
export function PatientBackToSectionShellRow({ sectionSlug, className }: Props) {
  const trimmed = sectionSlug.trim();
  if (!trimmed) return null;

  const href = `/app/patient/sections/${encodeURIComponent(trimmed)}`;

  return (
    <Link
      href={href}
      prefetch={false}
      data-testid="patient-back-to-section-link"
      className={cn(
        patientInlineLinkClass,
        "inline-flex min-h-10 max-w-full items-center gap-1.5 py-1 text-sm no-underline hover:underline",
        className,
      )}
    >
      <ArrowLeft className="size-4 shrink-0" strokeWidth={2} aria-hidden />
      Назад к разделу
    </Link>
  );
}
