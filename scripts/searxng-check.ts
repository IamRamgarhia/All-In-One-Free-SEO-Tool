/**
 * Fait passer le fournisseur SearXNG de l'application par une vraie
 * instance (porté de l'auteur, 6b4d6f6, adapté aux codes d'échec).
 *
 * Un test sur des réponses enregistrées prouve que l'analyse tient ; seul
 * un essai réel prouve que la requête, le paramètre format=json, le délai
 * et la configuration de l'instance vont ensemble. SearXNG ne répond en
 * JSON que si `json` figure dans `search.formats` ; sinon il renvoie une
 * page HTML, que l'application lirait comme un blocage.
 *
 * La vérification la plus importante est la dernière : un domaine absent
 * doit revenir `ok: true, position: null`, une instance en panne
 * `ok: false`. Confondre les deux, c'est confondre « absent » et « pas pu
 * regarder ».
 *
 * Démarrer l'instance d'abord :
 *
 *   export SEARXNG_SECRET=$(openssl rand -hex 32)
 *   docker compose --profile searxng up -d searxng
 *   pnpm exec tsx scripts/searxng-check.ts
 *
 * Le conteneur n'est pas publié sur l'hôte (un SearXNG ouvert est un
 * proxy ouvert) : ce script le joint comme l'application, par le réseau
 * compose, au travers d'un conteneur curl jetable. SEARXNG_NETWORK donne
 * le nom de ce réseau (<dossier>_default) ; SEARXNG_URL, s'il est défini,
 * interroge directement cette adresse sans passer par Docker.
 */
import { execFileSync } from "node:child_process";
import { createSearxngProvider, parseSearxResults } from "../src/lib/serp/searxng";

const DIRECT = process.env.SEARXNG_URL ?? "";
const NETWORK = process.env.SEARXNG_NETWORK ?? "seo_default";
const HOST = process.env.SEARXNG_HOST ?? "http://searxng:8080";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) {
    pass++;
    console.log(`  \x1b[32mOK\x1b[0m     ${name}`);
  } else {
    fail++;
    console.log(`  \x1b[31mÉCHEC\x1b[0m  ${name}${got === undefined ? "" : ` — reçu ${JSON.stringify(got)}`}`);
  }
}

/**
 * Requête au travers d'un conteneur jetable sur le réseau compose, passée
 * au fournisseur comme `fetchImpl` : il construit l'adresse et lit la
 * réponse exactement comme en production, seul le transport change.
 */
function dockerFetch(url: string): Promise<Response> {
  const out = execFileSync(
    "docker",
    [
      "run", "--rm", "--network", NETWORK, "curlimages/curl:latest",
      "-s", "--max-time", "25", "-w", "\n%{http_code}", url,
    ],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  const cut = out.lastIndexOf("\n");
  const status = Number(out.slice(cut + 1)) || 0;
  return Promise.resolve(
    new Response(out.slice(0, cut), {
      status: status >= 200 && status <= 599 ? status : 502,
      headers: { "content-type": "application/json" },
    }),
  );
}

async function main() {
  const viaDocker = !DIRECT;
  const instanceUrl = DIRECT || HOST;
  const fetchImpl = viaDocker
    ? (((input: RequestInfo | URL) => dockerFetch(String(input))) as typeof fetch)
    : undefined;

  console.log(`\nInstance : ${instanceUrl}${viaDocker ? ` (réseau docker ${NETWORK})` : ""}\n`);

  const provider = createSearxngProvider({ instanceUrl, fetchImpl });
  check("le fournisseur s'identifie comme searxng", provider.id === "searxng", provider.id);

  console.log("\nUn site qui se classe vraiment est trouvé, avec sa position");
  const hit = await provider.lookup({
    query: "wordpress seo plugin",
    domain: "wordpress.org",
    country: "US",
    language: "en",
  });
  check("la recherche a abouti", hit.ok === true, hit);
  if (hit.ok) {
    check("une position est renvoyée", typeof hit.position === "number", hit.position);
    check("la position est plausible (ni 0 ni négative)", (hit.position ?? 0) > 0, hit.position);
    check("le nombre de résultats lus est indiqué", hit.resultsScanned > 0, hit.resultsScanned);
    check("les moteurs qui ont répondu sont nommés", Boolean(hit.engine), hit.engine);
    console.log(`    position ${hit.position} sur ${hit.resultsScanned} résultats, via ${hit.engine}`);
    console.log(`    url : ${hit.url ?? "(aucune)"}`);
  }

  console.log("\n« Absent de ces résultats » est une RÉPONSE, pas une erreur");
  const miss = await provider.lookup({
    query: "wordpress seo plugin",
    domain: "ce-domaine-n-existe-pas-91823.invalid",
    country: "US",
    language: "en",
  });
  check("toujours ok: true", miss.ok === true, miss);
  if (miss.ok) {
    check("position nulle", miss.position === null, miss.position);
    check("avec le nombre de résultats lus", miss.resultsScanned > 0, miss.resultsScanned);
  }

  console.log("\nUne instance en panne est un ÉCHEC, jamais « absent »");
  const broken = createSearxngProvider({
    instanceUrl: "http://searxng-inexistant.invalid:8080",
    fetchImpl: (() => Promise.reject(new Error("getaddrinfo ENOTFOUND"))) as typeof fetch,
  });
  const err = await broken.lookup({ query: "x", domain: "example.com" });
  check("ok: false", err.ok === false, err);
  if (!err.ok) check("avec le code « network »", err.failure.code === "network", err.failure);

  console.log("\nLa réponse brute s'analyse comme le test sur fixtures l'attend");
  const raw = await (fetchImpl ?? fetch)(`${instanceUrl}/search?q=wordpress+seo+plugin&format=json`);
  const parsed = parseSearxResults(await raw.json());
  check("des résultats reviennent", parsed.urls.length >= 5, parsed.urls.length);
  check("les moteurs sont nommés", parsed.engines.length > 0, parsed.engines);
  check(
    "aucune redirection sans hôte n'a survécu",
    parsed.urls.every((u) => {
      try {
        return new URL(u).hostname.includes(".");
      } catch {
        return false;
      }
    }),
  );
  console.log(`    ${parsed.urls.length} résultats, moteurs : ${parsed.engines.join(", ")}`);

  console.log(`\n${pass} réussis, ${fail} en échec\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(
    "\nInstance injoignable. Est-elle démarrée ?\n" +
      "  export SEARXNG_SECRET=$(openssl rand -hex 32)\n" +
      "  docker compose --profile searxng up -d searxng\n",
  );
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
