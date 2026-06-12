import { permanentRedirect } from "next/navigation";

export default function DoctorBroadcastDeliveryArchivePage() {
  permanentRedirect("/app/doctor/communications?tab=broadcasts&archive=1");
}
