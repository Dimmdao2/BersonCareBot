/**
 * Единственное место, где собирается значение заголовка `Content-Disposition`.
 *
 * RFC 5987: имя файла с кавычкой, обратным слэшем или управляющим символом не должно уметь
 * дописать в заголовок собственный параметр — поэтому ASCII-вариант чистится, а точное имя
 * уходит отдельным `filename*`. Правило одно на всё приложение: и на пресайн-ссылку в
 * хранилище (`infra/s3/client.ts`), и на ответ, который вебапп отдаёт сам.
 */
export function contentDispositionHeaderValue(
  kind: 'inline' | 'attachment',
  filename: string | undefined,
): string {
  const name = filename?.trim();
  if (!name) return kind;
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
