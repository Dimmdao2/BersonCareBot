import { permanentRedirect } from "next/navigation";

export default async function DoctorBroadcastsPage() {
  permanentRedirect("/app/doctor/communications?tab=broadcasts");
}
