/**
 * Run every tool that needs a model, against a real one.
 *
 * The 34 AI tools in this app had never executed. Not once, by anybody:
 * the only AI connection on this install was a chat subscription, which
 * runs the other way round and gives these pages nothing to call. So
 * every one of them was code that typechecked, built, passed its unit
 * tests, and had never produced an answer.
 *
 * This project's own history says what that is worth. The first hour of
 * real testing against WordPress produced three genuine bugs in paths
 * that looked fine. There is no reason to expect better here.
 *
 *   pnpm exec tsx scripts/ai-tools-check.ts [toolId ...]
 *
 * Costs real credits — one call per tool. Run it when you mean to.
 *
 * A tool "passes" here if it returns an answer rather than an error. It
 * does NOT check that the answer is any good; judging SEO advice needs a
 * person. This is the difference between "has never run" and "runs".
 */

import { setTimeout as sleep } from "node:timers/promises";

type Case = {
  id: string;
  /** Skip with a stated reason rather than pretending to cover it. */
  skip?: string;
  run: () => Promise<unknown>;
};

/** Build FormData in one line, since almost every action takes one. */
function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const SITE = "https://dicecodes.com/";
const SAMPLE = `
Dice Codes is a web design and development agency based in Punjab, India.
We build fast, accessible websites and online stores, and we run search
engine optimisation campaigns for small businesses. Our team has shipped
more than a hundred projects across WordPress, Shopify and custom stacks.
We care about page speed, structured data and content that answers the
question somebody actually typed.
`.trim();

function cases(): Case[] {
  return [
    {
      id: "meta-tag-generator",
      run: async () =>
        (await import("@/app/tools/meta-tag-generator/actions")).generateMetaTags(
          null,
          fd({
            topic: "Web design agency in Punjab",
            keyword: "web design punjab",
            brand: "Dice Codes",
            intent: "commercial",
            audience: "small business owners",
          }),
        ),
    },
    {
      id: "intent-classifier",
      run: async () =>
        (await import("@/app/tools/intent-classifier/actions")).runClassify(
          null,
          fd({ queries: "buy running shoes\nwhat is seo\nnike store near me" }),
        ),
    },
    {
      id: "summarizer",
      run: async () =>
        (await import("@/app/tools/summarizer/actions")).runSummarize(
          null,
          fd({ text: SAMPLE }),
        ),
    },
    {
      id: "cluster",
      run: async () =>
        (await import("@/app/tools/cluster/actions")).runCluster(
          null,
          fd({ topic: "web design", country: "IN" }),
        ),
    },
    {
      id: "news-headline",
      run: async () =>
        (await import("@/app/tools/news-headline/actions")).runHeadline(
          null,
          fd({ topic: "Google core update", headline: "Google rolls out a core update" }),
        ),
    },
    {
      id: "code-generator",
      run: async () =>
        (await import("@/app/tools/code-generator/actions")).generateCode(
          null,
          fd({
            target: "wp-plugin-simple",
            task: "Add a canonical tag to every post",
            constraints: "No plugins",
          }),
        ),
    },
    {
      id: "trending",
      run: async () =>
        (await import("@/app/tools/trending/actions")).runTrending(
          null,
          fd({ topic: "seo", country: "IN" }),
        ),
    },
    {
      id: "content-helpers",
      run: async () =>
        (await import("@/app/tools/content-helpers/actions")).getCoverImagePrompts(
          fd({ title: "How to speed up WordPress", excerpt: SAMPLE.slice(0, 200) }),
        ),
    },
    {
      id: "outreach-personalize",
      run: async () =>
        (await import("@/app/tools/outreach-personalize/actions")).runPersonalize(
          null,
          fd({
            prospectUrl: SITE,
            senderName: "Test",
            goal: "guest post",
            templateSubject: "Quick idea for {{site}}",
            template: "Hi, I read {{site}} and had a thought.",
          }),
        ),
    },
    {
      id: "refresh",
      run: async () =>
        (await import("@/app/tools/refresh/actions")).runRefresh(
          null,
          fd({ url: SITE, targetKeyword: "web design punjab", country: "IN" }),
        ),
    },
    {
      id: "eeat-audit",
      run: async () =>
        (await import("@/app/tools/eeat-audit/actions")).runEeatAudit(
          null,
          fd({ url: SITE }),
        ),
    },
    {
      id: "ai-schema",
      run: async () =>
        (await import("@/app/tools/ai-schema/actions")).runAiSchema(
          null,
          fd({ url: SITE }),
        ),
    },
    {
      id: "geo-score",
      run: async () =>
        (await import("@/app/tools/geo-score/actions")).runGeoScore(
          null,
          fd({ url: SITE }),
        ),
    },
    {
      id: "bulk-alt",
      run: async () =>
        (await import("@/app/tools/bulk-alt/actions")).runBulkAlt(
          null,
          fd({ url: "https://dicecodes.com/graphic-design-services/" }),
        ),
    },
    {
      id: "youtube-audit",
      run: async () =>
        (await import("@/app/tools/youtube-audit/actions")).runYtAudit(
          null,
          fd({
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            targetKeyword: "music video",
          }),
        ),
    },
    {
      id: "aio-passage",
      run: async () =>
        (await import("@/app/tools/aio-passage/actions")).analyzePassages(
          null,
          fd({ markdown: SAMPLE }),
        ),
    },
    {
      id: "ads-funnel",
      run: async () => {
        const f = fd({
            productName: "Website build",
            offer: "Free audit",
            audience: "small business owners",
            goal: "leads",
            niche: "services",
            landingUrl: SITE,
            monthlyBudgetUsd: "500",
        });
        // getAll("platforms"), so it needs a repeated field rather than one value.
        f.append("platforms", "google_search");
        return (await import("@/app/tools/ads-funnel/actions")).generateAdsFunnel(null, f);
      },
    },
    {
      id: "llms-txt (generate)",
      run: async () =>
        (await import("@/app/tools/llms-txt/actions")).generateLlmsTxt({
          url: SITE,
        }),
    },
    {
      id: "content-score",
      run: async () =>
        (await import("@/app/tools/content-score/actions")).scoreContent({ content: SAMPLE, targetKeyword: "web design punjab" }),
    },
    {
      id: "image-gen",
      skip: "Generates a billed image. Not run unattended.",
      run: async () => null,
    },
    {
      id: "plagiarism",
      skip: "Sends content to an external checker; nothing here to compare against.",
      run: async () => null,
    },
    {
      id: "screenshot-import",
      skip: "Needs an uploaded screenshot.",
      run: async () => null,
    },
    {
      id: "browser-agent",
      skip: "Drives a real browser session; too slow and stateful for a sweep.",
      run: async () => null,
    },
  ];
}

function verdict(r: unknown): { ok: boolean; note: string } {
  if (r === null || r === undefined) {
    return { ok: false, note: "returned null" };
  }
  if (typeof r === "object" && "ok" in r) {
    const o = r as { ok?: boolean; error?: string };
    if (o.ok === false) return { ok: false, note: String(o.error ?? "ok:false") };
    return { ok: true, note: JSON.stringify(r).slice(0, 90) };
  }
  return { ok: true, note: JSON.stringify(r).slice(0, 90) };
}

async function main() {
  const only = process.argv.slice(2);
  const list = cases().filter((c) => only.length === 0 || only.includes(c.id));
  let pass = 0;
  let fail = 0;
  let skipped = 0;

  for (const c of list) {
    if (c.skip) {
      console.log(`skip  ${c.id.padEnd(24)} ${c.skip}`);
      skipped++;
      continue;
    }
    const started = Date.now();
    try {
      const r = await c.run();
      const v = verdict(r);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `${v.ok ? "ok  " : "FAIL"}  ${c.id.padEnd(24)} ${secs}s  ${v.note}`,
      );
      if (v.ok) pass++;
      else fail++;
    } catch (err) {
      console.log(`THREW ${c.id.padEnd(24)} ${(err as Error).message.slice(0, 90)}`);
      fail++;
    }
    // Gemini's free tier is rate limited per minute. Pacing beats
    // reporting a quota refusal as a broken tool.
    await sleep(1500);
  }

  console.log(`\n${pass} ok, ${fail} failed, ${skipped} skipped`);
}

main().then(() => process.exit(0));
