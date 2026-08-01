import Link from "next/link";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth";
import { findInvite } from "@/lib/invites";
import { AccountForm } from "@/app/register/account-form";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = findInvite(token);

  if (!invite) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-apple-strong w-full max-w-sm rounded-2xl p-6 text-center">
          <h1 className="text-lg font-semibold">This invite has expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Invite links last seven days, and each one can only be used once.
            Ask whoever sent it to generate a new one.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block text-sm underline underline-offset-2"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AccountForm
      token={token}
      lockedEmail={invite.email}
      heading={`Join as ${ROLE_LABELS[invite.role].toLowerCase()}`}
      subheading={ROLE_DESCRIPTIONS[invite.role]}
      cta="Create my account"
    />
  );
}
