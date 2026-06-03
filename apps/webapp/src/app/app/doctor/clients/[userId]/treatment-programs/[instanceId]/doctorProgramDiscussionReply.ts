"use client";

type SendDoctorProgramDiscussionReplyInput = {
  instanceId: string;
  stageItemId: string;
  text: string;
};

export type SendDoctorProgramDiscussionReplyResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
    };

function mapReplyErrorToRu(errorCode: string | null | undefined): string {
  if (errorCode === "feature_disabled") return "Ответы временно отключены";
  if (errorCode === "program_not_doctor_assigned") return "Ответ доступен только для программ, назначенных врачом";
  if (errorCode === "program_item_not_active") return "Нельзя ответить по неактивному пункту";
  if (errorCode === "stage_item_not_found" || errorCode === "not_found") return "Пункт не найден";
  if (errorCode === "invalid_body") return "Некорректный текст ответа";
  return "Не удалось отправить ответ";
}

export async function sendDoctorProgramDiscussionReply(
  input: SendDoctorProgramDiscussionReplyInput,
): Promise<SendDoctorProgramDiscussionReplyResult> {
  const res = await fetch(
    `/api/doctor/treatment-program-instances/${encodeURIComponent(input.instanceId)}/items/${encodeURIComponent(input.stageItemId)}/program-note-reply`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.text }),
    },
  );
  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !data?.ok) {
    return {
      ok: false,
      error: mapReplyErrorToRu(data?.error),
    };
  }
  return { ok: true };
}
