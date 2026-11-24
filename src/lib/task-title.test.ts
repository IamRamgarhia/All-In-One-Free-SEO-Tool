import { describe, expect, it } from "vitest";
import { firstSentence } from "./audit-to-task";
import { taskTitle } from "./issue-display";

describe("firstSentence (task titles from findings)", () => {
  it("does not cut inside a file name or a version", () => {
    expect(firstSentence("The site publishes no llms.txt. Add one.")).toBe("The site publishes no llms.txt");
    expect(firstSentence("[Next.js] 23 <img> tags. Use next/image.")).toBe("[Next.js] 23 <img> tags");
    expect(firstSentence("39 sitemap URL(s) (67.2%) are not linked")).toBe("39 sitemap URL(s) (67.2%) are not linked");
  });
  it("keeps a title readable when the sentence is very long", () => {
    expect(firstSentence("a".repeat(400)).length).toBeLessThanOrEqual(160);
  });
});

describe("taskTitle", () => {
  it("reads a title stored in English in French", () => {
    expect(taskTitle("The site publishes no llms.txt", "fr")).toBe("Le site ne publie aucun llms.txt");
    expect(taskTitle("Authorship is not machine-readable", "fr")).toBe(
      "La paternité des contenus n’est pas lisible par une machine",
    );
  });
  it("keeps the page count", () => {
    expect(taskTitle("Meta description is too short (112 characters) (5 pages)", "fr")).toBe(
      "Méta-description trop courte (112 caractères) (5 pages)",
    );
  });
  it("leaves French titles, unknown titles and English readers alone", () => {
    expect(taskTitle("Raccourcir le title de 11 pages", "fr")).toBe("Raccourcir le title de 11 pages");
    expect(taskTitle("Call the client back", "fr")).toBe("Call the client back");
    expect(taskTitle("The site publishes no llms.txt", "en")).toBe("The site publishes no llms.txt");
  });
});

describe("decimals in French task titles", () => {
  it("writes 67,2 % with a comma and a no-break space", () => {
    expect(taskTitle("39 sitemap URL(s) (67.2%) are not linked from any crawled page", "fr")).toBe(
      "39 URL du sitemap (67,2\u00a0%) ne sont liées depuis aucune page explorée",
    );
    expect(taskTitle("12/40 images have alt text (30.5%)", "fr")).toBe(
      "12 images sur 40 ont un texte alternatif (30,5\u00a0%)",
    );
  });
});
