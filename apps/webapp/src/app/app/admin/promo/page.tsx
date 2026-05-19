import { redirect } from "next/navigation";

/** Legacy URL: промо-настройка в кабинете врача (доступ doctor + admin). */
export default function AdminPromoProgramRedirectPage() {
  redirect("/app/doctor/treatment-program-promo");
}
