"use server";

import { z } from "zod";
import {
  buildCorpus,
  gradeAgainstCorpus,
  type CorpusInsights,
  type GradeResult,
} from "@/lib/content-grader";

const inputSchema = z.object({
  targetKeyword: z.string().trim().min(2).max(120),
  country: z.string().trim().min(2).max(8).default("US"),
  content: z.string().trim().min(50).max(80_000),
});

export type GradeContentState =
  | {
      ok: true;
      insights: CorpusInsights;
      grade: GradeResult;
      targetKeyword: string;
    }
  | { ok: false; error: string };

export async function gradeContent(
  _prev: GradeContentState | null,
  formData: FormData,
): Promise<GradeContentState> {
  const parsed = inputSchema.safeParse({
    targetKeyword: formData.get("targetKeyword"),
    country: formData.get("country") || "US",
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let insights: CorpusInsights;
  try {
    insights = await buildCorpus({
      targetKeyword: parsed.data.targetKeyword,
      country: parsed.data.country,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? "Corpus build failed" };
  }
  if (insights.corpusSize === 0) {
    return {
      ok: false,
      error: insights.error ?? "Couldn't build a SERP corpus for this keyword.",
    };
  }

  const grade = gradeAgainstCorpus({
    content: parsed.data.content,
    targetKeyword: parsed.data.targetKeyword,
    insights,
  });

  return {
    ok: true,
    insights,
    grade,
    targetKeyword: parsed.data.targetKeyword,
  };
}
