export function canRenderInlineImage(mimeType: string): boolean {
  const mime = mimeType.trim().toLowerCase();
  return mime.startsWith("image/") && mime !== "image/svg+xml";
}
