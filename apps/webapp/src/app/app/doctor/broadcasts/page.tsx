import { permanentRedirect } from "next/navigation";

export default function DoctorBroadcastsPage() {
  permanentRedirect("/app/doctor/communications?tab=broadcasts");
}
