import type { ProgramItemCompleteDialogPayload } from '@/app/app/patient/treatment/ProgramItemCompleteDialog';
import type { TreatmentProgramInstanceDetail } from '@/modules/treatment-program/types';

export async function postProgramItemComplete(params: {
  base: string;
  itemId: string;
}): Promise<
  | {
      ok: true;
      item: TreatmentProgramInstanceDetail | null;
      completion: { id: string; createdAt: string };
    }
  | { ok: false; error: string }
> {
  const res = await fetch(`${params.base}/${encodeURIComponent(params.itemId)}/progress/complete`, {
    method: 'POST',
  });
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    item?: TreatmentProgramInstanceDetail | null;
    completion?: { id?: string; createdAt?: string };
  } | null;
  if (!res.ok || !data?.ok || !data.completion?.id || !data.completion.createdAt) {
    return { ok: false, error: data?.error ?? 'Ошибка' };
  }
  return {
    ok: true,
    item: data.item ?? null,
    completion: { id: data.completion.id, createdAt: data.completion.createdAt },
  };
}

export async function patchProgramItemCompletionMetrics(params: {
  base: string;
  itemId: string;
  completionId: string;
  payload: ProgramItemCompleteDialogPayload;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `${params.base}/${encodeURIComponent(params.itemId)}/progress/complete/${encodeURIComponent(params.completionId)}/metrics`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params.payload),
    },
  );
  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  return res.ok && data?.ok
    ? { ok: true }
    : { ok: false, error: data?.error ?? 'Ошибка' };
}
