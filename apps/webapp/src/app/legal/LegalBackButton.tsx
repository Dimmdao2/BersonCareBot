"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/shared/ui/patient/primitives/button-variants";
import { cn } from "@/lib/utils";

/** Возвращает назад если пришли изнутри сайта, иначе — на лендинг. */
export function LegalBackButton() {
  const router = useRouter();

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const fromSameSite =
      typeof document !== "undefined" &&
      document.referrer &&
      new URL(document.referrer, window.location.href).origin === window.location.origin;
    if (fromSameSite) {
      router.back();
    } else {
      router.push("/");
    }
  }

  return (
    <Link
      href="/"
      onClick={handleClick}
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 shrink-0")}
    >
      ← Назад
    </Link>
  );
}
