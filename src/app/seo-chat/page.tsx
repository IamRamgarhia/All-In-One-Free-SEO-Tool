export const dynamic = "force-dynamic";

import { Bot } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { SeoChatUi } from "./chat-ui";

export default function SeoChatPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="SEO Chat"
        description="One chat for every SEO topic. Ask anything — the AI auto-focuses on the right specialty (technical, on-page, AI visibility, schema, local, hreflang, CWV, and 20+ more). Drop an image for image-SEO analysis."
        icon={Bot}
        accent="violet"
      />
      <SeoChatUi />
    </div>
  );
}
