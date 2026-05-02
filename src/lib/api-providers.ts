/**
 * Pure catalog of LLM providers — no DB / no server-only imports.
 * Safe to use from client components.
 */

export type Provider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "perplexity"
  | "openrouter"
  | "groq";

export const PROVIDER_CATALOG: {
  id: Provider | "ollama";
  label: string;
  tier: "free" | "free-tier" | "paid";
  description: string;
  keyUrl: string;
  keyUrlLabel: string;
  envVar: string;
  notes?: string;
  keyPrefix?: string;
  steps: string[];
}[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    tier: "free",
    description:
      "Google's Gemini 1.5 Flash. 15 req/min, 1,500/day on the free tier — just need a Google account.",
    keyUrl: "https://aistudio.google.com/apikey",
    keyUrlLabel: "Google AI Studio",
    envVar: "GEMINI_API_KEY",
    notes: "Best free option for chat / summaries.",
    keyPrefix: "AIza",
    steps: [
      "Click 'Open Google AI Studio' → sign in with your Google account.",
      "Click 'Create API key' (top right). Pick 'Create API key in new project' if prompted.",
      "Copy the key shown (starts with AIza...).",
      "Paste it below and click Save.",
    ],
  },
  {
    id: "groq",
    label: "Groq",
    tier: "free",
    description:
      "Fastest inference available — Llama 3.3, Mixtral. Free tier with high rate limits, no credit card needed.",
    keyUrl: "https://console.groq.com/keys",
    keyUrlLabel: "Groq Console",
    envVar: "GROQ_API_KEY",
    notes: "Fast and free — top pick for the AI assistant.",
    keyPrefix: "gsk_",
    steps: [
      "Click 'Open Groq Console' → sign up (Google or GitHub login, no card).",
      "On the API Keys page, click 'Create API Key'. Give it any name.",
      "Copy the key shown once (starts with gsk_).",
      "Paste it below and click Save.",
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    tier: "free-tier",
    description:
      "Aggregator giving you one key for many models, including free `:free` variants of Llama and others.",
    keyUrl: "https://openrouter.ai/keys",
    keyUrlLabel: "OpenRouter Keys",
    envVar: "OPENROUTER_API_KEY",
    notes: "One key, dozens of models. Free tier requires no payment.",
    keyPrefix: "sk-or-",
    steps: [
      "Click 'Open OpenRouter Keys' → sign up (Google login, no card needed for free tier).",
      "Click 'Create Key'. Give it a name.",
      "Copy the key shown (starts with sk-or-).",
      "Paste it below and click Save.",
    ],
  },
  {
    id: "perplexity",
    label: "Perplexity",
    tier: "free-tier",
    description:
      "Sonar API returns native citations — primary recommendation for AI visibility tracking. Free credits monthly.",
    keyUrl: "https://www.perplexity.ai/settings/api",
    keyUrlLabel: "Perplexity API Settings",
    envVar: "PERPLEXITY_API_KEY",
    notes: "PRIMARY for AI visibility tracking — citations built in.",
    keyPrefix: "pplx-",
    steps: [
      "Click 'Open Perplexity API Settings' → sign in (or create a free account).",
      "Add a payment method. Free monthly credits cover most personal use.",
      "Click 'Generate' to create a new API key.",
      "Copy (starts with pplx-) and paste below.",
    ],
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    tier: "free",
    description:
      "Runs LLMs entirely on your computer. Zero API cost, full privacy. Needs ~4–8GB RAM for a 3B/7B model.",
    keyUrl: "https://ollama.com/download",
    keyUrlLabel: "Download Ollama",
    envVar: "OLLAMA_URL",
    notes: "Zero API cost forever. Slower on small machines.",
    steps: [
      "Click 'Download Ollama' → install for Windows / Mac / Linux.",
      "Launch Ollama (it runs as a background service).",
      "Open a terminal and run: ollama pull llama3.2 (downloads ~2 GB).",
      "Leave the field below as http://localhost:11434 and click Save — Ollama is ready.",
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    tier: "paid",
    description:
      "Claude Haiku 4.5 / Sonnet 4.6 / Opus 4.7. New accounts get $5 free credits.",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyUrlLabel: "Anthropic Console",
    envVar: "ANTHROPIC_API_KEY",
    notes: "Highest quality. Use after free options if you need nuance.",
    keyPrefix: "sk-ant-",
    steps: [
      "Click 'Open Anthropic Console' → sign up (gets $5 free credits).",
      "On the API Keys page, click 'Create Key'. Give it any name.",
      "Copy (starts with sk-ant-) immediately — it's only shown once.",
      "Paste it below and click Save.",
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    tier: "paid",
    description:
      "GPT-4o-mini and GPT-4o. Pay-as-you-go, $5 minimum to start. No free tier on API.",
    keyUrl: "https://platform.openai.com/api-keys",
    keyUrlLabel: "OpenAI Platform",
    envVar: "OPENAI_API_KEY",
    notes: "Use Gemini or Groq first — same quality for free.",
    keyPrefix: "sk-",
    steps: [
      "Click 'Open OpenAI Platform' → sign up.",
      "Add a payment method ($5 minimum required).",
      "Click 'Create new secret key'.",
      "Copy (starts with sk-) immediately. Paste below and save.",
    ],
  },
];
