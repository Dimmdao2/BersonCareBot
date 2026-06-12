import { permanentRedirect } from "next/navigation";

export default async function DoctorBroadcastDeliveryArchivePage() {
  permanentRedirect("/app/doctor/communications?tab=broadcasts&archive=1");
}
