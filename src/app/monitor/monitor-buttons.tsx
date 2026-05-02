"use client";

import { useTransition } from "react";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  checkPageChanges,
  checkAllMonitoredPages,
} from "./actions";

export function CheckPageButton({ pageId }: { pageId: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      className="h-7 border-white/10 bg-white/5 px-2"
      onClick={() => startTransition(() => checkPageChanges(pageId))}
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Activity className="size-3" />
      )}
      {pending ? "…" : "Check now"}
    </Button>
  );
}

export function CheckAllPagesButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      className="shadow-lg shadow-fuchsia-500/25 ring-1 ring-inset ring-white/15"
      onClick={() => startTransition(() => checkAllMonitoredPages())}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <RefreshCw className="size-4" />
      )}
      {pending ? "Checking all…" : "Check all pages"}
    </Button>
  );
}
