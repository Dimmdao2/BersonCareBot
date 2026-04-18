import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { ClinicalTestForm } from "../ClinicalTestForm";

export default async function NewClinicalTestPage() {
  const session = await requireDoctorAccess();
  return (
    <AppShell title="Новый тест" user={session.user} variant="doctor" backHref="/app/doctor/clinical-tests">
      <ClinicalTestForm />
    </AppShell>
  );
}
