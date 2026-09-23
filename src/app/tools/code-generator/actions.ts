"use server";

import { callAI, lastAiFailure } from "@/lib/ai-call";
import { saveToolRun } from "@/lib/tool-runs";
import {
  TARGETS,
  type GeneratorTarget,
} from "@/lib/code-generator-types";

export type CodeGenResult = {
  ok: true;
  target: GeneratorTarget;
  taskDescription: string;
  code: string;
  installSteps: string[];
  warning?: string;
  preview: "iframe" | "syntax" | "none";
  language: string;
  fileExt: string;
};

export type CodeGenState =
  | CodeGenResult
  | { ok: false; error: string }
  | null;

/** Strip markdown fences if the AI ignored the "no fences" rule. */
function stripFences(s: string): string {
  return s
    .replace(/^```(?:\w+)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

export async function generateCode(
  _prev: CodeGenState,
  formData: FormData,
): Promise<CodeGenState> {
  const targetId = String(formData.get("target") ?? "") as GeneratorTarget;
  const task = String(formData.get("task") ?? "").trim();
  const constraints = String(formData.get("constraints") ?? "").trim();

  if (!targetId || !TARGETS[targetId]) {
    return { ok: false, error: "Pick a target output type." };
  }
  if (!task) {
    return { ok: false, error: "Describe what you want the code to do." };
  }
  if (task.length > 2000) {
    return { ok: false, error: "Keep the task description under 2000 chars." };
  }

  const spec = TARGETS[targetId];
  const userPrompt = `Task: ${task}${constraints ? `\n\nConstraints:\n${constraints}` : ""}\n\nGenerate the ${spec.label} now. Output ONLY the code as specified in your system prompt.`;

  const raw = await callAI({
    system: spec.systemPrompt,
    user: userPrompt,
    maxTokens: 3500,
    temperature: 0.2,
    feature: "general",
    ignoreCreditSaver: true,
    timeoutMs: 90_000,
  });

  if (!raw) {
    return {
      ok: false,
      error:
        lastAiFailure()?.message ?? "AI provider didn't respond. Make sure you've configured one in Settings → AI.",
    };
  }

  const code = stripFences(raw);
  if (code.length < 20) {
    return { ok: false, error: "Got an empty response — try rephrasing the task." };
  }

  const result: CodeGenResult = {
    ok: true,
    target: targetId,
    taskDescription: task,
    code,
    installSteps: spec.installSteps,
    warning: spec.warning,
    preview: spec.preview,
    language: spec.language,
    fileExt: spec.fileExt,
  };

  await saveToolRun({
    toolId: "code-generator",
    label: `${spec.label} · ${task.slice(0, 60)}`,
    input: { target: targetId, task: task.slice(0, 200) },
    result,
  }).catch(() => undefined);

  return result;
}
