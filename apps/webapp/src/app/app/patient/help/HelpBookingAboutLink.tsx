import Link from "next/link";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import { patientInlineLinkClass, patientSectionSurfaceClass } from "@/shared/ui/patientVisual";

/** Ссылка со статьи справки `booking` на короткую страницу `/app/patient/about`. */
export function HelpBookingAboutLink() {
  return (
    <section className={cn(patientSectionSurfaceClass, "!gap-2 !p-4")}>
      <Link href={routePaths.patientAbout} className={cn(patientInlineLinkClass, "text-sm font-medium")}>
        О специалисте
      </Link>
    </section>
  );
}
