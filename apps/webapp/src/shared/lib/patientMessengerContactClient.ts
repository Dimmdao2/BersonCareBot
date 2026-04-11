import { inferMessengerChannelForRequestContact } from "@/shared/lib/messengerMiniApp";

/** Клиентский POST: запрос контакта в чат через интегратор. */
export async function postPatientMessengerRequestContact(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const hint = inferMessengerChannelForRequestContact();
  const headers: Record<string, string> = {};
  if (hint) {
    headers["X-Bersoncare-Contact-Channel"] = hint;
  }
  const res = await fetch("/api/patient/messenger/request-contact", {
    method: "POST",
    credentials: "include",
    headers,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (res.ok && data.ok === true) {
    return { ok: true };
  }
  return { ok: false, error: data.error ?? `http_${res.status}` };
}
