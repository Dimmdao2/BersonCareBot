import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SchedulePage({ searchParams }: Props) {
  const params = await searchParams;
  const tab = typeof params.tab === "string" ? params.tab : "calendar";

  if (tab === "setup") redirect("/app/doctor/admin/booking");
  redirect("/app/doctor/calendar");
}
