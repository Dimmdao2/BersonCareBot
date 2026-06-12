import { permanentRedirect } from "next/navigation";

export default async function DoctorOnlineIntakePage() {
  permanentRedirect("/app/doctor/communications?tab=intake");
}
