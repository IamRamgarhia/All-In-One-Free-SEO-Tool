import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { proposals } from "@/db/schema";
import { canSeeClient, currentUser } from "@/lib/auth";
import { generateProposalPdf } from "@/lib/proposal-pdf";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId)) {
    return new Response("Not found", { status: 404 });
  }

  const [row] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  // Same answer for missing and forbidden — a 403 on a proposal id
  // confirms the proposal exists.
  if (!row) return new Response("Not found", { status: 404 });
  if (row.clientId && !(await canSeeClient(await currentUser(), row.clientId))) {
    return new Response("Not found", { status: 404 });
  }

  const pdf = await generateProposalPdf({
    prospectName: row.prospectName,
    prospectUrl: row.prospectUrl,
    title: row.title,
    intro: row.intro,
    scope: row.scopeJson ?? [],
    pricing: row.pricingJson ?? [],
    currency: row.currency,
    terms: row.terms,
    basedOnScore: row.basedOnScore,
    basedOnAt: row.basedOnAt,
  });

  const filename = `${slug(row.prospectName)}-proposal.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      // inline, not attachment: people want to read it before sending it.
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "proposal"
  );
}
