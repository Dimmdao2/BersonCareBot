import { redirect } from "next/navigation";

/** C4A: the settings hub's Team tab enforces the clinic_team entitlement/role gate itself. */
export default function DoctorClinicMembersPage() {
  redirect("/app/settings?tab=team");
}
