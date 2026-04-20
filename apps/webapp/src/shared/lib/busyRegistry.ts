declare global {
  interface Window {
    __bcbBusy?: Set<string>;
  }
}

function getRegistry(): Set<string> {
  if (typeof window === "undefined") {
    return new Set<string>();
  }
  if (!window.__bcbBusy) {
    window.__bcbBusy = new Set<string>();
  }
  return window.__bcbBusy;
}

export function beginBusy(id: string): void {
  if (!id || typeof window === "undefined") return;
  getRegistry().add(id);
}

export function endBusy(id: string): void {
  if (!id || typeof window === "undefined") return;
  getRegistry().delete(id);
}

export function hasBusyOperations(): boolean {
  if (typeof window === "undefined") return false;
  return getRegistry().size > 0;
}
