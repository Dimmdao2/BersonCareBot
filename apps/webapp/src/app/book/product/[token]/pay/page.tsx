import { redirect } from "next/navigation";
import { PublicProductPayClient } from "./PublicProductPayClient";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ purchaseId?: string; phone?: string }>;
};

export default async function PublicProductPayPage({ searchParams }: Props) {
  const { purchaseId, phone } = await searchParams;
  if (!purchaseId?.trim() || !phone?.trim()) {
    redirect("/book");
  }
  return (
    <PublicProductPayClient purchaseId={purchaseId.trim()} contactPhone={phone.trim()} />
  );
}
