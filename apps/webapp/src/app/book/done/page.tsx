import Link from "next/link";
import { publicBookPaths } from "@/shared/publicBook/paths";
import { PublicBookingShell } from "../PublicBookingShell";

export default function PublicBookDonePage() {
  return (
    <PublicBookingShell title="Запись создана" step={4} totalSteps={4} backHref={null}>
      <p className="text-sm">Мы получили вашу заявку. При необходимости с вами свяжутся по указанному телефону.</p>
      <Link href={publicBookPaths.new} className="text-sm font-medium text-primary underline-offset-2 hover:underline">
        Новая запись
      </Link>
    </PublicBookingShell>
  );
}
