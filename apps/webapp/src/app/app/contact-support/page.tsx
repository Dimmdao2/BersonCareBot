import LoginContactSupportPageClient from "@/app/app/contact-support/ContactSupportPageClient";

type Props = { searchParams?: Promise<{ from?: string | string[] }> };

/** Поддержка до входа: навигация «назад» учитывает `from` и сохранённый auth-flow (`sessionStorage`). */
export default async function LoginContactSupportPage({ searchParams }: Props) {
  const sp = searchParams != null ? await searchParams : {};
  return <LoginContactSupportPageClient initialFrom={sp.from} />;
}
