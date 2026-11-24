/**
 * Vérifie la mesure des effets de l'agent sur une COPIE de la base
 * (porté depuis l'auteur, eb10f33).
 *
 * Les règles pures ont leurs tests unitaires. Ce script vérifie ce qui ne
 * peut être faux qu'avec de vraies données : un projet dont Search Console
 * ne se lit pas reçoit une EXPLICATION et non un rapport vide, et un
 * changement trop récent est rapporté « trop tôt », pas « zéro effet ».
 *
 *   npx tsx scripts/outcomes-check.ts
 *
 * La base source (SEO_DB_PATH ou ./data.db) est copiée dans un dossier
 * temporaire ; les cas de test y sont ajoutés, jamais dans l'original.
 */
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "outcomes-check-"));
const dbPath = join(dataDir, "copy.db");
const source = process.env.SEO_DB_PATH ?? join(process.cwd(), "data.db");
if (!existsSync(source)) {
  console.error(`Aucune base à ${source}.`);
  process.exit(1);
}
copyFileSync(source, dbPath);
for (const sfx of ["-wal", "-shm"]) {
  if (existsSync(source + sfx)) copyFileSync(source + sfx, dbPath + sfx);
}
process.env.SEO_DB_PATH = dbPath;
process.env.SEO_DATA_DIR = dataDir;
process.env.SEO_DISABLE_SCHEDULER = "1";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) {
    pass++;
    console.log(`  \x1b[32mOK\x1b[0m     ${name}`);
  } else {
    fail++;
    console.log(
      `  \x1b[31mÉCHEC\x1b[0m  ${name}${got === undefined ? "" : ` — obtenu ${JSON.stringify(got)}`}`,
    );
  }
}

async function main() {
  const { db } = await import("../src/db/client");
  const { clients, agentActions } = await import("../src/db/schema");
  const { measureFixOutcomes } = await import("../src/lib/fix-outcomes-data");
  const { eq, inArray, and } = await import("drizzle-orm");

  const rows = await db
    .select({ id: clients.id, name: clients.name, gsc: clients.gscProperty })
    .from(clients);

  console.log();
  for (const c of rows) {
    const applied = await db
      .select({ id: agentActions.id })
      .from(agentActions)
      .where(
        and(
          eq(agentActions.clientId, c.id),
          inArray(agentActions.status, ["applied", "verified"]),
        ),
      );
    console.log(
      `── projet #${c.id} : ${applied.length} changement(s) appliqué(s), Search Console ${c.gsc ? "reliée" : "non reliée"}`,
    );

    const r = await measureFixOutcomes(c.id);
    if (applied.length === 0) {
      check(
        `#${c.id} : rien d'appliqué, rien d'affirmé`,
        r.outcomes.length === 0 && r.unavailable === null && r.rollup.state === "empty",
        { outcomes: r.outcomes.length, unavailable: r.unavailable },
      );
      continue;
    }
    check(
      `#${c.id} : les changements appliqués sont mesurés ou expliqués`,
      r.unavailable !== null || r.outcomes.length > 0,
      { unavailable: r.unavailable, outcomes: r.outcomes.length },
    );
  }
  console.log();

  // ── Cas ajoutés dans la copie ────────────────────────────────────────
  console.log("── Ajouté : changement appliqué sans propriété Search Console");
  const [noGsc] = await db
    .insert(clients)
    .values({ name: "Fixture mesure (sans GSC)", url: "https://fixture.invalid" })
    .returning({ id: clients.id });
  const old = new Date();
  old.setUTCDate(old.getUTCDate() - 90);
  await db.insert(agentActions).values({
    clientId: noGsc.id,
    kind: "write_title",
    targetUrl: "https://fixture.invalid/page",
    risk: "safe",
    status: "verified",
    appliedAt: old,
  });
  const rNoGsc = await measureFixOutcomes(noGsc.id);
  check(
    "sans propriété : explication au lieu d'un rapport vide",
    rNoGsc.unavailable?.reason === "no_property" && rNoGsc.unavailable.count === 1,
    rNoGsc.unavailable,
  );
  check("sans propriété : rien de mesuré", rNoGsc.rollup.measured === 0);
  console.log();

  console.log("── Ajouté : changement appliqué hier (trop tôt)");
  const [gscClient] = await db
    .insert(clients)
    .values({
      name: "Fixture mesure (trop tôt)",
      url: "https://fixture2.invalid",
      gscProperty: "https://fixture2.invalid/",
    })
    .returning({ id: clients.id });
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  await db.insert(agentActions).values({
    clientId: gscClient.id,
    kind: "write_meta_description",
    targetUrl: "https://fixture2.invalid/page",
    risk: "safe",
    status: "verified",
    appliedAt: yesterday,
  });
  const rEarly = await measureFixOutcomes(gscClient.id);
  check(
    "trop tôt : too_early, pas zéro effet",
    rEarly.outcomes.length === 1 && rEarly.outcomes[0].confidence === "too_early",
    rEarly.outcomes.map((o) => o.confidence),
  );
  check("trop tôt : aucun appel API nécessaire", rEarly.unavailable === null && rEarly.notRead === 0);
  check("trop tôt : l'attente est donnée", (rEarly.outcomes[0]?.daysToGo ?? 0) > 0);
  check("trop tôt : synthèse « rien de mesurable »", rEarly.rollup.state === "none_measurable");
  console.log();

  console.log("── Ajouté : changement ancien, propriété illisible");
  await db.insert(agentActions).values({
    clientId: gscClient.id,
    kind: "write_title",
    targetUrl: "https://fixture2.invalid/other",
    risk: "safe",
    status: "verified",
    appliedAt: old,
  });
  const rMixed = await measureFixOutcomes(gscClient.id);
  check(
    "illisible : le changement ancien est compté « non lu », pas « zéro »",
    rMixed.notRead === 1 && rMixed.outcomes.length === 1,
    { notRead: rMixed.notRead, outcomes: rMixed.outcomes.length },
  );
  console.log();

  console.log(`${pass} OK, ${fail} en échec`);
  console.log(`\nExécuté sur ${dbPath}, pas sur la base réelle.\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
