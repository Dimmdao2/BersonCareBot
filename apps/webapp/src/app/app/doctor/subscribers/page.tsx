/**
 * Legacy URL `/app/doctor/subscribers`: сохранён для старых закладок и deeplink’ов.
 * В меню не добавлять — канон списка клиентов: `/app/doctor/clients`.
 */
import { redirect } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";

type Props = {
  searchParams: Promise<{
    q?: string;
    telegram?: string;
    max?: string;
    appointment?: string;
    visitedMonth?: string;
    selected?: string;
  }>;
};

export default async function DoctorSubscribersPage({ searchParams }: Props) {
  await requireDoctorAccess();
  const params = await searchParams;
  const query = new URLSearchParams();
  query.set("scope", "all");
  if (params.q) query.set("q", params.q);
  if (params.telegram === "1") query.set("telegram", "1");
  if (params.max === "1") query.set("max", "1");
  if (params.appointment === "1") query.set("appointment", "1");
  if (params.selected) query.set("selected", params.selected);
  redirect(`/app/doctor/clients?${query.toString()}`);
}
