"use client";

import { useState } from "react";
import { ClientToolsSidebar } from "./client-tools-sidebar";
import { ClientToolDrawer } from "./client-tool-drawer";
import type { ClientToolsClient } from "./client-tools-launcher";
import type { SurfaceId } from "@/lib/engagement-surfaces";

export type OpenToolState = { url: string; title: string };

/**
 * Coordinator client component that bundles the per-client tools sidebar
 * with the slide-over tool drawer. Clicks in the sidebar open the drawer
 * instead of navigating away from the client canvas.
 *
 * Middle-click / Cmd-click / Ctrl-click / Shift-click on a tool still
 * follows the link to the standalone tool page — preserves the user's
 * ability to fan out into multiple browser tabs when they want to.
 */
export function ClientToolsPanel({
  client,
  hasAiKey = false,
  surfaces,
}: {
  client: ClientToolsClient;
  /** The engagement's agreed scope, which orders the rail. */
  surfaces?: SurfaceId[];
  /**
   * Passed straight through to the rail so its dots can tell ready from
   * blocked. Read server-side on the client page; a connected chat
   * subscription is not a key and does not count.
   */
  hasAiKey?: boolean;
}) {
  const [openTool, setOpenTool] = useState<OpenToolState | null>(null);

  return (
    <>
      <ClientToolsSidebar
        client={client}
        hasAiKey={hasAiKey}
        surfaces={surfaces}
        onOpenTool={(t) => setOpenTool(t)}
      />
      {openTool && (
        <ClientToolDrawer
          url={openTool.url}
          title={openTool.title}
          onClose={() => setOpenTool(null)}
        />
      )}
    </>
  );
}
