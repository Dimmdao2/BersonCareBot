import Link from "next/link";
import type { ResolvedSosCard } from "@/modules/patient-home/patientHomeResolvers";
import { patientHomeCardClass } from "./patientHomeCardStyles";

type Props = { sos: ResolvedSosCard | null };

export function PatientHomeSosCard({ sos }: Props) {
  if (!sos) return null;

  return (
    <section aria-labelledby="patient-home-sos-heading">
      <h2 id="patient-home-sos-heading" className="mb-2 text-base font-semibold">
        Если болит сейчас
      </h2>
      <Link
        href={sos.href}
        className={`${patientHomeCardClass} block overflow-hidden p-0 transition-colors hover:border-primary/30`}
      >
        {sos.imageUrl ?
          <div className="aspect-video w-full bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sos.imageUrl} alt="" className="h-full w-full object-cover" />
          </div>
        : null}
        <div className="p-4">
          <h3 className="text-base font-semibold">{sos.title}</h3>
          {sos.subtitle?.trim() ?
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{sos.subtitle.trim()}</p>
          : null}
          <span className="mt-3 inline-flex text-sm font-medium text-primary">Открыть</span>
        </div>
      </Link>
    </section>
  );
}
