import type {
  EmailSetupAccessPort,
  RequestContactEmailSetupParams,
} from "@/modules/auth/emailSetupAccess/ports";

export type ContactEmailSetupEnqueueContext = {
  hook: string;
};

function isEnqueueSuccess(
  result: Awaited<ReturnType<EmailSetupAccessPort["requestContactEmailSetup"]>>,
): boolean {
  return (
    result.ok &&
    (result.status === "enqueued" || result.status === "stub_pending_phase3")
  );
}

/** Awaitable enqueue with structured logs on failure (ops visibility for PHASE_02 hooks). */
export async function runContactEmailSetupEnqueue(
  emailSetupAccess: Pick<EmailSetupAccessPort, "requestContactEmailSetup">,
  params: RequestContactEmailSetupParams,
  context: ContactEmailSetupEnqueueContext,
): Promise<void> {
  try {
    const result = await emailSetupAccess.requestContactEmailSetup(params);
    if (!isEnqueueSuccess(result)) {
      console.warn("[emailSetupAccess:enqueue_failed]", {
        hook: context.hook,
        userId: params.userId,
        source: params.source,
        reason: result.ok ? "unexpected_status" : result.reason,
        status: result.ok ? result.status : undefined,
      });
    }
  } catch (err) {
    console.error("[emailSetupAccess:enqueue_error]", {
      hook: context.hook,
      userId: params.userId,
      source: params.source,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export function fireAndForgetContactEmailSetup(
  emailSetupAccess: Pick<EmailSetupAccessPort, "requestContactEmailSetup">,
  params: RequestContactEmailSetupParams,
  context: ContactEmailSetupEnqueueContext,
): void {
  void runContactEmailSetupEnqueue(emailSetupAccess, params, context);
}
