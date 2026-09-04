/**
 * The ONE place the doctor cabinet hands a payment link to a patient.
 *
 * A specialist has exactly one delivery contract for an arbitrary text: the patient's support
 * conversation. `POST /api/doctor/messages/conversations/ensure` resolves (or opens) it and
 * `POST /api/doctor/messages/[conversationId]` appends the message, whose `sendAdminReply`
 * fan-out notifies whichever of the patient's channels are actually connected
 * (`notifyPatientDoctorReply`: telegram / max / web_push / email, each gated by a real binding and
 * the patient's own preferences). There is no per-channel send seam and no SMS contract for
 * patients, so no surface may offer «отправить в Telegram / SMS / push» as separate options.
 *
 * Callers must first prove the patient can receive it — the portal status carried by the payment
 * reads as `patientChatAvailable`.
 */
export async function sendPaymentLinkToPatientChat(input: {
  patientUserId: string;
  /** Scopes the idempotency key so a retry never posts the link twice. */
  subjectRef: string;
  link: string;
}): Promise<boolean> {
  const ensured = await fetch('/api/doctor/messages/conversations/ensure', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ patientUserId: input.patientUserId }),
  });
  const ensuredJson = (await ensured.json().catch(() => null)) as {
    ok?: boolean;
    conversationId?: string;
  } | null;
  if (!ensured.ok || !ensuredJson?.ok || !ensuredJson.conversationId) return false;

  const sent = await fetch(
    `/api/doctor/messages/${encodeURIComponent(ensuredJson.conversationId)}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: `Ссылка на оплату: ${input.link}`,
        idempotencyKey: `payment-link:${input.subjectRef}:${input.link}`,
      }),
    },
  );
  const sentJson = (await sent.json().catch(() => null)) as { ok?: boolean } | null;
  return sent.ok && sentJson?.ok === true;
}
