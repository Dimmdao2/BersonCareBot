import { redirect } from "next/navigation";
import { routePaths } from "@/app-layer/routes/paths";

/**
 * Legacy route kept for backward compatibility.
 * Native booking flow lives in patient cabinet.
 */
export default async function PatientBookingPage() {
  redirect(routePaths.cabinet);
}
