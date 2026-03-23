"use client";

import { Toaster } from "react-hot-toast";

export function ClientToaster() {
  return <Toaster position="top-center" toastOptions={{ duration: 3000 }} />;
}
