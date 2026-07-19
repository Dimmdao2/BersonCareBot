import { InviteAcceptClient } from "./InviteAcceptClient";

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ClinicInviteAcceptPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  return <InviteAcceptClient token={typeof token === "string" ? token : ""} />;
}
