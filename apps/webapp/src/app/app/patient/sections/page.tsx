/**
 * Каталог разделов CMS больше не показываем пациенту — на главную «Сегодня».
 */

import { redirect } from "next/navigation";
import { routePaths } from "@/app-layer/routes/paths";

export default function PatientSectionsIndexPage() {
  redirect(routePaths.patient);
}
