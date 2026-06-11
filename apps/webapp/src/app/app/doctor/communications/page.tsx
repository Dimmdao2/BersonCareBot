import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CommunicationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const tab = typeof params.tab === "string" ? params.tab : "chats";

  if (tab === "intake") {
    const id = typeof params.id === "string" ? params.id : undefined;
    redirect(id ? `/app/doctor/online-intake/${id}` : "/app/doctor/online-intake");
  }

  if (tab === "broadcasts") {
    if (params.archive === "1") redirect("/app/doctor/broadcasts/archive");
    redirect("/app/doctor/broadcasts");
  }

  redirect("/app/doctor/messages");
}
