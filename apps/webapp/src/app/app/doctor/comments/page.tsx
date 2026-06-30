import { permanentRedirect } from "next/navigation";

export default async function DoctorCommentsPage() {
  permanentRedirect("/app/doctor/communications?tab=comments");
}
