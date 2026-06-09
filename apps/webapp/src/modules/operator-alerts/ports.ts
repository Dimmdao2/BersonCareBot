import type { OperatorAlertBlock } from "./operatorHealthAlertConfig";

export type OperatorAlertDedupPort = {
  wasSentWithinHours(dedupKey: string, hours: number): Promise<boolean>;
  recordSent(input: { dedupKey: string; severity: OperatorAlertBlock }): Promise<void>;
};
