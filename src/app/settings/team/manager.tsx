"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2, Loader2, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Role } from "@/db/schema";
import {
  cancelInvite,
  changeRole,
  inviteMember,
  setActive,
  setClientAccess,
} from "./actions";

const ROLES: { value: Role; label: string; blurb: string }[] = [
  {
    value: "owner",
    label: "Owner",
    blurb: "Everything, including the team and integration keys.",
  },
  {
    value: "manager",
    label: "Manager",
    blurb: "All clients and all work. Can't change the team or API keys.",
  },
  {
    value: "member",
    label: "Member",
    blurb: "Only assigned clients. Does the work, not the admin.",
  },
  {
    value: "viewer",
    label: "Client viewer",
    blurb: "Read-only on assigned clients. For a client contact.",
  },
];

type UserRow = {
  id: number;
  name: string | null;
  email: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
};

export function TeamManager({
  me,
  users,
  clients,
  assignments,
  invites,
}: {
  me: { id: number; role: Role } | null;
  users: UserRow[];
  clients: { id: number; name: string }[];
  assignments: { userId: number; clientId: number }[];
  invites: { id: number; email: string; role: Role; expiresInDays: number }[];
}) {
  const isOwner = me?.role === "owner";
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/30">
          {error}
        </div>
      )}

      {isOwner && <InviteCard onError={setError} />}

      {invites.length > 0 && isOwner && (
        <section className="glass-apple rounded-xl p-4">
          <h2 className="text-sm font-medium">Waiting to be accepted</h2>
          <ul className="mt-3 space-y-2">
            {invites.map((i) => (
              <InviteRow key={i.id} invite={i} onError={setError} />
            ))}
          </ul>
        </section>
      )}

      <section className="glass-apple rounded-xl p-4">
        <h2 className="text-sm font-medium">People</h2>
        <ul className="mt-3 divide-y divide-white/5">
          {users.map((u) => (
            <PersonRow
              key={u.id}
              user={u}
              isMe={u.id === me?.id}
              canManage={isOwner}
              clients={clients}
              assigned={assignments
                .filter((a) => a.userId === u.id)
                .map((a) => a.clientId)}
              onError={setError}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function InviteCard({ onError }: { onError: (e: string | null) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="glass-apple rounded-xl p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <UserPlus className="size-4" /> Invite someone
      </h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="invite-email">Their email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="rahul@agency.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-9 rounded-md border border-white/10 bg-white/5 px-2 text-sm"
          >
            {ROLES.filter((r) => r.value !== "owner").map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          disabled={pending || !email}
          onClick={() =>
            start(async () => {
              onError(null);
              setLink(null);
              const res = await inviteMember({ email, role });
              if (!res.ok) {
                onError(res.error);
                return;
              }
              setLink(res.link ?? null);
              setEmail("");
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Create link"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {ROLES.find((r) => r.value === role)?.blurb}
      </p>

      {link && <CopyableLink path={link} />}
    </section>
  );
}

/**
 * We show the link rather than emailing it. Sending mail would mean SMTP
 * setup before a second person can join a self-hosted tool — a
 * configuration step standing between the user and the feature, which is
 * exactly the pattern this project avoids. Paste it into Slack instead.
 */
function CopyableLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const full =
    typeof window === "undefined" ? path : `${window.location.origin}${path}`;

  return (
    <div className="mt-3 rounded-md bg-emerald-500/10 p-3 ring-1 ring-emerald-500/25">
      <p className="flex items-center gap-2 text-xs font-medium text-emerald-300">
        <Link2 className="size-3.5" /> Send them this link — it works once and
        expires in seven days.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-black/20 px-2 py-1.5 text-xs">
          {full}
        </code>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(full);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function InviteRow({
  invite,
  onError,
}: {
  invite: { id: number; email: string; role: Role; expiresInDays: number };
  onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  // Computed on the server and passed in: reading the clock during
  // render makes the component non-idempotent, and this one is rendered
  // on the server first, so it would also hydrate against a different
  // number than it printed.
  const days = invite.expiresInDays;

  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0 truncate">
        {invite.email}{" "}
        <span className="text-muted-foreground">
          · {ROLES.find((r) => r.value === invite.role)?.label} · expires in{" "}
          {days} day{days === 1 ? "" : "s"}
        </span>
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await cancelInvite(invite.id);
            if (!res.ok) onError(res.error);
          })
        }
      >
        <Trash2 className="size-3.5" /> Cancel
      </Button>
    </li>
  );
}

function PersonRow({
  user,
  isMe,
  canManage,
  clients,
  assigned,
  onError,
}: {
  user: UserRow;
  isMe: boolean;
  canManage: boolean;
  clients: { id: number; name: string }[];
  assigned: number[];
  onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number[]>(assigned);
  const scoped = user.role === "member" || user.role === "viewer";

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {user.name || user.email}
            {isMe && <span className="text-muted-foreground"> (you)</span>}
            {!user.active && (
              <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                deactivated
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {user.email}
            {user.lastLoginAt
              ? ` · last signed in ${new Date(user.lastLoginAt).toLocaleDateString()}`
              : " · never signed in"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManage ? (
            <select
              value={user.role}
              disabled={pending}
              onChange={(e) =>
                start(async () => {
                  onError(null);
                  const res = await changeRole(user.id, e.target.value as Role);
                  if (!res.ok) onError(res.error);
                })
              }
              className="h-8 rounded-md border border-white/10 bg-white/5 px-2 text-xs"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-muted-foreground">
              {ROLES.find((r) => r.value === user.role)?.label}
            </span>
          )}

          {canManage && scoped && (
            <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
              {assigned.length} client{assigned.length === 1 ? "" : "s"}
            </Button>
          )}

          {canManage && !isMe && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  onError(null);
                  const res = await setActive(user.id, !user.active);
                  if (!res.ok) onError(res.error);
                })
              }
            >
              {user.active ? "Deactivate" : "Reactivate"}
            </Button>
          )}
        </div>
      </div>

      {open && scoped && (
        <div className="mt-3 rounded-md bg-white/5 p-3">
          <p className="text-xs text-muted-foreground">
            {user.name || user.email} sees only the clients ticked here.
            Everything else in the app is filtered to match — dashboard,
            tasks, reports, keywords.
          </p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {clients.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No clients yet — add one first.
              </p>
            )}
            {clients.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(c.id)}
                  onChange={(e) =>
                    setPicked((prev) =>
                      e.target.checked
                        ? [...prev, c.id]
                        : prev.filter((id) => id !== c.id),
                    )
                  }
                />
                <span className="truncate">{c.name}</span>
              </label>
            ))}
          </div>
          <Button
            size="sm"
            className="mt-3"
            disabled={pending}
            onClick={() =>
              start(async () => {
                onError(null);
                const res = await setClientAccess(user.id, picked);
                if (!res.ok) onError(res.error);
                else setOpen(false);
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Save access"}
          </Button>
        </div>
      )}
    </li>
  );
}
