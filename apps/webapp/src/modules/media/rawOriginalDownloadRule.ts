/**
 * Единственная формулировка правила «кому отдаётся загруженный файл» (М6,
 * `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`).
 *
 * Владелец 10.09.2026: «исходник отдаём… только тому специалисту, который это загрузил». Правило
 * живёт здесь одно: дверь выдачи (`app-layer/media/authorizeMediaDelivery.ts`) принимает по нему
 * решение, а списочные маршруты по нему же решают, показывать ли кнопку. Второй копии условия в
 * коде быть не должно — иначе интерфейс и дверь однажды разойдутся.
 *
 * Организационная стена сюда НЕ входит: её раньше ставит принципал в репозитории.
 */
export function isRawOriginalUploader(input: {
  uploadedBy: string | null | undefined;
  requesterUserId: string | null | undefined;
}): boolean {
  const uploader = typeof input.uploadedBy === 'string' ? input.uploadedBy.trim() : '';
  const requester =
    typeof input.requesterUserId === 'string' ? input.requesterUserId.trim() : '';
  return uploader.length > 0 && requester.length > 0 && uploader === requester;
}
