// Right-click context menu — quick "Send to SEO tool" actions on any link or page.
const STORAGE_KEY = "seo-tool-app-url";
const DEFAULT_URL = "http://localhost:3000";

async function getAppUrl() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] || DEFAULT_URL;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "seo-add-client",
      title: "Add this site as a client",
      contexts: ["page", "link"],
    });
    chrome.contextMenus.create({
      id: "seo-add-competitor",
      title: "Add as competitor",
      contexts: ["page", "link"],
    });
    chrome.contextMenus.create({
      id: "seo-audit",
      title: "Audit this URL",
      contexts: ["page", "link"],
    });
    chrome.contextMenus.create({
      id: "seo-monitor",
      title: "Watch this page for changes",
      contexts: ["page", "link"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const targetUrl = info.linkUrl || info.pageUrl || tab?.url;
  if (!targetUrl) return;

  const appUrl = await getAppUrl();
  const params = new URLSearchParams({
    url: targetUrl,
    name: tab?.title || "",
  });

  let path = "/clients/new";
  if (info.menuItemId === "seo-add-competitor") path = "/competitors";
  else if (info.menuItemId === "seo-audit") path = "/grader";
  else if (info.menuItemId === "seo-monitor") path = "/monitor";

  const sep = path.includes("?") ? "&" : "?";
  await chrome.tabs.create({ url: `${appUrl}${path}${sep}${params.toString()}` });
});
