// Content script — runs on every page. Currently passive: it just listens for
// messages from the popup/background to extract page metadata (title, meta
// description, h1, canonical) on demand. Doing it here lets the rest of the
// extension stay HTML-agnostic.

function extractMeta(name) {
  const m = document.querySelector(`meta[name="${name}"]`);
  return m?.getAttribute("content") ?? null;
}

function extractProperty(prop) {
  const m = document.querySelector(`meta[property="${prop}"]`);
  return m?.getAttribute("content") ?? null;
}

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (req.kind === "get-page-meta") {
    sendResponse({
      url: location.href,
      title: document.title,
      description: extractMeta("description"),
      h1: document.querySelector("h1")?.innerText ?? null,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
      ogTitle: extractProperty("og:title"),
      ogImage: extractProperty("og:image"),
    });
    return true;
  }
});
