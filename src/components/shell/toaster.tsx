"use client";

/**
 * Sonner toast container, themed to match the Linear-style shell. Mounted
 * once in the root layout. To raise a toast from any client component:
 *
 *   import { toast } from "sonner";
 *   toast.success("Saved");
 *   toast.error("Network error");
 *   toast.message("Audit started", { description: "Running 30 checks" });
 */

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      theme="dark"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "rounded-md border border-border bg-popover text-foreground text-[13px] shadow-lg",
          title: "font-medium",
          description: "text-muted-foreground text-[12px]",
        },
      }}
    />
  );
}
