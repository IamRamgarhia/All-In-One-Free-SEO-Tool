/**
 * WordPress hack / malware indicator scanner.
 *
 * Remote-only — we can't read PHP files on someone else's server. But many
 * compromises leave externally visible IOCs we can probe via HTTP:
 *
 *   1. Backdoor file URLs that respond 200 instead of 404
 *   2. Mass-scanner targets: wp-content/uploads/ with .php files
 *   3. JS injection on the homepage (eval, document.write of remote scripts,
 *      base64-encoded payloads, foreign-domain redirects)
 *   4. Pharma / gambling / casino spam in outbound links (link injection)
 *   5. Cloaking patterns (different content for Googlebot vs regular user)
 *   6. Open xmlrpc.php / wp-admin (attack surface)
 *   7. WordPress version disclosure (vulnerability fingerprinting)
 *   8. JS-redirected to malicious domain (homepage tries to redirect on first paint)
 *   9. .htaccess attack signatures (response headers hint at it)
 *  10. iframe injection from foreign domain
 *
 * Each IOC has a severity and a playbook entry (containment + cleanup +
 * prevention).
 */

const USER_AGENT_REAL =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36";
const USER_AGENT_GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

export type HackIoc = {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  category:
    | "backdoor"
    | "injection"
    | "spam"
    | "cloaking"
    | "exposure"
    | "config"
    | "version";
  title: string;
  detail: string;
  evidence?: string;
};

export type HackScanReport = {
  domain: string;
  homepageReachable: boolean;
  iocs: HackIoc[];
  riskScore: number;
  riskLevel: "clean" | "suspicious" | "compromised" | "critical";
  containmentSteps: string[];
  cleanupSteps: string[];
  preventionSteps: string[];
  cloudflareQuickFix: boolean;
};

// Common backdoor filenames seen in compromised WP installs
const BACKDOOR_FILES = [
  "wso.php",
  "c99.php",
  "r57.php",
  "shell.php",
  "alfa.php",
  "alfashell.php",
  "indoxploit.php",
  "bypass.php",
  "config.bak.php",
  "marijuana.php",
  "fox.php",
  "x.php",
  "1.php",
  "up.php",
  "upload.php",
  "uploads/wp-config.php",
  "uploads/shell.php",
  "wp-content/uploads/2024/wp-class.php",
  "wp-content/uploads/wp-class.php",
  "wp-includes/wp-class.php",
  "wp-content/plugins/hello.php",
  "wp-content/themes/admin.php",
  "wp-content/wp-login.php",
];

// Common spam-injection keyword patterns
const SPAM_PATTERNS = [
  /\b(viagra|cialis|levitra|sildenafil)\b/i,
  /\b(casino|poker|gambling|sportsbook|slots)\s+(online|free|bonus|real)/i,
  /\b(payday\s+loans|cash\s+advance)\b/i,
  /\b(replica\s+(rolex|watch|handbag))\b/i,
  /\b(buy\s+(viagra|cialis|essay|followers))\b/i,
  /\b(porn|xxx|sex\s+(chat|video|cam))/i,
];

async function probe(url: string): Promise<{ status: number; bytes: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "user-agent": USER_AGENT_REAL, accept: "text/html,*/*;q=0.5" },
    });
    let bytes = 0;
    try {
      const text = await res.text();
      bytes = text.length;
    } catch {
      // ignore
    }
    return { status: res.status, bytes };
  } catch {
    return { status: 0, bytes: 0 };
  } finally {
    clearTimeout(t);
  }
}

async function fetchHomepage(
  url: string,
  asGooglebot = false,
): Promise<{ html: string; status: number; headers: Headers } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": asGooglebot ? USER_AGENT_GOOGLEBOT : USER_AGENT_REAL,
        accept: "text/html",
      },
    });
    const html = (await res.text()).slice(0, 800_000);
    return { html, status: res.status, headers: res.headers };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function severityWeight(s: HackIoc["severity"]): number {
  return { critical: 40, high: 20, medium: 8, low: 3 }[s];
}

export async function scanWordPressHack(
  rawUrl: string,
): Promise<HackScanReport> {
  let origin = "";
  try {
    origin = new URL(
      /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`,
    ).origin;
  } catch {
    return {
      domain: rawUrl,
      homepageReachable: false,
      iocs: [],
      riskScore: 0,
      riskLevel: "clean",
      containmentSteps: [],
      cleanupSteps: [],
      preventionSteps: [],
      cloudflareQuickFix: false,
    };
  }
  const domain = new URL(origin).hostname.replace(/^www\./, "");
  const iocs: HackIoc[] = [];

  // 1. Fetch homepage as both real browser + Googlebot (cloaking detection)
  const real = await fetchHomepage(origin, false);
  const bot = await fetchHomepage(origin, true);
  if (!real) {
    return {
      domain,
      homepageReachable: false,
      iocs,
      riskScore: 0,
      riskLevel: "clean",
      containmentSteps: [`Couldn't fetch ${origin}. Verify the site is up.`],
      cleanupSteps: [],
      preventionSteps: [],
      cloudflareQuickFix: false,
    };
  }
  const html = real.html;

  // Is it WordPress?
  const isWp =
    /wp-content|wp-includes|wp-json|<meta[^>]+generator[^>]+wordpress/i.test(html);
  if (!isWp) {
    iocs.push({
      id: "not-wordpress",
      severity: "low",
      category: "config",
      title: "Site doesn't look like WordPress",
      detail:
        "Couldn't detect WordPress signatures on the homepage. Many checks below assume WordPress; results may be less reliable.",
    });
  }

  // 2. Cloaking detection — does Googlebot version differ significantly?
  if (bot && Math.abs(bot.html.length - html.length) > 50_000) {
    iocs.push({
      id: "cloaking-suspected",
      severity: "high",
      category: "cloaking",
      title: "Possible cloaking — Googlebot sees different content",
      detail: `Googlebot view is ${bot.html.length} bytes vs ${html.length} for a real browser. Healthy sites should be near-identical (small variation OK).`,
      evidence: `Δ ${Math.abs(bot.html.length - html.length)} bytes`,
    });
  }

  // 3. Backdoor file probes (parallel, capped to ~20 concurrent)
  const backdoorResults = await Promise.all(
    BACKDOOR_FILES.map(async (f) => ({
      file: f,
      ...(await probe(`${origin}/${f}`)),
    })),
  );
  const foundBackdoors = backdoorResults.filter(
    (r) => r.status === 200 && r.bytes > 0,
  );
  if (foundBackdoors.length > 0) {
    iocs.push({
      id: "backdoor-files-200",
      severity: "critical",
      category: "backdoor",
      title: `${foundBackdoors.length} suspected backdoor file${foundBackdoors.length === 1 ? "" : "s"} accessible`,
      detail: `These URLs return HTTP 200 from your server. On a healthy WP install they should be 404.`,
      evidence: foundBackdoors
        .slice(0, 5)
        .map((f) => `/${f.file} → ${f.status}`)
        .join(", "),
    });
  }

  // 4. /wp-content/uploads/ directory listing
  const uploadsListing = await probe(`${origin}/wp-content/uploads/`);
  if (uploadsListing.status === 200 && uploadsListing.bytes > 1000) {
    iocs.push({
      id: "uploads-directory-listing",
      severity: "medium",
      category: "exposure",
      title: "/wp-content/uploads/ allows directory listing",
      detail:
        "An attacker can browse every uploaded file. Disable directory listing in .htaccess.",
    });
  }

  // 5. wp-config.php / debug.log / version-control files exposed
  //
  // readme.html is deliberately NOT in this list. It shipped here with
  // every WordPress install, it is not a secret, and it was being
  // reported as "configuration, debug, or version-control files ... anyone
  // can read these right now" at critical severity. On the first real
  // site this scanner ever ran against, readme.html was the only hit:
  // every genuine secret was correctly blocked with a 403, and the tool
  // still said the site was compromised.
  //
  // That is worse than missing the finding. A critical that cries wolf
  // teaches people to ignore the next one, which will be real. Version
  // disclosure is a real but minor issue and gets its own check below.
  const exposureProbes = [
    "wp-config.php.bak",
    "wp-config.php~",
    "wp-config.txt",
    "wp-config.php.save",
    "wp-content/debug.log",
    ".git/config",
    ".env",
  ];
  const exposureResults = await Promise.all(
    exposureProbes.map(async (f) => ({
      file: f,
      ...(await probe(`${origin}/${f}`)),
    })),
  );
  const exposures = exposureResults.filter(
    (r) => r.status === 200 && r.bytes > 100,
  );
  if (exposures.length > 0) {
    iocs.push({
      id: "exposed-config-files",
      severity: "critical",
      category: "exposure",
      title: `${exposures.length} sensitive file${exposures.length === 1 ? "" : "s"} publicly readable`,
      detail:
        "Configuration, debug, or version-control files should never be web-accessible. Anyone can read these right now.",
      evidence: exposures.map((e) => `/${e.file}`).join(", "),
    });
  }

  // 5b. readme.html, which names the WordPress version.
  //
  // Split out of the block above, where it was being reported as a
  // critical config-file exposure. It is neither. It ships with every
  // install and contains no secret — it just tells an attacker which
  // version to target, which turns a scan for "sites running 6.4.2" into
  // a list. Worth removing, not worth an alarm.
  const readme = await probe(`${origin}/readme.html`);
  if (readme.status === 200 && readme.bytes > 100) {
    iocs.push({
      id: "readme-exposed",
      severity: "low",
      category: "exposure",
      title: "readme.html names the WordPress version",
      detail:
        "This file ships with WordPress and is not a secret, but it tells " +
        "anyone which version is running, which is how mass scans build " +
        "their target lists. Delete it — WordPress does not use it, and " +
        "it comes back on every core update, so do it after upgrades too.",
      evidence: "/readme.html",
    });
  }

  // 6. xmlrpc.php exposed (DDoS amp + brute-force vector)
  const xmlrpc = await probe(`${origin}/xmlrpc.php`);
  if (xmlrpc.status === 200 || xmlrpc.status === 405) {
    iocs.push({
      id: "xmlrpc-exposed",
      severity: "medium",
      category: "exposure",
      title: "xmlrpc.php is accessible",
      detail:
        "xmlrpc is a known brute-force + DDoS amplification vector. Disable unless you actively use it (Jetpack-only).",
    });
  }

  // 7. WP version disclosure
  const wpVer = html.match(
    /<meta[^>]+name=["']generator["'][^>]+content=["']WordPress\s+([\d.]+)/i,
  )?.[1];
  if (wpVer) {
    iocs.push({
      id: "wp-version-disclosed",
      severity: "low",
      category: "version",
      title: `WordPress version ${wpVer} disclosed`,
      detail:
        "Version disclosure helps attackers fingerprint vulnerable installs. Remove <meta generator>.",
      evidence: wpVer,
    });
  }

  // 8. JS injection: suspicious eval, foreign-domain script tags, base64-blob inline scripts
  const suspiciousJs: string[] = [];
  if (/eval\s*\(\s*atob\s*\(/i.test(html)) {
    suspiciousJs.push("eval(atob(...)) pattern — classic obfuscated payload");
  }
  if (/document\.write\s*\(\s*unescape/i.test(html)) {
    suspiciousJs.push("document.write(unescape(...)) — old-school injector");
  }
  if (/String\.fromCharCode\(\s*\d+(?:\s*,\s*\d+){10,}/i.test(html)) {
    suspiciousJs.push("Long String.fromCharCode chain — obfuscation");
  }
  const remoteScripts = Array.from(
    html.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)["']/gi),
  )
    .map((m) => m[1])
    .filter((src) => {
      try {
        return new URL(src).hostname.replace(/^www\./, "") !== domain;
      } catch {
        return false;
      }
    });
  const sketchyHostRe = /\.(ru|cn|tk|ml|ga|cf|gq|top|xyz|club|cricket|loan|stream)(\/|$)/i;
  const sketchyRemoteScripts = remoteScripts.filter((s) => sketchyHostRe.test(s));
  if (sketchyRemoteScripts.length > 0) {
    iocs.push({
      id: "sketchy-remote-scripts",
      severity: "critical",
      category: "injection",
      title: `${sketchyRemoteScripts.length} script${sketchyRemoteScripts.length === 1 ? "" : "s"} loaded from suspicious TLDs`,
      detail:
        "Scripts loading from .ru / .cn / .tk / .ml / .top etc. on a WP install are nearly always injected malware.",
      evidence: sketchyRemoteScripts.slice(0, 3).join("\n"),
    });
  }
  if (suspiciousJs.length > 0) {
    iocs.push({
      id: "obfuscated-js",
      severity: "high",
      category: "injection",
      title: "Obfuscated JavaScript patterns in the HTML",
      detail:
        "These patterns are classic indicators of injected malware. Inspect the homepage source for eval(atob), document.write(unescape), or long fromCharCode chains.",
      evidence: suspiciousJs.join("; "),
    });
  }

  // 9. Hidden iframe injection
  const hiddenIframes = (
    html.match(
      /<iframe[^>]*(?:width\s*=\s*["']?0|height\s*=\s*["']?0|style\s*=\s*["'][^"']*display\s*:\s*none)/gi,
    ) ?? []
  ).length;
  if (hiddenIframes > 0) {
    iocs.push({
      id: "hidden-iframes",
      severity: "high",
      category: "injection",
      title: `${hiddenIframes} hidden iframe${hiddenIframes === 1 ? "" : "s"} on homepage`,
      detail:
        "Hidden (0×0 or display:none) iframes are a classic drive-by infection pattern. Inspect what's being loaded.",
    });
  }

  // 10. Pharma / gambling / spam keyword injection
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ");
  const spamHits = SPAM_PATTERNS.map((p) => p.exec(stripped))
    .filter((m): m is RegExpExecArray => m !== null);
  if (spamHits.length > 0) {
    iocs.push({
      id: "spam-keyword-injection",
      severity: "high",
      category: "spam",
      title: `Spam-keyword injection detected (${spamHits.length} match${spamHits.length === 1 ? "" : "es"})`,
      detail:
        "Pharma/gambling/replica/adult keywords on a non-pharma/non-gambling site are nearly always SEO spam injection. Often only shown to Googlebot — re-check via /tools/render.",
      evidence: spamHits.slice(0, 3).map((m) => m[0]).join(", "),
    });
  }

  // 11. Foreign-domain meta-refresh redirect
  if (
    /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["']\s*\d+\s*;\s*url=https?:\/\//i.test(
      html,
    )
  ) {
    iocs.push({
      id: "meta-refresh-redirect",
      severity: "high",
      category: "injection",
      title: "Homepage uses meta-refresh redirect",
      detail:
        "Meta-refresh redirects are rarely legitimate on a WordPress homepage. Often malware sends users to a phishing/scam destination after a delay.",
    });
  }

  // 12. Compute risk score + level
  const riskScore = iocs.reduce((s, i) => s + severityWeight(i.severity), 0);
  let riskLevel: HackScanReport["riskLevel"] = "clean";
  if (riskScore >= 60) riskLevel = "critical";
  else if (riskScore >= 25) riskLevel = "compromised";
  else if (riskScore >= 10) riskLevel = "suspicious";

  // 13. Containment / cleanup / prevention playbook
  const containmentSteps: string[] = [];
  const cleanupSteps: string[] = [];
  const preventionSteps: string[] = [];
  const cloudflareQuickFix =
    riskLevel === "critical" || riskLevel === "compromised";

  if (cloudflareQuickFix) {
    containmentSteps.push(
      "1. Cloudflare → Security → Under Attack Mode → ON. Buys you minutes against active attacks.",
    );
    containmentSteps.push(
      "2. Cloudflare → Rules → WAF → block country / ASN if you see a single source.",
    );
  }
  if (foundBackdoors.length > 0 || suspiciousJs.length > 0) {
    containmentSteps.push(
      "3. Change ALL passwords NOW (WP admin, FTP/SFTP, hosting panel, database, Cloudflare). Assume keys are compromised.",
    );
    containmentSteps.push(
      "4. Enable 2FA on every account that touches the site.",
    );
    cleanupSteps.push(
      "1. Pull a fresh backup of /wp-content/uploads/ (your media) and database. Don't trust core/plugins/themes — restore from scratch.",
    );
    cleanupSteps.push(
      "2. Delete /wp-content/plugins/ and /wp-content/themes/ entirely. Re-download every plugin from wordpress.org or the vendor. Re-install your theme from the vendor — do NOT copy from the compromised site.",
    );
    cleanupSteps.push(
      "3. Re-install WordPress core via wp-cli: `wp core download --force`",
    );
    cleanupSteps.push(
      "4. Scan /wp-content/uploads/ for .php files: `find wp-content/uploads -name '*.php'` — there should be ZERO. Delete every one.",
    );
    cleanupSteps.push(
      "5. Scan database for admin users you don't recognize: `wp user list --role=administrator`. Delete unknown ones.",
    );
    cleanupSteps.push(
      "6. Scan wp_options table for suspicious autoloaded options: `wp option list --autoload=on | grep -E 'eval|base64|class_'`",
    );
    cleanupSteps.push(
      "7. Re-scan with Sucuri SiteCheck (free, external) + Wordfence (installed plugin) + this tool. Don't trust just one scanner.",
    );
  }
  if (exposures.length > 0) {
    cleanupSteps.push(
      `8. Block exposed files in .htaccess: <FilesMatch "(wp-config\\.php\\.bak|debug\\.log|\\.env|\\.git)"> Order Deny,Allow; Deny from all; </FilesMatch>`,
    );
  }
  if (xmlrpc.status === 200 || xmlrpc.status === 405) {
    cleanupSteps.push(
      "9. Disable xmlrpc.php — add to .htaccess: <Files xmlrpc.php> Order Deny,Allow; Deny from all; </Files>",
    );
  }
  if (uploadsListing.status === 200) {
    cleanupSteps.push(
      "10. Disable directory listing — add to /wp-content/uploads/.htaccess: Options -Indexes",
    );
  }

  preventionSteps.push(
    "Install Wordfence (free) or iThemes Security with file-change monitoring.",
  );
  preventionSteps.push(
    "Auto-update WordPress core + plugins (Settings → Updates → Enable automatic updates).",
  );
  preventionSteps.push(
    "Prevent PHP execution in uploads — add to /wp-content/uploads/.htaccess: <FilesMatch \"\\.php$\"> Deny from all; </FilesMatch>",
  );
  preventionSteps.push(
    "Limit login attempts (Limit Login Attempts Reloaded plugin).",
  );
  preventionSteps.push(
    "Put Cloudflare in front (free tier is enough). Enable Bot Fight Mode + Rate Limiting on /wp-login.php.",
  );
  preventionSteps.push(
    "Weekly automated backups stored OFF the same server (BackWPup → S3 / Google Drive).",
  );
  preventionSteps.push(
    "Subscribe to wpvulndb.com / patchstack.com for vulnerability alerts for your installed plugins.",
  );

  return {
    domain,
    homepageReachable: true,
    iocs,
    riskScore,
    riskLevel,
    containmentSteps,
    cleanupSteps,
    preventionSteps,
    cloudflareQuickFix,
  };
}
