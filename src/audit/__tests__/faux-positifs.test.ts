/**
 * False positives found on a real French site (nd-prestige.com, 23/11/2026),
 * each checked against the live pages before it was fixed.
 */
import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import type { AuditContext } from "@/audit/types";
import { privacyPolicyRule } from "@/audit/rules/eeat/privacy-policy";
import { termsOfServiceRule } from "@/audit/rules/eeat/terms-of-service";
import { readingLevelRule } from "@/audit/rules/content/reading-level";
import { http2Rule } from "@/audit/rules/performance/http2";
import { horizontalScrollRule } from "@/audit/rules/mobile/horizontal-scroll";
import { checkPage } from "@/lib/audit";

function ctx(html: string, headers: Record<string, string> = {}): AuditContext {
  return { url: "https://example.fr/", html, $: cheerio.load(html), headers } as unknown as AuditContext;
}

const footer = (links: string) => `<html lang="fr"><body><main><p>Bienvenue.</p></main><footer>${links}</footer></body></html>`;

describe("French legal pages", () => {
  it("« Mentions légales » counts as the privacy page", async () => {
    const r = await privacyPolicyRule.run(ctx(footer('<a href="/mentions-legales">Mentions légales</a>')));
    expect(r.status).toBe("pass");
  });

  it("a /rgpd page counts as the privacy page", async () => {
    const r = await privacyPolicyRule.run(ctx(footer('<a href="/rgpd">Vos données</a>')));
    expect(r.status).toBe("pass");
  });

  it("CGV and « Conditions générales » count as terms", async () => {
    expect((await termsOfServiceRule.run(ctx(footer('<a href="/cgv">CGV</a>')))).status).toBe("pass");
    expect(
      (await termsOfServiceRule.run(ctx(footer('<a href="/conditions">Conditions générales de vente</a>')))).status,
    ).toBe("pass");
  });
});

describe("reading level", () => {
  it("is not measured on a page that is not in English", async () => {
    const text = "Votre chauffeur privé vous attend à l'aéroport. ".repeat(40);
    const r = await readingLevelRule.run(ctx(`<html lang="fr"><body><main><p>${text}</p></main></body></html>`));
    expect(r.status).toBe("not-measured");
  });
});

describe("HTTP/2", () => {
  it("a missing alt-svc header is not a warning: HTTP/2 cannot be read from headers", async () => {
    expect((await http2Rule.run(ctx("<html></html>", {}))).status).toBe("not-measured");
    expect((await http2Rule.run(ctx("<html></html>", { "alt-svc": 'h3=":443"' }))).status).toBe("pass");
  });
});

describe("horizontal scroll", () => {
  it("does not count image width attributes (they prevent layout shift)", async () => {
    const imgs = Array.from({ length: 8 }, (_, i) => `<img src="/v${i}.webp" width="1200" height="800" alt="">`).join("");
    expect((await horizontalScrollRule.run(ctx(`<html><body>${imgs}</body></html>`))).status).toBe("pass");
  });

  it("warns, never fails, on many fixed-width blocks: it guesses, it does not measure", async () => {
    const blocks = Array.from({ length: 6 }, () => '<div style="width: 900px">x</div>').join("");
    expect((await horizontalScrollRule.run(ctx(`<html><body>${blocks}</body></html>`))).status).toBe("warn");
  });
});

describe("article without author", () => {
  const page = (html: string) =>
    checkPage({
      url: "https://example.fr/",
      finalUrl: "https://example.fr/",
      status: 200,
      html,
      headers: new Headers(),
      responseTimeMs: 100,
      redirectHops: 0,
    }).findings.filter((f) => f.type === "article_missing_author");

  it("a service page using <article> for its cards is not an article", () => {
    expect(page("<html><body><article><h3>Transfert Orly</h3></article></body></html>")).toHaveLength(0);
  });

  it("a page that declares itself an article still needs an author", () => {
    expect(
      page('<html><head><meta property="og:type" content="article"></head><body><article>Texte</article></body></html>'),
    ).toHaveLength(1);
  });
});

describe("the privacy page itself", () => {
  it("is not warned for not linking to itself", async () => {
    const page = { ...ctx('<html lang="fr"><body><h1>Mentions légales</h1></body></html>'), url: "https://example.fr/mentions-legales" };
    expect((await privacyPolicyRule.run(page as AuditContext)).status).toBe("pass");
  });
});
