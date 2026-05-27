import { redirect } from "next/navigation";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

type Props = {
  params: Promise<{ auditId: string }>;
};

/** Legacy deep link из старых push → чат (полный текст рассылки в thread). */
export default async function PatientBroadcastPage({ params }: Props) {
  const { auditId } = await params;
  await requirePatientAccess(routePaths.patientBroadcast(auditId));
  redirect(routePaths.patientMessages);
}
