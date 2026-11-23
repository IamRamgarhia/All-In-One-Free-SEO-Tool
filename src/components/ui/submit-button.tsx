"use client";

/**
 * Drop-in replacement for <Button type="submit"> inside a <form action={...}>.
 * Uses React 19's useFormStatus to flip into a "loading" state automatically
 * while the server action is in flight — no manual useState plumbing needed
 * in the parent.
 *
 * Without this, users click Run audit / Refresh / Save and see nothing
 * happen for 5-30 seconds (the request is running, but the UI looks
 * frozen). This swaps the icon for a spinner + disables the button +
 * fires a sonner toast so feedback is immediate.
 */

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./button";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost" | "destructive" | "secondary";

type Props = {
  /** Label shown when idle */
  children: React.ReactNode;
  /** Label shown while the action is running. Default: same as children + " …" */
  pendingChildren?: React.ReactNode;
  /**
   * Optional icon shown when idle. Must be a JSX element (not a component
   * constructor) — React Server Components can't serialize functions
   * across the boundary. Use:
   *   <SubmitButton icon={<Play className="size-3.5" />}>
   * NOT:
   *   <SubmitButton icon={Play}>  // ❌ crashes the page
   */
  icon?: React.ReactNode;
  /** Optional toast title fired the moment the action starts */
  pendingToast?: string;
  /** Toast description */
  pendingToastDescription?: string;
  variant?: Variant;
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  title?: string;
};

export function SubmitButton({
  children,
  pendingChildren,
  icon,
  pendingToast,
  pendingToastDescription,
  variant,
  size,
  className,
  title,
}: Props) {
  const { pending } = useFormStatus();

  // Fire a toast the moment pending flips true — so the user gets
  // immediate confirmation even before any UI repaint.
  useEffect(() => {
    if (pending && pendingToast) {
      toast.loading(pendingToast, {
        description: pendingToastDescription,
        id: `submit-${pendingToast}`,
      });
    }
    if (!pending && pendingToast) {
      // Dismiss the loading toast — success/failure toasts come from the
      // server action's revalidation, or the caller can fire one manually.
      toast.dismiss(`submit-${pendingToast}`);
    }
  }, [pending, pendingToast, pendingToastDescription]);

  // An action that ends with a redirect (the full audit opens its result
  // page) unmounts this button while it is still pending: "pending" never
  // flips back, and the loading toast stayed on screen for good. Dismiss it
  // when the button goes away too.
  useEffect(() => {
    if (!pendingToast) return;
    const id = `submit-${pendingToast}`;
    return () => {
      toast.dismiss(id);
    };
  }, [pendingToast]);

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      title={title}
      className={cn(pending && "cursor-wait", className)}
    >
      {pending ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          {pendingChildren ?? <>{children}…</>}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </Button>
  );
}
