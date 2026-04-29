import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { patientHomeCardDangerClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { patientButtonDangerOutlineClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type PatientHomeSosCardProps = {
  title: string;
  description: string;
  href: string;
  buttonLabel: string;
  /** Декоративный акцент в углу; не ведёт layout (§10.8 / Phase 4 LOG). */
  imageUrl?: string | null;
};

/**
 * SOS: danger surface, слева красный круг с иконкой, текст, danger-кнопка. Картинка только декор.
 */
export function PatientHomeSosCard({ title, description, href, buttonLabel, imageUrl }: PatientHomeSosCardProps) {
  return (
    <article
      id="patient-home-sos-card"
      className={cn(patientHomeCardDangerClass, "relative flex min-h-[96px] flex-col gap-3 overflow-hidden")}
    >
      {imageUrl ? (
        <div className="pointer-events-none absolute right-2 top-2 z-0 h-14 w-14 overflow-hidden rounded-lg opacity-90 shadow-sm ring-1 ring-white/80">
          {/* eslint-disable-next-line @next/next/no-img-element -- CMS URL, decorative */}
          <img src={imageUrl} alt="" className="size-full object-cover" loading="lazy" />
        </div>
      ) : null}
      <div className="relative z-[1] flex gap-3 pr-16">
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#ef4444]"
          aria-hidden
        >
          <AlertTriangle className="size-6 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-[var(--patient-text-primary)]">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-[var(--patient-text-secondary)]">{description}</p>
        </div>
      </div>
      <Link href={href} prefetch={false} className={cn(patientButtonDangerOutlineClass, "relative z-[1]")}>
        {buttonLabel}
      </Link>
    </article>
  );
}
