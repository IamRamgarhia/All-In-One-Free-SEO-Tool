export const dynamic = "force-dynamic";

import Link from "next/link";
import { asc } from "drizzle-orm";
import { Users2 } from "lucide-react";
import { db } from "@/db/client";
import { clientMembers, clients, users } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { accountsEnabled, canManageTeam, currentUser } from "@/lib/auth";
import { pendingInvites } from "@/lib/invites";
import { TeamManager } from "./manager";

export default async function TeamPage() {
  const me = await currentUser();

  // Accounts are opt-in, so this page has a job to do before there is a
  // team: explain what turning them on gets you, and offer the switch.
  if (!accountsEnabled()) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Team"
          description="Give everyone their own login instead of sharing one password."
          icon={Users2}
          crumbs={[{ href: "/settings", label: "Settings" }, { label: "Team" }]}
        />
        <div className="glass-apple rounded-xl p-6">
          <p className="text-sm text-muted-foreground">
            This instance is in single-password mode. That&apos;s fine for one
            person — but if more than one of you uses it, accounts are worth
            the two minutes:
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            <li>· Each person signs in as themselves, with their own password</li>
            <li>· Assign clients so people only see the ones they work on</li>
            <li>· Task and activity history says who actually did the work</li>
            <li>· Removing someone removes their access, not everyone&apos;s</li>
          </ul>
          <p className="mt-4 text-sm">
            <Link
              href="/register"
              className="font-medium underline underline-offset-4"
            >
              Set up accounts
            </Link>{" "}
            <span className="text-muted-foreground">
              — you&apos;ll become the owner and can invite the rest of your team.
            </span>
          </p>
        </div>
      </div>
    );
  }

  const allUsers = db.select().from(users).orderBy(asc(users.id)).all();
  const allClients = db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .orderBy(asc(clients.name))
    .all();
  const assignments = db.select().from(clientMembers).all();
  const invites = pendingInvites();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description={
          canManageTeam(me?.role ?? "member")
            ? "Invite people, set what they can see, and hand over ownership."
            : "Who's on this instance and what they can see."
        }
        icon={Users2}
        crumbs={[{ href: "/settings", label: "Settings" }, { label: "Team" }]}
      />
      <TeamManager
        me={me ? { id: me.id, role: me.role } : null}
        users={allUsers.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          active: u.active,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        }))}
        clients={allClients}
        assignments={assignments.map((a) => ({
          userId: a.userId,
          clientId: a.clientId,
        }))}
        invites={invites}
      />
    </div>
  );
}
