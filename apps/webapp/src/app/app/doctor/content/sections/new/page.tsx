import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { parsePatientHomeCmsReturnQuery } from "@/modules/patient-home/patientHomeCmsReturnUrls";
import { SectionForm } from "../SectionForm";

function pick(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
}

export default async function DoctorContentSectionNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireDoctorAccess();
  const sp = await searchParams;
  const patientHomeContext = parsePatientHomeCmsReturnQuery({
    returnTo: pick(sp, "returnTo"),
    patientHomeBlock: pick(sp, "patientHomeBlock"),
    suggestedTitle: pick(sp, "suggestedTitle"),
    suggestedSlug: pick(sp, "suggestedSlug"),
  });

  return (
    <AppShell title="Новый раздел" user={session.user} variant="doctor">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <SectionForm patientHomeContext={patientHomeContext} />
      </section>
    </AppShell>
  );
}
