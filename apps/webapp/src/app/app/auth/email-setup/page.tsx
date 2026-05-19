import { Suspense } from "react";
import EmailSetupPageClient from "./EmailSetupPageClient";

type Props = { searchParams: Promise<{ token?: string }> };

export default async function EmailSetupPage({ searchParams }: Props) {
  const { token } = await searchParams;
  return (
    <Suspense fallback={null}>
      <EmailSetupPageClient initialToken={token?.trim() ?? ""} />
    </Suspense>
  );
}
