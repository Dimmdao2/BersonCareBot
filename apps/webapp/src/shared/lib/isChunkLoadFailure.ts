function messageLooksLikeChunkFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('failed to load chunk') ||
    m.includes('loading chunk') ||
    m.includes('chunkloaderror') ||
    m.includes('dynamically imported module') ||
    m.includes('importing a module script failed') ||
    m.includes('error loading dynamically imported module') ||
    m.includes('failed to fetch dynamically imported module')
  );
}

/**
 * A stale tab (open across a redeploy) references chunk hashes the new build no longer serves (404).
 * Detected so the error boundary can silently reload once instead of showing a scary error screen.
 */
export function isChunkLoadFailure(error: Error): boolean {
  const n = (error.name || '').toLowerCase();
  if (n.includes('chunkload')) return true;
  if (messageLooksLikeChunkFailure(error.message)) return true;
  const c = error.cause;
  if (c instanceof Error) {
    const cn = (c.name || '').toLowerCase();
    if (cn.includes('chunkload')) return true;
    if (messageLooksLikeChunkFailure(c.message)) return true;
  }
  return false;
}
