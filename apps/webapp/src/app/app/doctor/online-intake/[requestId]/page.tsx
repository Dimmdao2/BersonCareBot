import { permanentRedirect } from "next/navigation";

type Props = { params: Promise<{ requestId: string }> };

export default async function DoctorOnlineIntakeRequestPage({ params }: Props) {
  const { requestId } = await params;
  permanentRedirect(`/app/doctor/communications?tab=intake&id=${requestId}`);
}
