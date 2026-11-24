export const dynamic = "force-dynamic";

// @ai-partial: see app/content/actions.ts.

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PenLine } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AskAiButton } from "@/components/ask-ai-button";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { AiRequiredNotice } from "@/components/ui/ai-required-notice";
import { canEdit, currentUser } from "@/lib/auth";
import { getPost } from "@/lib/content-studio/store";
import { outlineToText } from "@/lib/content-studio/outline-text";
import { ArticleStudio } from "./article-studio";
import { ReviewLink } from "./review-link";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ clientId: string; postId: string }>;
}) {
  const { clientId: rawClient, postId: rawPost } = await params;
  const clientId = Number(rawClient);
  const postId = Number(rawPost);
  if (!Number.isFinite(clientId) || !Number.isFinite(postId)) notFound();

  const [[client], post, t, me] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        wpEndpoint: clients.wpEndpoint,
        wpKey: clients.wpKey,
        shareToken: clients.shareToken,
      })
      .from(clients).where(eq(clients.id, clientId)).limit(1),
    getPost(clientId, postId),
    getTranslations("content"),
    currentUser(),
  ]);
  if (!client || !post) notFound();
  const editable = !me || canEdit(me.role);
  const tAsk = await getTranslations("askAi");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={post.title || post.primaryKeyword || t("untitled")}
        description={t("articleDescription", { keyword: post.primaryKeyword ?? "" })}
        icon={PenLine}
        accent="violet"
        crumbs={[
          { label: t("title"), href: "/content" },
          { label: client.name, href: `/content/c/${client.id}` },
        ]}
        actions={
          <AskAiButton
            clientId={client.id}
            question={tAsk("article")}
            context={tAsk("articleContext", {
              title: post.title ?? "",
              keyword: post.primaryKeyword ?? "",
              start: (post.draftMarkdown ?? "").slice(0, 1500),
            })}
          />
        }
      />
      {editable && <AiRequiredNotice because={t("aiBecause")} />}
      {editable && (
        <ReviewLink
          clientId={client.id}
          postId={post.id}
          hasDraft={Boolean(post.draftMarkdown?.trim())}
          initialPath={
            post.reviewSharedAt && client.shareToken ? `/portal/${client.shareToken}/articles/${post.id}` : null
          }
          sharedAt={post.reviewSharedAt?.toISOString() ?? null}
          decision={post.clientDecision ?? null}
          comment={post.clientComment ?? null}
          decidedAt={post.clientDecidedAt?.toISOString() ?? null}
        />
      )}
      <ArticleStudio
        clientId={client.id}
        postId={post.id}
        editable={editable}
        status={post.status}
        wpConnected={Boolean(client.wpEndpoint && client.wpKey)}
        distribution={{
          schemaJsonLd: post.schemaJsonLd ?? "",
          social: post.social ?? null,
          newsletter: post.newsletter ?? null,
          publishedUrl: post.publishedUrl ?? "",
        }}
        initial={{
          title: post.title ?? "",
          outlineText: post.outline ? outlineToText(post.outline) : "",
          draftMarkdown: post.draftMarkdown ?? "",
          metaTitle: post.metaTitle ?? "",
          metaDescription: post.metaDescription ?? "",
        }}
      />
    </div>
  );
}
