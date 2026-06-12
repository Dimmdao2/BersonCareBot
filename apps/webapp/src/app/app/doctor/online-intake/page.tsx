import { permanentRedirect } from "next/navigation";

export default function DoctorOnlineIntakePage() {
  permanentRedirect("/app/doctor/communications?tab=intake");
}
