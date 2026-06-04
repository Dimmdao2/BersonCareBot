import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { routePaths } from "@/app-layer/routes/paths";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorOnlineIntakeClient } from "../DoctorOnlineIntakeClient";

type Props = { params: Promise<{ requestId: string }> };

export default async function DoctorOnlineIntakeRequestPage({ params }: Props) {
  const session = await getCurrentSession();
  if (!session) redirect(routePaths.root);
  if (!canAccessDoctor(session.user.role)) redirect(routePaths.root);

  const { requestId } = await params;

  return (
    <DoctorAppShell title="Онлайн-заявки пациентов" user={session.user}>
      <h1 className="text-base font-semibold tracking-tight text-foreground">Онлайн-заявки пациентов</h1>
      <DoctorOnlineIntakeClient initialOpenRequestId={requestId} />
    </DoctorAppShell>
  );
}
