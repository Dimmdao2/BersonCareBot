import { notFound } from "next/navigation";
import { z } from "zod";
import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { readPatientInviteContinuationCookie } from "@/modules/patient-invites/continuationCookie";
import { JoinPatientClient } from "./JoinPatientClient";

type PageProps = { params: Promise<{ continuation: string }> };

export default async function JoinContinuationPage({ params }: PageProps) {
  const { continuation } = await params;
  if (!z.string().min(32).max(256).safeParse(continuation).success) notFound();
  const cookieContinuation = await readPatientInviteContinuationCookie();
  if (cookieContinuation !== continuation) {
    return <JoinPatientClient preview={null} />;
  }
  stampBootstrapPrincipal("join/[continuation]:page");
  const result = await buildAppDeps().patientInvites.lookupContinuation(continuation);
  return <JoinPatientClient preview={result.ok ? result.preview : null} />;
}
