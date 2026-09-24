/* Docs behaviour: theme, mobile nav, copy buttons, on-this-page
   highlighting, and a search that works with no server behind it.

   Everything degrades: with JavaScript off you still get every page,
   every link and the full text. Nothing here is required to read the
   documentation, which matters because this is the page someone lands
   on when the software is not working. */

(function () {
  "use strict";

  // ---- theme ---------------------------------------------------------
  // Dark by default to match the app. Remembered per browser; falls back
  // silently when storage is blocked (private windows, locked-down
  // browsers) rather than throwing on load.
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem("seo-docs-theme");
    if (saved) root.setAttribute("data-theme", saved);
  } catch (e) {}

  var toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("seo-docs-theme", next); } catch (e) {}
      toggle.textContent = next === "light" ? "Dark" : "Light";
    });
    toggle.textContent = root.getAttribute("data-theme") === "light" ? "Dark" : "Light";
  }

  // ---- mobile nav ----------------------------------------------------
  var menu = document.getElementById("menu-toggle");
  var sidebar = document.querySelector(".sidebar");
  if (menu && sidebar) {
    menu.addEventListener("click", function () {
      sidebar.classList.toggle("open");
      menu.setAttribute("aria-expanded", sidebar.classList.contains("open") ? "true" : "false");
    });
  }

  // ---- copy buttons on code blocks -----------------------------------
  Array.prototype.forEach.call(document.querySelectorAll("pre"), function (pre) {
    var b = document.createElement("button");
    b.className = "copy";
    b.type = "button";
    b.textContent = "Copy";
    b.addEventListener("click", function () {
      var text = pre.querySelector("code") ? pre.querySelector("code").innerText : pre.innerText;
      var done = function () {
        b.textContent = "Copied";
        setTimeout(function () { b.textContent = "Copy"; }, 1400);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { b.textContent = "Press Ctrl+C"; });
      } else {
        // Older browsers, and any page served over plain http, where the
        // async clipboard API is unavailable.
        var ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); } catch (e) { b.textContent = "Press Ctrl+C"; }
        document.body.removeChild(ta);
      }
    });
    pre.appendChild(b);
  });

  // ---- on this page --------------------------------------------------
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
  if (tocLinks.length && "IntersectionObserver" in window) {
    var byId = {};
    tocLinks.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { seen[en.target.id] = en.isIntersecting; });
      var current = null;
      Object.keys(byId).forEach(function (id) {
        if (seen[id] && !current) current = id;
      });
      tocLinks.forEach(function (a) {
        a.classList.toggle("active", current !== null && a.getAttribute("href") === "#" + current);
      });
    }, { rootMargin: "-80px 0px -70% 0px" });
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  // ---- search --------------------------------------------------------
  // The index is a plain JSON file written at build time. No service, no
  // third party, and it keeps working on a domain with nothing but static
  // hosting — which is the whole point of shipping docs as files.
  var input = document.getElementById("search");
  var results = document.getElementById("results");
  if (!input || !results) return;

  var index = null;
  var loading = false;

  function load() {
    if (index || loading) return;
    loading = true;
    var base = document.body.getAttribute("data-base") || "";
    fetch(base + "search-index.json")
      .then(function (r) { return r.json(); })
      .then(function (json) { index = json; loading = false; render(input.value); })
      .catch(function () { loading = false; });
  }

  function score(item, terms) {
    var hay = (item.title + " " + item.page + " " + item.text).toLowerCase();
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (hay.indexOf(t) === -1) return 0;
      total += item.title.toLowerCase().indexOf(t) !== -1 ? 12 : 1;
    }
    return total;
  }

  function render(q) {
    var query = (q || "").trim().toLowerCase();
    if (query.length < 2) { results.classList.remove("open"); results.innerHTML = ""; return; }
    if (!index) { load(); return; }

    var terms = query.split(/\s+/);
    var hits = index
      .map(function (item) { return { item: item, s: score(item, terms) }; })
      .filter(function (h) { return h.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, 8);

    if (!hits.length) {
      results.innerHTML = '<div class="empty">Nothing matches &ldquo;' +
        query.replace(/[<>&]/g, "") + '&rdquo;.</div>';
      results.classList.add("open");
      return;
    }

    var base = document.body.getAttribute("data-base") || "";
    results.innerHTML = hits.map(function (h, i) {
      return '<a href="' + base + h.item.url + '" class="' + (i === 0 ? "active" : "") + '">' +
        why(h.item) + "</a>";
    }).join("");
    results.classList.add("open");
  }

  function why(item) {
    return '<span class="r-title">' + item.title + "</span>" +
           '<span class="r-page">' + item.page + "</span>";
  }

  input.addEventListener("focus", load);
  input.addEventListener("input", function () { render(input.value); });

  input.addEventListener("keydown", function (e) {
    var open = results.classList.contains("open");
    if (e.key === "Escape") { results.classList.remove("open"); input.blur(); return; }
    if (!open) return;
    var links = Array.prototype.slice.call(results.querySelectorAll("a"));
    var at = links.findIndex ? links.findIndex(function (a) { return a.classList.contains("active"); }) : -1;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!links.length) return;
      var next = e.key === "ArrowDown" ? Math.min(links.length - 1, at + 1) : Math.max(0, at - 1);
      links.forEach(function (a) { a.classList.remove("active"); });
      links[next].classList.add("active");
    } else if (e.key === "Enter") {
      var active = results.querySelector("a.active");
      if (active) { e.preventDefault(); window.location.href = active.getAttribute("href"); }
    }
  });

  document.addEventListener("click", function (e) {
    if (!results.contains(e.target) && e.target !== input) results.classList.remove("open");
  });

  // "/" focuses search, the convention every docs site uses.
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
})();
