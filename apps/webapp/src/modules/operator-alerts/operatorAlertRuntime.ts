import type { OperatorAlertDedupPort } from "./ports";

let dedupPort: OperatorAlertDedupPort | null = null;

export function registerOperatorAlertDedupPort(next: OperatorAlertDedupPort): void {
  dedupPort = next;
}

export function getOperatorAlertDedupPort(): OperatorAlertDedupPort | null {
  return dedupPort;
}
