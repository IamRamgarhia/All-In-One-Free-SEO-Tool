import { Plus } from "lucide-react";
import { headers } from "next/headers";
import { PageHeader } from "@/components/shell/page-header";
import { NewClientForm } from "./new-client-form";
import { getGoogleConnectionStatus } from "@/lib/google-oauth";
import { getSetting } from "@/lib/settings-store";

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; name?: string }>;
}) {
  const { url, name } = await searchParams;
  const googleStatus = await getGoogleConnectionStatus();
  const googleClientId = await getSetting<string>("google.client_id");
  const googleClientSecret = await getSetting<string>("google.client_secret");
  const hdrs = await headers();
  const host =
    hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const redirectUri = `${proto}://${host}/api/google/callback`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Add a client"
        description="Just the basics for now — we'll detect the tech stack and generate niche-specific tasks automatically."
        icon={Plus}
        accent="violet"
        crumbs={[{ label: "Clients", href: "/clients" }, { label: "New" }]}
      />

      <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-16 -top-16 size-48 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 -bottom-16 size-48 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative p-6">
          <NewClientForm
            initialUrl={url}
            initialName={name}
            googleStatus={googleStatus}
            googleClientId={googleClientId}
            googleHasSecret={Boolean(googleClientSecret)}
            googleRedirectUri={redirectUri}
          />
        </div>
      </div>
    </div>
  );
}
