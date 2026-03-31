/**
 * Legacy route: редирект карточки подписчика в единый профиль клиента.
 */
import { redirect } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";

type Props = { params: Promise<{ userId: string }> };

export default async function DoctorSubscriberProfilePage({ params }: Props) {
  await requireDoctorAccess();
  const { userId } = await params;
  redirect(`/app/doctor/clients/${encodeURIComponent(userId)}?scope=all`);
}
