import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { LfkIntakeClient } from "./LfkIntakeClient";

export default async function LfkIntakePage() {
  const session = await requirePatientAccessWithPhone(routePaths.intakeLfk);

  return (
    <AppShell
      title="Онлайн-запрос"
      user={session.user}
      backHref={routePaths.bookingNew}
      backLabel="Назад"
      variant="patient"
    >
      <LfkIntakeClient />
    </AppShell>
  );
}
