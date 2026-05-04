import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { TestSetForm } from "../TestSetForm";
import { TEST_SETS_PATH } from "../paths";
import { clinicalTestLibraryRows } from "../clinicalTestLibraryRows";

export default async function NewTestSetPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const clinicalTestsForPicker = await deps.clinicalTests.listClinicalTests({ archiveScope: "active" });
  const clinicalTestsLibrary = clinicalTestLibraryRows(clinicalTestsForPicker);
  return (
    <AppShell title="Новый набор тестов" user={session.user} variant="doctor" backHref={TEST_SETS_PATH}>
      <TestSetForm clinicalTestsLibrary={clinicalTestsLibrary} />
    </AppShell>
  );
}
