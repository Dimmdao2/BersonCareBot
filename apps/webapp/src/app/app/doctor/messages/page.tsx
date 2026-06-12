import { permanentRedirect } from "next/navigation";

export default function DoctorMessagesPage() {
  permanentRedirect("/app/doctor/communications?tab=chats");
}
