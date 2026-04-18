import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { NewTemplateForm } from "./NewTemplateForm";
import { TREATMENT_PROGRAM_TEMPLATES_PATH } from "../paths";

export default async function NewTreatmentProgramTemplatePage() {
  const session = await requireDoctorAccess();
  return (
    <AppShell
      title="Новый шаблон программы"
      user={session.user}
      variant="doctor"
      backHref={TREATMENT_PROGRAM_TEMPLATES_PATH}
    >
      <NewTemplateForm />
    </AppShell>
  );
}
