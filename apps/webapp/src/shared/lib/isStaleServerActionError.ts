export function isStaleServerActionError(error: Error): boolean {
  const message = `${error.message || ""}`.toLowerCase();
  if (message.includes("failed to find server action")) {
    return true;
  }

  const cause = error.cause;
  if (cause instanceof Error) {
    const causeMessage = `${cause.message || ""}`.toLowerCase();
    if (causeMessage.includes("failed to find server action")) {
      return true;
    }
  }

  return false;
}
