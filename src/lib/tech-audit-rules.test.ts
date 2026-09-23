/**
 * WordPress plain-permalink detection, on markup from a live client page.
 *
 * WordPress core prints <link rel='shortlink' href='https://site/?p=ID'>
 * in the head of every post and page regardless of the permalink
 * setting. The rule matched any href containing /?p=, so a site whose
 * URLs are /contact-us/ was told, at high severity on 14 pages, to switch
 * to post-name permalinks and redirect its old ?p= URLs.
 */

import { describe, expect, it } from "vitest";
import { classifyTech, runTechSpecificChecks } from "./tech-audit-rules";

const wordpress = classifyTech(["WordPress"]);
const permalinkFindings = (html: string, url = "https://dicecodes.com/contact-us/") =>
  runTechSpecificChecks({ url, html, headers: new Headers(), tech: wordpress }).filter(
    (f) => f.type === "wp_default_permalinks",
  );

// Verbatim from the head of https://dicecodes.com/contact-us/, September 2026.
const SHORTLINK = "<link rel='shortlink' href='https://dicecodes.com/?p=10495' />";
const page = (body: string) => `<html><head>${SHORTLINK}</head><body>${body}</body></html>`;

describe("WordPress plain permalinks", () => {
  it("is running against a WordPress context", () => {
    // Guards the guard: without this the rule never runs and every
    // "not flagged" below would pass for the wrong reason.
    expect(wordpress.isWordPress).toBe(true);
    expect(permalinkFindings(page('<a href="/?p=42">Old post</a>'))).toHaveLength(1);
  });

  it("ignores the shortlink WordPress adds to every page", () => {
    expect(
      permalinkFindings(page('<a href="https://dicecodes.com/digital-marketing/">Digital marketing</a>')),
    ).toEqual([]);
  });

  it("was fooled by that shortlink before", () => {
    expect(/href=["'][^"']*\/\?p=\d+/i.test(SHORTLINK)).toBe(true);
  });

  it("flags a ?page_id= link, the plain permalink for a page, with or without www", () => {
    expect(permalinkFindings(page('<a href="https://www.dicecodes.com/?page_id=2">About</a>'))).toHaveLength(1);
  });

  it("does not flag a link to another site's ?p= URL", () => {
    expect(permalinkFindings(page('<a href="https://other.example/?p=9">Their post</a>'))).toEqual([]);
  });

  it("does not flag a non-numeric p parameter", () => {
    expect(permalinkFindings(page('<a href="/search?p=tape">Search</a>'))).toEqual([]);
  });
});
