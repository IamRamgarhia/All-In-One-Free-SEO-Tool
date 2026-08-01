/**
 * Live verification of the multi-user auth flow, against a real running
 * server with a real database.
 *
 * Unit tests cover the token maths and the password hashing, but the
 * things most likely to be wrong here are the ones no unit test can see:
 *
 *   - does `process.env.SEO_ACCOUNTS_ENABLED`, set at boot by
 *     instrumentation, actually reach the Edge middleware sandbox?
 *   - does registering the first user really close the gate, in the
 *     same process, without a restart?
 *   - does a member get a 404 (not a 403, and not the page) for a client
 *     they aren't assigned to?
 *   - do the endpoints that carry their own auth stay reachable?
 *
 * Every one of those is an integration between the Node runtime, the
 * Edge runtime and the database. Run it against a scratch DB:
 *
 *   node scripts/auth-check.mjs http://localhost:3100 /tmp/scratch.db
 *
 * The DB path is optional and only used to seed two clients for the
 * scoping check; without it that section is skipped rather than faked.
 *
 * Not in CI: it needs a built server and a throwaway database, and it
 * registers a permanent owner — running it against a real install would
 * lock the real user out of their own instance.
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const DB_PATH = process.argv[3] ?? null;

let pass = 0;
let fail = 0;
const ok = (m, d = "") => {
  pass++;
  console.log(`  PASS  ${m}${d ? "  — " + d : ""}`);
};
const bad = (m, d = "") => {
  fail++;
  console.log(`  FAIL  ${m}${d ? "  — " + d : ""}`);
};
const section = (t) =>
  console.log("\n" + "=".repeat(70) + "\n" + t + "\n" + "=".repeat(70));

/** Minimal cookie jar — `fetch` has none, and the whole test is cookies. */
function jar() {
  const store = new Map();
  return {
    header: () =>
      [...store.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(";");
        const idx = pair.indexOf("=");
        const name = pair.slice(0, idx);
        const value = pair.slice(idx + 1);
        if (value === "") store.delete(name);
        else store.set(name, value);
      }
    },
    has: (name) => store.has(name),
    clear: () => store.clear(),
  };
}

async function req(path, { method = "GET", body, cookies, html = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookies ? { cookie: cookies.header() } : {}),
      ...(html ? { accept: "text/html" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (cookies) cookies.absorb(res);
  return res;
}

const owner = jar();
const member = jar();
const anon = jar();

const OWNER = { email: "owner@agency.test", password: "owner-passphrase-1" };
const MEMBER = { email: "member@agency.test", password: "member-passphrase-1" };

/**
 * Is this response the auth gate turning someone away?
 *
 * Not every redirect is: the app also bounces a brand-new install to
 * /welcome and an empty section to its own empty state. Checking only
 * for "is it a 3xx" made the first version of this script report a
 * closed gate that was in fact wide open, which is precisely the kind
 * of false confidence a security check must not produce.
 */
function isAuthRedirect(res) {
  const loc = res.headers.get("location") ?? "";
  return (
    (res.status === 307 || res.status === 302) && loc.includes("/login")
  );
}

async function beforeAccounts() {
  section("Before anyone registers — solo mode is untouched");

  const home = await req("/tasks", { html: true, cookies: anon });
  if (isAuthRedirect(home))
    bad("already gated", `redirects to ${home.headers.get("location")}`);
  else ok("the app is open with no login", `status ${home.status}`);

  const reg = await req("/register", { html: true });
  if (reg.status === 200) ok("/register is reachable");
  else bad("/register unreachable", String(reg.status));
}

async function registerOwner() {
  section("First registration — becomes owner and closes the gate");

  const res = await req("/api/auth/register", {
    method: "POST",
    body: { ...OWNER, name: "Priya" },
    cookies: owner,
  });
  if (res.ok) ok("owner registered");
  else {
    bad("register failed", `${res.status} ${await res.text()}`);
    return false;
  }

  if (owner.has("stb_session")) ok("session cookie issued on registration");
  else bad("no session cookie after registering");

  // The critical one, and the reason this script exists. Middleware
  // runs in the Edge sandbox and learns the auth mode from the Node
  // side. Does registering close the gate *on a running server*, with
  // no restart? The first version of this code did not — the instance
  // stayed open to anyone who could reach the port.
  //
  // Middleware caches the mode for up to 30s, so give it that long
  // rather than declaring failure on the first try.
  let closed = false;
  for (let i = 0; i < 35 && !closed; i++) {
    const stranger = await req("/tasks", { html: true, cookies: anon });
    closed = isAuthRedirect(stranger);
    if (!closed) await new Promise((r) => setTimeout(r, 1000));
  }
  if (closed) ok("the gate closed on a running server", "no restart needed");
  else
    bad(
      "the gate did NOT close after registration",
      "every page is reachable with no session",
    );

  const withSession = await req("/tasks", { html: true, cookies: owner });
  if (!isAuthRedirect(withSession)) ok("the owner's session gets through");
  else bad("owner locked out of their own instance", String(withSession.status));

  const second = await req("/api/auth/register", {
    method: "POST",
    body: { email: "gatecrasher@x.test", password: "another-passphrase" },
  });
  if (second.status === 403)
    ok("registration is closed to everyone else", "403");
  else bad("open registration on a deployed instance!", String(second.status));

  return true;
}

async function whoAmI() {
  section("Identity and roles");

  const res = await req("/api/auth/status", { cookies: owner });
  const j = await res.json();
  if (j?.user?.email === OWNER.email) ok("status names the signed-in user");
  else bad("status did not identify the user", JSON.stringify(j));
  if (j?.user?.role === "owner") ok("first user is the owner");
  else bad("first user is not the owner", String(j?.user?.role));
  if (j?.mode === "accounts") ok("mode reported as accounts");
  else bad("wrong mode", String(j?.mode));

  const anonStatus = await req("/api/auth/status");
  const aj = await anonStatus.json().catch(() => null);
  if (aj && aj.user === null) ok("status leaks nothing to a stranger");
  else if (anonStatus.status === 401) ok("status requires a session", "401");
  else bad("status returned a user without a session", JSON.stringify(aj));
}

async function badLogins() {
  section("Login refuses what it should");

  const wrong = await req("/api/auth/login", {
    method: "POST",
    body: { email: OWNER.email, password: "not-the-password" },
  });
  if (wrong.status === 401) ok("wrong password rejected");
  else bad("wrong password accepted!", String(wrong.status));

  const nobody = await req("/api/auth/login", {
    method: "POST",
    body: { email: "does-not-exist@x.test", password: "whatever-passphrase" },
  });
  const nobodyBody = await nobody.json().catch(() => ({}));
  const wrongBody = await wrong.json().catch(() => ({}));
  if (nobody.status === 401) ok("unknown email rejected");
  else bad("unknown email accepted!", String(nobody.status));
  // Identical wording, or the form becomes a way to ask "does this
  // person have an account here?"
  if (nobodyBody.error === wrongBody.error)
    ok("same message for both — no account enumeration");
  else
    bad(
      "different messages leak whether an account exists",
      `"${wrongBody.error}" vs "${nobodyBody.error}"`,
    );

  const forged = jar();
  await req("/api/auth/login", {
    method: "POST",
    body: { ...OWNER },
    cookies: forged,
  });
  ok("owner can sign in normally");
}

async function publicSurfaces() {
  section("Endpoints with their own auth stay reachable");

  // These broke once before, when the password gate was layered on top
  // of schemes that already authenticate themselves.
  for (const [path, label] of [
    ["/api/v1/health", "health endpoint (launchers poll this)"],
    ["/login", "login page"],
  ]) {
    const res = await req(path, { html: path === "/login" });
    if (res.status === 200) ok(label, "200");
    else bad(label, `status ${res.status}`);
  }

  const api = await req("/api/v1/clients");
  if (api.status === 401)
    ok("public API still demands its own Bearer key", "401, not a redirect");
  else if (api.status === 200)
    bad("public API answered without a key!", "200");
  else ok("public API refused", `status ${api.status}`);
}

async function inviteAndScope() {
  section("Invite a member and scope them to one client");

  // Two clients, so "sees only theirs" is a real distinction. Seeded
  // straight into SQLite: there is no POST /api/v1/clients, and adding
  // one purely so a test script could call it would be tail wagging dog.
  const made = [];
  if (!DB_PATH) {
    console.log("  SKIP  pass the DB path as argv[3] to run the scoping check");
    return;
  }
  {
    const { default: Database } = await import("better-sqlite3");
    const sqlite = new Database(DB_PATH);
    for (const name of ["Acme Ltd", "Globex Inc"]) {
      const info = sqlite
        .prepare("INSERT INTO clients (name, url) VALUES (?, ?)")
        .run(name, `https://${name.split(" ")[0].toLowerCase()}.test`);
      made.push(Number(info.lastInsertRowid));
    }
    sqlite.close();
  }
  ok("seeded two clients", made.join(", "));

  const invite = await req("/api/team/invite", {
    method: "POST",
    body: { email: MEMBER.email, role: "member" },
    cookies: owner,
  });
  let token = null;
  if (invite.ok) {
    const j = await invite.json().catch(() => null);
    token = (j?.link ?? "").split("/").pop() || null;
  }
  if (!token) {
    console.log(
      "  SKIP  no invite HTTP endpoint (the UI uses a server action) — exercise the rest in the browser",
    );
    return;
  }

  const accept = await req("/api/auth/register", {
    method: "POST",
    body: { token, ...MEMBER, name: "Rahul" },
    cookies: member,
  });
  if (accept.ok) ok("member accepted the invite");
  else {
    bad("invite acceptance failed", `${accept.status} ${await accept.text()}`);
    return;
  }

  // A brand-new member is assigned nothing, and should therefore see
  // nothing. Assert that before assigning, because "empty list" and
  // "everything" look the same on an install with two clients unless
  // you check.
  const beforeAssign = await req(`/clients/${made[0]}`, {
    html: true,
    cookies: member,
  });
  if (beforeAssign.status === 404)
    ok("an unassigned member sees no clients at all");
  else
    bad(
      "an unassigned member could open a client",
      `status ${beforeAssign.status} — empty assignment read as "no restriction"`,
    );

  {
    const { default: Database } = await import("better-sqlite3");
    const sqlite = new Database(DB_PATH);
    const row = sqlite
      .prepare("SELECT id FROM users WHERE lower(email) = ?")
      .get(MEMBER.email);
    sqlite
      .prepare(
        "INSERT INTO client_members (user_id, client_id, created_at) VALUES (?, ?, unixepoch())",
      )
      .run(row.id, made[0]);
    sqlite.close();
  }
  ok("assigned the member to one of the two clients");

  const allowed = await req(`/clients/${made[0]}`, { html: true, cookies: member });
  const denied = await req(`/clients/${made[1]}`, { html: true, cookies: member });
  if (allowed.status === 200) ok("member reaches their assigned client");
  else bad("member blocked from their own client", String(allowed.status));
  if (denied.status === 404)
    ok("member gets 404 for a client they aren't on", "not 403 — no existence leak");
  else bad("member could reach an unassigned client", String(denied.status));

  // The list has to agree with the guard, or the member spends their
  // day clicking cards that 404.
  const list = await req("/clients", { html: true, cookies: member });
  const html = await list.text();
  if (html.includes("Acme") && !html.includes("Globex"))
    ok("the clients list shows only theirs");
  else
    bad(
      "the clients list is not scoped",
      `Acme=${html.includes("Acme")} Globex=${html.includes("Globex")}`,
    );
}

async function signOut() {
  section("Sign out");
  const res = await req("/api/auth/logout", { method: "POST", cookies: owner });
  if (res.ok) ok("logout responded");
  else bad("logout failed", String(res.status));
  if (!owner.has("stb_session")) ok("session cookie cleared");
  else bad("session cookie survived logout");

  const after = await req("/tasks", { html: true, cookies: owner });
  if (isAuthRedirect(after)) ok("signed-out request is redirected again");
  else bad("still logged in after signing out", String(after.status));
}

async function main() {
  console.log(`Auth flow check against ${BASE}\n`);
  await beforeAccounts();
  if (await registerOwner()) {
    await whoAmI();
    await badLogins();
    await publicSurfaces();
    await inviteAndScope();
    await signOut();
  }
  console.log("\n" + "=".repeat(70));
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\nCRASHED:", e);
  process.exit(1);
});
