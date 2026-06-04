import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import { cn } from "@/lib/utils";
import { patientSectionSurfaceClass } from "@/shared/ui/patient/patientVisual";
import { PatientAboutSiteLink } from "./PatientAboutSiteLink";

export const dynamic = "force-dynamic";

export default async function PatientAboutPage() {
  const session = await getOptionalPatientSession();

  return (
    <PatientAppShell
      title="О специалисте"
      user={session?.user ?? null}
      backHref={routePaths.patientHelp}
      backLabel="Справка"
     
    >
      <section className={cn(patientSectionSurfaceClass, "!gap-4 !p-6")}>
        <PatientAboutSiteLink />
      </section>
    </PatientAppShell>
  );
}
