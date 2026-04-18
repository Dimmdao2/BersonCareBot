import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { TestSetForm } from "../TestSetForm";
import { TEST_SETS_PATH } from "../paths";

export default async function NewTestSetPage() {
  const session = await requireDoctorAccess();
  return (
    <AppShell title="Новый набор тестов" user={session.user} variant="doctor" backHref={TEST_SETS_PATH}>
      <TestSetForm />
    </AppShell>
  );
}
