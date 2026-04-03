import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { routePaths } from "@/app-layer/routes/paths";
import { DoctorOnlineIntakeClient } from "../DoctorOnlineIntakeClient";

type Props = { params: Promise<{ requestId: string }> };

export default async function DoctorOnlineIntakeRequestPage({ params }: Props) {
  const session = await getCurrentSession();
  if (!session) redirect(routePaths.root);
  if (!canAccessDoctor(session.user.role)) redirect(routePaths.root);

  const { requestId } = await params;

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Онлайн-заявки пациентов</h1>
      <DoctorOnlineIntakeClient initialOpenRequestId={requestId} />
    </div>
  );
}
