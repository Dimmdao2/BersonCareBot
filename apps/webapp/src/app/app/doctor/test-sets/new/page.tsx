import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { TestSetForm } from "../TestSetForm";
import { TEST_SETS_PATH } from "../paths";
import { clinicalTestLibraryRows } from "../clinicalTestLibraryRows";

export default async function NewTestSetPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const clinicalTestsForPicker = await deps.clinicalTests.listClinicalTests({ archiveScope: "active" });
  const clinicalTestsLibrary = clinicalTestLibraryRows(clinicalTestsForPicker);
  return (
    <DoctorAppShell title="Новый набор тестов" user={session.user} backHref={TEST_SETS_PATH}>
      <TestSetForm clinicalTestsLibrary={clinicalTestsLibrary} />
    </DoctorAppShell>
  );
}
