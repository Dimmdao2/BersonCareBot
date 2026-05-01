import { redirect } from "next/navigation";

/** Legacy URL: новости сняты (этап APP_RESTRUCTURE); редирект для закладок. */
export default function DoctorContentNewsRedirectPage() {
  redirect("/app/doctor/content/motivation");
}
