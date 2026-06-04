import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import {
  parsePatientHomeCmsReturnQuery,
  type PatientHomeCmsReturnQuery,
} from "@/modules/patient-home/patientHomeCmsReturnUrls";
import { isSystemParentCode } from "@/modules/content-sections/types";
import { cn } from "@/lib/utils";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { doctorSectionCardClass } from "@/shared/ui/doctor/doctorVisual";
import { SectionForm } from "../SectionForm";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

function pick(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
}

function normalizeSuggestedSlug(raw: string | string[] | undefined): string | undefined {
  const s = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase() ?? "";
  if (!s || !/^[a-z0-9-]+$/.test(s) || /^-+$/.test(s)) return undefined;
  return s;
}

export default async function DoctorContentSectionNewPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const sp = searchParams ? await searchParams : {};
  const patientHomeContext: PatientHomeCmsReturnQuery | null = parsePatientHomeCmsReturnQuery({
    returnTo: pick(sp, "returnTo"),
    patientHomeBlock: pick(sp, "patientHomeBlock"),
    suggestedTitle: pick(sp, "suggestedTitle"),
    suggestedSlug: pick(sp, "suggestedSlug"),
  });
  const initialSuggestedSlug =
    normalizeSuggestedSlug(patientHomeContext?.suggestedSlug) ?? normalizeSuggestedSlug(sp.suggestedSlug);
  const rawParent = pick(sp, "systemParentCode")?.trim().toLowerCase() ?? "";
  const initialSystemParentCode = isSystemParentCode(rawParent) ? rawParent : null;

  return (
    <DoctorAppShell
      title="Новый раздел"
      user={session.user}
     
      backHref={patientHomeContext?.returnTo ?? "/app/doctor/content/sections"}
    >
      <section className={cn(doctorSectionCardClass, "gap-4")}>
        <SectionForm
          key={`${initialSuggestedSlug ?? ""}-${initialSystemParentCode ?? ""}`}
          initialSuggestedSlug={initialSuggestedSlug}
          initialSystemParentCode={initialSystemParentCode}
          patientHomeContext={patientHomeContext ?? undefined}
        />
      </section>
    </DoctorAppShell>
  );
}
