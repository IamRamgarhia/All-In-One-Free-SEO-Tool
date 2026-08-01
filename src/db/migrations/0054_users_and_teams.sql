-- Multi-user support, so an agency can actually deploy this to a team.
--
-- Until now the only auth was a single shared APP_PASSWORD: one login
-- for everybody, no accounts, no roles, no way to see who did what. A
-- four-person agency — the stated target user — could not use the tool
-- as a team at all.
--
-- Deliberately multi-USER, not multi-TENANT. Self-hosted means one
-- install = one agency, so there is no need to scope every query by
-- workspace (CLAUDE.md Part 11 describes multi-tenancy for a SaaS that
-- was never built; following it here would touch 63 tables and 226
-- routes for zero user benefit). What is needed is several people
-- sharing one workspace with different permissions.
--
-- Solo installs are unaffected: with zero rows in `users`, the app keeps
-- its existing APP_PASSWORD / open-local behaviour. Accounts are opt-in.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  -- scrypt, salted per user. See src/lib/auth.ts.
  password_hash TEXT NOT NULL,
  name TEXT,
  -- owner   — full control incl. team management and settings
  -- manager — all clients, cannot manage the team or destructive settings
  -- member  — only clients explicitly assigned to them
  -- viewer  — read-only across assigned clients (for a client contact)
  role TEXT NOT NULL DEFAULT 'member',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
--> statement-breakpoint

-- Case-insensitive uniqueness: "Priya@x.com" and "priya@x.com" must not
-- be two accounts. Emails are lowercased on write as well; the index is
-- the backstop.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));
--> statement-breakpoint

-- Which clients a `member` may see. Owners and managers see everything
-- and need no rows here.
CREATE TABLE IF NOT EXISTS client_members (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, client_id)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS client_members_user ON client_members (user_id);
--> statement-breakpoint

-- Pending invitations. A token, not a password — the invitee sets their
-- own on first use, so no one else ever knows it.
CREATE TABLE IF NOT EXISTS user_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL,
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS user_invites_token ON user_invites (token_hash);
--> statement-breakpoint

-- Attribution. Nullable throughout: every existing row predates accounts
-- and genuinely has no author, and solo installs never populate it.
-- Without this, /capacity ("who is overbooked") and the activity log are
-- measuring nothing — there was no concept of a person to attribute to.
ALTER TABLE tasks ADD COLUMN assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN completed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE activity_log ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE tool_runs ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
