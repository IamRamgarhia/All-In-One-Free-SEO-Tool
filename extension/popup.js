// Popup logic — captures the active tab info and offers to send it to the local app.
const STORAGE_KEY = "seo-tool-app-url";
const DEFAULT_URL = "http://localhost:3000";

const $ = (id) => document.getElementById(id);

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getAppUrl() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] || DEFAULT_URL;
}

async function setAppUrl(url) {
  await chrome.storage.local.set({ [STORAGE_KEY]: url.replace(/\/+$/, "") });
}

function setStatus(msg, level = "info") {
  const el = $("status");
  el.textContent = msg;
  el.className = `footer ${level === "ok" ? "ok" : level === "err" ? "err" : ""}`;
}

async function init() {
  const tab = await getActiveTab();
  $("title").textContent = tab?.title || "—";
  $("url").textContent = tab?.url || "—";

  const appUrl = await getAppUrl();
  $("app-url").value = appUrl;

  $("config-toggle").addEventListener("click", () => {
    $("config-panel").classList.toggle("open");
  });
  $("app-url").addEventListener("change", async (e) => {
    await setAppUrl(e.target.value);
    setStatus("App URL saved", "ok");
  });

  $("add-as-client").addEventListener("click", () =>
    openInApp(tab, "/clients/new"),
  );
  $("add-as-competitor").addEventListener("click", () =>
    openInApp(tab, "/competitors"),
  );
  $("track-changes").addEventListener("click", () =>
    openInApp(tab, "/monitor"),
  );
  $("audit-now").addEventListener("click", () =>
    openInApp(tab, "/grader"),
  );
}

async function openInApp(tab, path) {
  if (!tab?.url) {
    setStatus("No active tab", "err");
    return;
  }
  const appUrl = await getAppUrl();
  const sep = path.includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    url: tab.url,
    name: tab.title || "",
  });
  const target = `${appUrl}${path}${sep}${params.toString()}`;
  await chrome.tabs.create({ url: target });
  setStatus("Opened in SEO Tool", "ok");
}

init();
