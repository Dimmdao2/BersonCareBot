"use client";

type MarkDoctorProgramDiscussionReadInput = {
  instanceId: string;
  stageItemId: string;
};

export type MarkDoctorProgramDiscussionReadResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
    };

function mapMarkReadErrorToRu(errorCode: string | null | undefined): string {
  if (errorCode === "invalid_id") return "Некорректный идентификатор";
  if (errorCode === "not_found") return "Комментарий не найден";
  return "Не удалось отметить как прочитанное";
}

export async function markDoctorProgramDiscussionRead(
  input: MarkDoctorProgramDiscussionReadInput,
): Promise<MarkDoctorProgramDiscussionReadResult> {
  const res = await fetch(
    `/api/doctor/treatment-program-instances/${encodeURIComponent(input.instanceId)}/items/${encodeURIComponent(input.stageItemId)}/discussion/read`,
    { method: "POST" },
  );
  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !data?.ok) {
    return {
      ok: false,
      error: mapMarkReadErrorToRu(data?.error),
    };
  }
  return { ok: true };
}
