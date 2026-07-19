import { redirect } from "next/navigation";

/** Team is fail-closed until C4 defines the clinic entitlement. */
export default function DoctorClinicMembersPage() {
  redirect("/app/settings");
}
