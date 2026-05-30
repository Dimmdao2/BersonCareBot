import { createHash } from "node:crypto";

/** Stable integrator id for repeated doctor reply submits (P19). */
export function buildWebappProgramNoteReplyIntegratorMessageId(input: {
  doctorUserId: string;
  instanceId: string;
  stageItemId: string;
  text: string;
}): string {
  const digest = createHash("sha256")
    .update(
      `${input.doctorUserId}\0${input.instanceId}\0${input.stageItemId}\0${input.text.trim()}`,
    )
    .digest("hex")
    .slice(0, 32);
  return `webapp-program-note:${digest}`;
}
