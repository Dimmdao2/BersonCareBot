"use server";

import { revalidatePath } from "next/cache";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

export async function toggleSubscriptionChannel(
  subscriptionId: string,
  channelCode: string,
  enabled: boolean,
) {
  await requirePatientAccess(routePaths.notifications);
  // TODO: replace with real reminder rules persistence once backend API is ready.
  void subscriptionId;
  void channelCode;
  void enabled;
  revalidatePath(routePaths.notifications);
}
