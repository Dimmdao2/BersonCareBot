import { NextResponse } from "next/server";
import { env, isS3MediaEnabled } from "@/config/env";

/** Public capability for CMS client: whether direct-to-S3 multipart is available. */
export async function GET() {
  return NextResponse.json({
    ok: true as const,
    s3Multipart: isS3MediaEnabled(env),
  });
}
