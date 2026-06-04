import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { NewTemplateForm } from "./NewTemplateForm";
import { TREATMENT_PROGRAM_TEMPLATES_PATH } from "../paths";

export default async function NewTreatmentProgramTemplatePage() {
  const session = await requireDoctorAccess();
  return (
    <DoctorAppShell
      title="Новый шаблон программы"
      user={session.user}
     
      backHref={TREATMENT_PROGRAM_TEMPLATES_PATH}
    >
      <NewTemplateForm />
    </DoctorAppShell>
  );
}
