"use client";

import { useEffect } from "react";
import { clearReferenceCache } from "@/modules/references/referenceCache";

type ReferenceCacheBusterProps = {
  categoryCode: string;
};

export function ReferenceCacheBuster({ categoryCode }: ReferenceCacheBusterProps) {
  useEffect(() => {
    clearReferenceCache(categoryCode);
  }, [categoryCode]);

  return null;
}
