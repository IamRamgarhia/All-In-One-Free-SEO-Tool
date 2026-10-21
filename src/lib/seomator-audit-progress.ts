import type { CategoryResult } from "@seomator/seo-audit";
import { categoryLabel, seomatorCategories } from "@/lib/seomator-meta";

export type SeomatorCategoryProgress = {
  id: string;
  name: string;
  status: "pending" | "running" | "complete";
  score?: number;
  passCount?: number;
  warnCount?: number;
  failCount?: number;
  notMeasuredCount?: number;
};

export type SeomatorAuditProgress = {
  phase: "crawl" | "categories" | "done";
  categories: SeomatorCategoryProgress[];
  currentCategoryId: string | null;
  currentRuleName: string | null;
  pagesCrawled: number;
  updatedAt: string;
};

export function initialSeomatorProgress(
  categoryIds: string[],
): SeomatorAuditProgress {
  const order = seomatorCategories().map((c) => c.id);
  const sorted = categoryIds.slice().sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  return {
    phase: "crawl",
    categories: sorted.map((id) => ({
      id,
      name: categoryLabel(id),
      status: "pending",
    })),
    currentCategoryId: null,
    currentRuleName: null,
    pagesCrawled: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function progressOnCategoryStart(
  progress: SeomatorAuditProgress,
  categoryId: string,
  categoryName: string,
): SeomatorAuditProgress {
  const categories = progress.categories.map((c) => {
    if (c.id === categoryId) {
      return { ...c, name: categoryName, status: "running" as const };
    }
    return c;
  });
  return {
    ...progress,
    phase: "categories",
    categories,
    currentCategoryId: categoryId,
    currentRuleName: null,
    updatedAt: new Date().toISOString(),
  };
}

export function progressOnCategoryComplete(
  progress: SeomatorAuditProgress,
  categoryId: string,
  result: CategoryResult,
): SeomatorAuditProgress {
  const categories = progress.categories.map((c) => {
    if (c.id !== categoryId) return c;
    return {
      ...c,
      status: "complete" as const,
      score: result.score,
      passCount: result.passCount,
      warnCount: result.warnCount,
      failCount: result.failCount,
      notMeasuredCount: result.notMeasuredCount,
    };
  });
  return {
    ...progress,
    phase: "categories",
    categories,
    currentCategoryId: null,
    currentRuleName: null,
    updatedAt: new Date().toISOString(),
  };
}

export function progressOnRuleComplete(
  progress: SeomatorAuditProgress,
  ruleName: string,
): SeomatorAuditProgress {
  return {
    ...progress,
    currentRuleName: ruleName,
    updatedAt: new Date().toISOString(),
  };
}

export function progressOnCrawl(pagesCrawled: number): Partial<SeomatorAuditProgress> {
  return {
    pagesCrawled,
    phase: pagesCrawled > 0 ? "crawl" : "crawl",
    updatedAt: new Date().toISOString(),
  };
}
