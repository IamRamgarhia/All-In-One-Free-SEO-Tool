import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Pencil } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { NewClientForm } from "../../new/new-client-form";

export const dynamic = "force-dynamic";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isFinite(clientId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const social = client.socialLinks ?? {};

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/clients/${client.id}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        Back to {client.name}
      </Link>

      <PageHeader
        title="Edit client"
        description="Update any field. Changes save instantly. Use the auto-fill button to refresh from the live site."
        icon={Pencil}
        accent="violet"
        crumbs={[
          { label: "Clients", href: "/clients" },
          { label: client.name, href: `/clients/${client.id}` },
          { label: "Edit" },
        ]}
      />

      <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-16 -top-16 size-48 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="relative p-6">
          <NewClientForm
            mode="update"
            clientId={client.id}
            initialUrl={client.url}
            initialName={client.name}
            initialFields={{
              name: client.name,
              url: client.url,
              description: client.description ?? "",
              logoUrl: client.logoUrl ?? "",
              address: client.address ?? "",
              phone: client.phone ?? "",
              email: client.email ?? "",
              gbpUrl: client.gbpUrl ?? "",
              facebook: social.facebook ?? "",
              twitter: social.twitter ?? "",
              instagram: social.instagram ?? "",
              linkedin: social.linkedin ?? "",
              youtube: social.youtube ?? "",
              tiktok: social.tiktok ?? "",
            }}
          />
        </div>
      </div>
    </div>
  );
}
