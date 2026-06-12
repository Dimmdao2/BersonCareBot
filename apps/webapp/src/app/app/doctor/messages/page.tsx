import { permanentRedirect } from "next/navigation";

export default async function DoctorMessagesPage() {
  permanentRedirect("/app/doctor/communications?tab=chats");
}
