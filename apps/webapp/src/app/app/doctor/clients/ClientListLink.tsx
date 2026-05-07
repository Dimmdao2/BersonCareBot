"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const DEFAULT_BASE = "/app/doctor/clients";

type ClientListLinkProps = {
  userId: string;
  /** Базовый путь списка: `/app/doctor/clients` или `/app/doctor/subscribers`. */
  basePath?: string;
  searchParams: { q?: string; telegram?: string; max?: string; appointment?: string; treatmentProgram?: string };
  children: React.ReactNode;
};

export function ClientListLink({ userId, basePath = DEFAULT_BASE, searchParams, children }: ClientListLinkProps) {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent) => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      e.preventDefault();
      const params = new URLSearchParams();
      if (searchParams.q) params.set("q", searchParams.q);
      if (searchParams.telegram === "1") params.set("telegram", "1");
      if (searchParams.max === "1") params.set("max", "1");
      if (searchParams.appointment === "1") params.set("appointment", "1");
      if (searchParams.treatmentProgram === "1") params.set("treatmentProgram", "1");
      params.set("selected", userId);
      router.push(`${basePath}?${params.toString()}`);
    }
  };

  return (
    <Link href={`${basePath}/${userId}`} onClick={handleClick} className="font-semibold">
      {children}
    </Link>
  );
}
