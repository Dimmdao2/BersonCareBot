/** Body text for patient read page from stored `message_body` + `message_title`. */
export function extractBroadcastBodyContent(messageTitle: string, messageBody: string): string {
  const title = messageTitle.trim();
  const stored = messageBody.trim();
  if (!stored) return "";
  if (!title) return stored;
  const prefix = `${title}\n\n`;
  if (stored.startsWith(prefix)) {
    return stored.slice(prefix.length);
  }
  return stored;
}
