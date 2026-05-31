import {
  uploadProgramSubmissionMedia,
  waitForProgramSubmissionMediaReady,
} from "@/app/app/patient/treatment/uploadProgramSubmissionMedia";
import { attachProgramItemDiscussionMedia } from "@/app/app/patient/treatment/attachProgramItemDiscussionMedia";

export async function uploadProgramSubmissionToDiscussion(params: {
  instanceId: string;
  itemId: string;
  file: File;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const uploaded = await uploadProgramSubmissionMedia(params.file);
  if (!uploaded.ok) {
    return { ok: false, error: uploaded.error };
  }
  if (uploaded.isVideo) {
    const ready = await waitForProgramSubmissionMediaReady(uploaded.mediaId);
    if (!ready) {
      return { ok: false, error: "video_processing_timeout" };
    }
  }
  const attached = await attachProgramItemDiscussionMedia({
    instanceId: params.instanceId,
    itemId: params.itemId,
    mediaFileId: uploaded.mediaId,
  });
  if (!attached.ok) {
    return { ok: false, error: attached.error };
  }
  return { ok: true };
}
