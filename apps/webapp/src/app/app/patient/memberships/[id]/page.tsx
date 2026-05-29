import { PatientPackageDetailClient } from "./PatientPackageDetailClient";

type Props = { params: Promise<{ id: string }> };

export default async function PatientMembershipDetailPage({ params }: Props) {
  const { id } = await params;
  return <PatientPackageDetailClient patientPackageId={id} />;
}
