import { permanentRedirect } from "next/navigation";

export default function DoctorCommentsPage() {
  permanentRedirect("/app/doctor/communications?tab=comments");
}
