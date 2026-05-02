/**
 * Generates a real LLM-backed executive summary when an API key is set.
 * Falls back to template-based output otherwise.
 *
 * No SDK dependency — direct fetch to keep the binary small.
 */

export type ExecSummaryInput = {
  clientName: string;
  clientUrl: string;
  score: number | null;
  prevScore: number | null;
  totalTasks: number;
  doneTasks: number;
  openTasks: number;
  topIssues: { type: string; severity: string; message: string }[];
  techStack: string[] | null;
  niche: string | null;
  /** Real GSC + GA4 numbers when the client has Google linked */
  organicSessions?: number | null;
  organicSessionsDeltaPct?: number | null;
  topQueries?: { query: string; clicks: number; position: number }[];
  quickWinsCount?: number;
};

const SYSTEM_PROMPT = `You write SEO executive summaries for monthly reports.

Strict rules:
- Use the formula: [Direction] + [Win] + [Priority]. Three concise sentences max.
- First sentence: the direction (improved / dropped / held / first measurement) with the score and delta if any.
- Second sentence: the biggest win or notable item this period (work completed, areas improved).
- Third sentence: next priority — what to focus on next, grounded in the data given.
- No marketing fluff. No "we are excited to". Direct, factual, professional.
- Plain language. Use "you/your" where natural.
- Total length: 50-90 words.`;

export async function generateExecSummary(
  input: ExecSummaryInput,
): Promise<string> {
  const userPrompt = buildUserPrompt(input);
  const { getActiveProvider, getApiKey, getOllamaUrl } = await import(
    "./api-keys"
  );

  const active = await getActiveProvider();
  if (!active) return templateSummary(input);

  try {
    if (active === "gemini") {
      const k = await getApiKey("gemini");
      if (k) {
        const r = await callGemini(k, userPrompt);
        if (r) return r;
      }
    } else if (active === "groq") {
      const k = await getApiKey("groq");
      if (k) {
        const r = await callGroq(k, userPrompt);
        if (r) return r;
      }
    } else if (active === "anthropic") {
      const k = await getApiKey("anthropic");
      if (k) {
        const r = await callAnthropic(k, userPrompt);
        if (r) return r;
      }
    } else if (active === "openai") {
      const k = await getApiKey("openai");
      if (k) {
        const r = await callOpenAI(k, userPrompt);
        if (r) return r;
      }
    } else if (active === "openrouter") {
      const k = await getApiKey("openrouter");
      if (k) {
        const r = await callOpenRouter(k, userPrompt);
        if (r) return r;
      }
    } else if (active === "ollama") {
      const url = await getOllamaUrl();
      const r = await callOllama(url, userPrompt);
      if (r) return r;
    }
  } catch {
    /* fall through to template */
  }

  return templateSummary(input);
}

async function callGemini(
  apiKey: string,
  userPrompt: string,
): Promise<string | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${encodeURIComponent(apiKey)}`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: c.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }] },
        ],
        generationConfig: { maxOutputTokens: 400, temperature: 0.4 },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return (
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ||
      null
    );
  } finally {
    clearTimeout(t);
  }
}

async function callGroq(
  apiKey: string,
  userPrompt: string,
): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20_000);
  try {
    const res = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        signal: c.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 400,
          temperature: 0.4,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } finally {
    clearTimeout(t);
  }
}

async function callOpenRouter(
  apiKey: string,
  userPrompt: string,
): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20_000);
  try {
    const res = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        signal: c.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "x-title": "SEO Tool",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.3-70b-instruct:free",
          max_tokens: 400,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } finally {
    clearTimeout(t);
  }
}

async function callOllama(
  baseUrl: string,
  userPrompt: string,
): Promise<string | null> {
  const models = ["llama3.2", "llama3.1", "mistral", "phi3"];
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 60_000);
  try {
    for (const model of models) {
      try {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          signal: c.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
            ],
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            message?: { content?: string };
          };
          const text = data.message?.content?.trim();
          if (text) return text;
        }
      } catch {
        /* try next */
      }
    }
    return null;
  } finally {
    clearTimeout(t);
  }
}

function buildUserPrompt(input: ExecSummaryInput): string {
  const lines: string[] = [];
  lines.push(`Client: ${input.clientName} (${input.clientUrl})`);
  if (input.niche) lines.push(`Niche: ${input.niche}`);
  if (input.techStack?.length)
    lines.push(`Tech stack: ${input.techStack.join(", ")}`);

  if (input.score !== null && input.prevScore !== null) {
    const delta = input.score - input.prevScore;
    lines.push(
      `Health score: ${input.score}/100 (${delta > 0 ? "+" : ""}${delta} vs last audit, was ${input.prevScore})`,
    );
  } else if (input.score !== null) {
    lines.push(`Health score: ${input.score}/100 (first measurement)`);
  } else {
    lines.push("Health score: not yet measured");
  }

  lines.push(
    `Tasks: ${input.doneTasks} done / ${input.openTasks} open / ${input.totalTasks} total`,
  );

  if (input.topIssues.length > 0) {
    lines.push("Top issues to address:");
    for (const i of input.topIssues.slice(0, 5)) {
      lines.push(`- [${i.severity}] ${i.type}: ${i.message}`);
    }
  } else {
    lines.push("Top issues: none significant.");
  }

  // Real Google data when available — heavily weight this in the summary
  if (typeof input.organicSessions === "number") {
    const trend =
      typeof input.organicSessionsDeltaPct === "number"
        ? ` (${input.organicSessionsDeltaPct > 0 ? "+" : ""}${input.organicSessionsDeltaPct}% vs prior period)`
        : "";
    lines.push(
      `Organic sessions (last 28 days): ${input.organicSessions.toLocaleString()}${trend}`,
    );
  }
  if (input.topQueries?.length) {
    lines.push("Top organic queries:");
    for (const q of input.topQueries.slice(0, 5)) {
      lines.push(
        `- "${q.query}" — ${q.clicks} clicks at position ${q.position.toFixed(1)}`,
      );
    }
  }
  if (typeof input.quickWinsCount === "number" && input.quickWinsCount > 0) {
    lines.push(
      `Quick-win keywords (positions 4-15 with traffic): ${input.quickWinsCount}`,
    );
  }

  lines.push("");
  lines.push("Write the executive summary now.");
  return lines.join("\n");
}

async function callAnthropic(
  apiKey: string,
  userPrompt: string,
): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: c.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = data.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function callOpenAI(
  apiKey: string,
  userPrompt: string,
): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: c.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 400,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Template-based fallback when no API key is configured.
 * Same formula CLAUDE.md spec'd: [Direction] + [Win] + [Priority].
 */
function templateSummary(input: ExecSummaryInput): string {
  const parts: string[] = [];

  if (input.score !== null && input.prevScore !== null) {
    const delta = input.score - input.prevScore;
    if (Math.abs(delta) < 2) {
      parts.push(
        `${input.clientName}'s health score held steady at ${input.score}/100 this period.`,
      );
    } else if (delta > 0) {
      parts.push(
        `${input.clientName}'s health score improved by ${delta} points this period to ${input.score}/100.`,
      );
    } else {
      parts.push(
        `${input.clientName}'s health score dropped ${Math.abs(delta)} points this period to ${input.score}/100.`,
      );
    }
  } else if (input.score !== null) {
    parts.push(
      `${input.clientName} now has a baseline health score of ${input.score}/100 — first measurement.`,
    );
  } else {
    parts.push(`${input.clientName} has no completed audit yet.`);
  }

  if (input.doneTasks > 0) {
    parts.push(
      `We closed ${input.doneTasks} of ${input.totalTasks} open SEO tasks.`,
    );
  } else if (input.totalTasks > 0) {
    parts.push(
      `${input.totalTasks} SEO tasks are queued — no completions logged yet.`,
    );
  }

  const top = input.topIssues[0];
  if (top) {
    parts.push(`Next focus: ${top.message.toLowerCase()}`);
  }

  return parts.join(" ");
}
