import { redirect } from "next/navigation";
import { PatientPackagePayClient } from "./PatientPackagePayClient";
import { routePaths } from "@/app-layer/routes/paths";

type Props = { searchParams: Promise<{ patientPackageId?: string }> };

export default async function PatientPackagePayPage({ searchParams }: Props) {
  const { patientPackageId } = await searchParams;
  if (!patientPackageId?.trim()) redirect(routePaths.patientBooking);
  return <PatientPackagePayClient patientPackageId={patientPackageId.trim()} />;
}
