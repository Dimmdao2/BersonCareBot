import type { ProgramItemCompleteDialogPayload } from "@/app/app/patient/treatment/ProgramItemCompleteDialog";

export async function postProgramItemComplete(params: {
  base: string;
  itemId: string;
  payload?: ProgramItemCompleteDialogPayload;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`${params.base}/${encodeURIComponent(params.itemId)}/progress/complete`, {
    method: "POST",
    headers: params.payload ? { "Content-Type": "application/json" } : undefined,
    body: params.payload ? JSON.stringify(params.payload) : undefined,
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error ?? "Ошибка" };
  }
  return { ok: true };
}
