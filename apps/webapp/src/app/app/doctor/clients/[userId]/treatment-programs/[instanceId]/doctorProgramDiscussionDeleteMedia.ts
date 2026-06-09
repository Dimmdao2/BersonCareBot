"use client";

export type DeleteDoctorProgramDiscussionMediaResult =
  | { ok: true }
  | { ok: false; error: string };

function mapDeleteErrorToRu(errorCode: string | null | undefined): string {
  if (errorCode === "message_not_found") return "Сообщение не найдено";
  if (errorCode === "message_not_media") return "Можно удалить только медиа-сообщение";
  if (errorCode === "message_not_deletable") return "Это сообщение нельзя удалить";
  return "Не удалось удалить файл из чата";
}

export async function deleteDoctorProgramDiscussionMediaMessage(params: {
  instanceId: string;
  messageId: string;
}): Promise<DeleteDoctorProgramDiscussionMediaResult> {
  const res = await fetch(
    `/api/doctor/treatment-program-instances/${encodeURIComponent(params.instanceId)}/discussion/messages/${encodeURIComponent(params.messageId)}`,
    { method: "DELETE" },
  );
  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !data?.ok) {
    return { ok: false, error: mapDeleteErrorToRu(data?.error) };
  }
  return { ok: true };
}
