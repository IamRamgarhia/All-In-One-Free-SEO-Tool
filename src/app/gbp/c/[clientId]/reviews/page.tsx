/**
 * @ai-partial
 *
 * A model drafts replies, and nothing else here needs one. Pulling
 * reviews, seeing which are unanswered, typing a reply and sending it
 * all work with no AI configured at all — so declaring this "required"
 * would tell a user with no key that a page they can fully use is shut
 * to them.
 */
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { loadReviewDesk } from "./actions";
import { ReviewDesk } from "./review-desk";
import { LocationPicker } from "./location-picker";

export default async function ReviewDeskPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: cidStr } = await params;
  const clientId = Number(cidStr);
  if (!Number.isFinite(clientId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const initial = await loadReviewDesk(clientId);

  return (
    <div className="space-y-6">
      <Link
        href={`/gbp/c/${clientId}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        Business profile
      </Link>

      <PageHeader
        title={`Reviews · ${client.name}`}
        description="Every review, which ones still need an answer, and the replies — drafted here, sent to Google when you say so."
        icon={MessageSquare}
        accent="cyan"
      />

      {/* Which listing this client is. Resolving "first account, first
          location" on every call is right for one business with one
          listing and quietly wrong for anyone with two. */}
      <LocationPicker clientId={clientId} selected={initial.locationName} />

      {initial.locationName ? (
        <ReviewDesk clientId={clientId} initial={initial} />
      ) : (
        <p className="rounded-xl bg-white/[0.02] px-5 py-8 text-center text-sm text-muted-foreground">
          Pick the Business Profile listing above, then pull the reviews.
        </p>
      )}
    </div>
  );
}
