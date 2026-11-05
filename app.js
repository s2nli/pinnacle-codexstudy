(function applySavedTheme() {
  const saved = localStorage.getItem("codex-studys-theme");
  if (!saved || saved === "system") return;
  document.documentElement.setAttribute("data-theme", saved);
})();

const FALLBACK_THUMB = "assets/codex-telegram.png";
let allBatches = [];
let activeFilter = "all";
let searchQuery = "";
let sortMode = "relevance";
let langFilter = "all";
let visibleCount = 24;
const PAGE_SIZE = 24;

const $ = (selector) => document.querySelector(selector);
const THUMB_PLACEHOLDER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
window.__thumbFallback = (img) => { img.outerHTML = THUMB_PLACEHOLDER_SVG; };
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[character]));
}

function categoryFor(batch) {
  const text = `${batch.name || ""} ${batch.byName || ""}`.toLowerCase();
  if (/\bjee\b|iit/.test(text)) return "jee";
  if (/neet|medical/.test(text)) return "neet";
  if (/class|cbse|icse|school|commerce|humanities/.test(text)) return "school";
  return "exam";
}

function deepSearchText(batch) {
  if (batch.__searchText) return batch.__searchText;
  const parts = [batch.name, batch.byName, batch.language, batch.type, (batch.slug || "").replace(/-/g, " ")];
  (batch.subBatches || []).forEach((sub) => parts.push(sub.name, sub.byName));
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  Object.defineProperty(batch, "__searchText", { value: text, enumerable: false, writable: true });
  return text;
}

function deepSearchScore(batch, queryWords, rawQuery) {
  const name = (batch.name || "").toLowerCase();
  const text = deepSearchText(batch);
  if (!queryWords.every((word) => text.includes(word))) return 0;
  if (name === rawQuery) return 100;
  if (name.startsWith(rawQuery)) return 80;
  if (name.includes(rawQuery)) return 60;
  if (queryWords.every((word) => name.includes(word))) return 40;
  return 20;
}

function deepSearch(batches, query) {
  const rawQuery = query.trim().toLowerCase();
  if (!rawQuery) return batches;
  const queryWords = rawQuery.split(/\s+/).filter(Boolean);
  return batches
    .map((batch) => ({ batch, score: deepSearchScore(batch, queryWords, rawQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.batch);
}

function openBatch(batch) {
  // No external stream redirect: open the in-app details view instead.
  if (!batch || !(batch._id || batch.batch_id)) return showToast("This course is not available right now.");
  openDetail(batch);
}

function getRecentlyViewed() { return []; }

function setupQuickInstall() {
  const button = document.getElementById("installQuickBtn");
  if (!button) return;
  button.addEventListener("click", () => openModal("installModal"));
}

function getFavorites() {
  try { return JSON.parse(localStorage.getItem("codex-studys-favorites") || "[]"); }
  catch { return []; }
}

function isFavorite(id) {
  return getFavorites().includes(id);
}

function toggleFavorite(id) {
  const favorites = getFavorites();
  const index = favorites.indexOf(id);
  if (index === -1) favorites.push(id); else favorites.splice(index, 1);
  localStorage.setItem("codex-studys-favorites", JSON.stringify(favorites));
  return favorites.includes(id);
}

function updateFavoritesCount() {
  const count = getFavorites().length;
  const button = $('.filter-row .filter[data-filter="favorites"]');
  if (button) button.textContent = count ? `❤ Favorite Batches (${count})` : "❤ Favorite Batches";
  const navBadge = $("#favNavBadge");
  if (navBadge) {
    navBadge.textContent = String(count);
    navBadge.style.display = count ? "grid" : "none";
  }
  const statFav = $("#statFav");
  if (statFav) statFav.textContent = count.toLocaleString();
}

function filteredBatches() {
  let batches;
  if (activeFilter === "favorites") {
    const favorites = getFavorites();
    batches = allBatches.filter((batch) => favorites.includes(batch._id || batch.batch_id || ""));
  } else {
    batches = allBatches.filter((batch) => activeFilter === "all" || categoryFor(batch) === activeFilter);
  }
  if (langFilter !== "all") {
    batches = batches.filter((batch) => (batch.language || "").toLowerCase().includes(langFilter));
  }
  if (searchQuery.trim()) {
    batches = deepSearch(batches, searchQuery);
  }
  if (sortMode === "az") {
    batches = [...batches].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } else if (sortMode === "za") {
    batches = [...batches].sort((a, b) => (b.name || "").localeCompare(a.name || ""));
  } else if (sortMode === "newest") {
    batches = [...batches].sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));
  }
  return batches;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date)) return "";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function isRecent(value) {
  if (!value) return false;
  const date = new Date(value);
  if (isNaN(date)) return false;
  const days = (Date.now() - date.getTime()) / 86400000;
  return days >= 0 && days <= 21;
}

function courseCard(batch) {
  const title = escapeHtml(batch.name || "Untitled course");
  const description = escapeHtml(batch.byName || "Structured learning for your next milestone");
  const language = escapeHtml(batch.language || "Self-paced");
  const category = categoryFor(batch);
  const image = escapeHtml(batch.previewImage || FALLBACK_THUMB);
  const id = escapeHtml(batch._id || batch.batch_id || "");
  const favActive = isFavorite(id);
  const startDate = formatDate(batch.startDate);
  const fresh = isRecent(batch.startDate);
  return `
    <article class="course-card" data-id="${id}" tabindex="0" role="button" aria-label="Open ${title}">
      <div class="course-thumb">
        <div class="thumb-fallback thumb-shimmer"></div>
        <img src="${image}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('loaded');this.previousElementSibling.style.display='none'" onerror="this.style.display='none'">
        <span class="course-tag">${escapeHtml(category)}</span>
        ${fresh ? '<span class="course-tag course-tag-new">NEW</span>' : ""}
        <button class="fav-btn${favActive ? " active" : ""}" type="button" data-fav-id="${id}" aria-label="${favActive ? "Remove from favorites" : "Add to favorites"}" aria-pressed="${favActive}">
          <svg viewBox="0 0 24 24" fill="${favActive ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.2-4.5-9.6-9C.6 8.1 2.4 4.5 6 4.2c2.1-.15 3.6 1.05 6 3.3 2.4-2.25 3.9-3.45 6-3.3 3.6.3 5.4 3.9 3.6 7.8-2.4 4.5-9.6 9-9.6 9Z"/></svg>
        </button>
        <button class="info-btn" type="button" data-info-id="${id}" aria-label="Quick view details">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.6"/></svg>
        </button>
        ${getNote(id) ? '<span class="note-badge">📝 Note</span>' : ""}
      </div>
      <div class="course-chips"><span class="chip">${language}</span><span class="chip chip-accent">${escapeHtml(category)}</span></div>
      <div class="course-body">
        <h3 class="course-title">${title}</h3>
        <p class="course-description">${description}</p>
        <div class="course-meta"><span>${startDate ? `📅 ${startDate}` : language}</span><button class="course-cta" type="button">Let's Study <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>
      </div>
    </article>`;
}

function syncUrlParams() {
  const params = new URLSearchParams();
  if (activeFilter !== "all") params.set("filter", activeFilter);
  if (searchQuery.trim()) params.set("q", searchQuery.trim());
  if (sortMode !== "relevance") params.set("sort", sortMode);
  if (langFilter !== "all") params.set("lang", langFilter);
  if (currentView === "books") return; // landing on E-Books: keep the URL clean
  const query = params.toString();
  const newUrl = (query ? `${window.location.pathname}?${query}` : window.location.pathname) + "#courses";
  window.history.replaceState(null, "", newUrl);
}

function renderBatches() {
  const grid = $("#batchGrid");
  const loadMoreBtn = $("#loadMoreBtn");
  const batches = filteredBatches();
  const visible = batches.slice(0, visibleCount);
  const filterLabel = activeFilter === "all" ? "courses" : activeFilter === "favorites" ? "favorite courses" : `${activeFilter.toUpperCase()} courses`;
  const noteText = batches.length
    ? `Showing ${visible.length} of ${batches.length.toLocaleString()} ${filterLabel}.`
    : activeFilter === "favorites" ? "No favorites yet. Tap the heart on any course to save it here." : allBatches.length ? "No courses matched that filter yet." : "No courses published yet.";
  $("#resultsNote").textContent = noteText;
  const announcer = $("#filterAnnouncer");
  if (announcer) announcer.textContent = noteText;
  grid.innerHTML = visible.length ? visible.map(courseCard).join("") : (allBatches.length ? '<div class="empty">Try another category or search the full library.</div>' : '<div class="empty">New courses are coming soon. Meanwhile, explore the <a href="#books" class="empty-link">E-Books library</a>.</div>');
  $$(".course-card").forEach((card, index) => {
    card.addEventListener("click", () => openBatch(visible[index]));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openBatch(visible[index]);
      }
    });
  });
  $$(".fav-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const nowActive = toggleFavorite(button.dataset.favId);
      button.classList.toggle("active", nowActive);
      button.setAttribute("aria-pressed", String(nowActive));
      button.querySelector("svg").setAttribute("fill", nowActive ? "currentColor" : "none");
      if (nowActive) {
        button.classList.remove("pop");
        void button.offsetWidth;
        button.classList.add("pop");
      }
      if (activeFilter === "favorites" && !nowActive) renderBatches();
      updateFavoritesCount();
    });
  });
  $$(".info-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const batch = visible.find((item) => (item._id || item.batch_id || "") === button.dataset.infoId);
      if (batch) openDetail(batch);
    });
  });
  if (loadMoreBtn) {
    const remaining = batches.length - visible.length;
    loadMoreBtn.style.display = remaining > 0 ? "inline-flex" : "none";
    loadMoreBtn.textContent = remaining > 0 ? "Loading more courses…" : "";
  }
  const clearBtn = $("#clearFiltersBtn");
  if (clearBtn) clearBtn.style.display = (activeFilter !== "all" || searchQuery.trim()) ? "inline-flex" : "none";
  syncUrlParams();
}

function getSearchHistory() { return []; }
function addSearchHistory() {}

function highlightMatch(text, query) {
  const safe = escapeHtml(text || "");
  if (!query) return safe;
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean).map((w) => escapeHtml(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return safe;
  return safe.replace(new RegExp(`(${words.join("|")})`, "gi"), "<mark>$1</mark>");
}

function renderSearchResults(query = "") {
  const results = $("#searchResults");
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    results.innerHTML = '<div class="search-hint">Start typing to find your next course.</div>';
    return;
  }
  const matches = deepSearch(allBatches, normalized).slice(0, 40);
  if (!matches.length) {
    results.innerHTML = '<div class="search-hint">No matches yet. Try a subject, exam or class.</div>';
    return;
  }
  results.innerHTML = `<div class="search-hint" style="text-align:left;margin-bottom:2px;">${matches.length} result${matches.length === 1 ? "" : "s"}</div>` + matches.map((batch) => `
    <div class="search-result" data-id="${escapeHtml(batch._id || batch.batch_id || "")}">
      <div class="search-result-thumb">${batch.previewImage ? `<img src="${escapeHtml(batch.previewImage)}" alt="" referrerpolicy="no-referrer" onerror="window.__thumbFallback(this)">` : THUMB_PLACEHOLDER_SVG}</div>
      <div><strong>${highlightMatch(batch.name || "Untitled course", normalized)}</strong><small>${escapeHtml(batch.byName || batch.language || "Course")}</small></div>
      ${isRecent(batch.startDate) ? '<span class="search-new-badge">new</span>' : ""}
    </div>`).join("");
  $$(".search-result").forEach((result, index) => result.addEventListener("click", () => {
    openBatch(matches[index]);
    closeModal("searchModal");
  }));
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  $$(".overlay.visible").forEach((other) => { if (other.id !== id) other.classList.remove("visible"); });
  modal.classList.add("visible");
  document.body.classList.add("modal-open");
  modal.querySelector("input")?.focus();
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("visible");
  if (!$$(".overlay.visible").length) document.body.classList.remove("modal-open");
}

function showToast(message, type) {
  const oldToast = $(".toast");
  oldToast?.remove();
  const toast = document.createElement("div");
  toast.className = type === "error" ? "toast toast-error" : "toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), type === "error" ? 4200 : 2800);
}

const BATCH_CACHE_KEY = "cx-batches-cache-v2";

/* One-time cleanup of keys written by the previous external-course flow */
(function purgeLegacyPwData() {
  try {
    ["codex-studys-recent", "codex-studys-search-history", "cx-batches-cache-v1"].forEach((k) => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
    sessionStorage.removeItem("cx-scroll");
    const fav = JSON.parse(localStorage.getItem("codex-studys-favorites") || "[]");
    if (Array.isArray(fav) && fav.length) localStorage.setItem("codex-studys-favorites", JSON.stringify(fav.filter((id) => !/^[a-f0-9]{24}$/i.test(String(id)))));
    const notes = JSON.parse(localStorage.getItem("codex-studys-notes") || "{}");
    Object.keys(notes).forEach((id) => { if (/^[a-f0-9]{24}$/i.test(id)) delete notes[id]; });
    localStorage.setItem("codex-studys-notes", JSON.stringify(notes));
  } catch (e) {}
})();

function readBatchCache() {
  try {
    const raw = sessionStorage.getItem(BATCH_CACHE_KEY);
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) && list.length ? list : null;
  } catch (e) { return null; }
}

function restoreScroll() {
  try {
    const y = Number(sessionStorage.getItem("cx-scroll") || 0);
    sessionStorage.removeItem("cx-scroll");
    if (y > 0) window.requestAnimationFrame(() => window.scrollTo(0, y));
  } catch (e) {}
}

async function loadBatches() {
  const cached = readBatchCache();
  let usedCache = false;
  try {
    const grid = $("#batchGrid");
    if (cached) {
      // coming back from a batch: show the list instantly, refresh quietly in the background
      allBatches = cached;
      usedCache = true;
      updateStats();
      renderBatches();
      $("#globalPreloader").classList.add("hidden");
      restoreScroll();
    } else if (grid && !allBatches.length) {
      grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton-card"><div class="skeleton-thumb"></div><div class="skeleton-body"><div class="skeleton-line" style="width:88%"></div><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:40%"></div></div></div>').join("");
    }
    const response = await fetch("batches.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Course library unavailable");
    const data = await response.json();
    const fresh = Array.isArray(data.batches) ? data.batches : [];
    const changed = JSON.stringify(fresh) !== JSON.stringify(allBatches);
    allBatches = fresh;
    try { sessionStorage.setItem(BATCH_CACHE_KEY, JSON.stringify(fresh)); sessionStorage.setItem("cx-loaded", "1"); } catch (e) {}
    if (changed || !usedCache) { updateStats(); renderBatches(); }
    const updatedNote = $("#dataUpdatedNote");
    if (updatedNote) updatedNote.textContent = `· library refreshed ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    console.error(error);
    if (!usedCache) {
      $("#resultsNote").textContent = "The course library could not be loaded.";
      $("#batchGrid").innerHTML = '<div class="empty">Please refresh to reconnect to the course library.</div>';
      showToast("Course library unavailable");
    }
  } finally {
    $("#globalPreloader").classList.add("hidden");
  }
}

function setupNavigation() {
  const menu = $("#navLinks");
  const menuButton = $("#menuBtn");
  menuButton.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
  });
  $$(".nav-link").forEach((link) => link.addEventListener("click", () => {
    menu.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
  }));
  setupViewRouting();
}

function setupHeaderActions() {
  const refreshBtn = $("#refreshBtn");
  refreshBtn?.addEventListener("click", async () => {
    if (refreshBtn.classList.contains("spinning")) return;
    refreshBtn.classList.add("spinning");
    await loadBatches();
    showToast("Course library refreshed.");
    refreshBtn.classList.remove("spinning");
  });
  $("#favNavBtn")?.addEventListener("click", () => {
    activeFilter = "favorites";
    localStorage.setItem("codex-studys-last-filter", "favorites");
    visibleCount = PAGE_SIZE;
    $$(".filter-row .filter").forEach((item) => item.classList.toggle("active", item.dataset.filter === "favorites"));
    renderBatches();
    setView("courses", { scroll: false });
    $("#courses")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function setupModals() {
  $("#searchBtn").addEventListener("click", () => {
    openModal("searchModal");
    renderSearchResults($("#searchInput").value);
  });
  let modalSearchDebounce;
  $("#searchInput").addEventListener("input", (event) => {
    const value = event.target.value;
    clearTimeout(modalSearchDebounce);
    modalSearchDebounce = setTimeout(() => renderSearchResults(value), 120);
  });
  $("#searchInput").addEventListener("keydown", (event) => {
    /* search history intentionally not stored */
  });
  $$("[data-close]").forEach((button) => button.addEventListener("click", () => closeModal(button.dataset.close)));
  $$(".overlay").forEach((overlay) => overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal(overlay.id);
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") $$(".overlay.visible").forEach((modal) => closeModal(modal.id));
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openModal("searchModal");
      renderSearchResults($("#searchInput").value);
    }
  });
}

function setupFilters() {
  updateFavoritesCount();
  const filterKey = "codex-studys-last-filter";
  const urlParams = new URLSearchParams(window.location.search);
  const urlFilter = urlParams.get("filter");
  const urlQuery = urlParams.get("q");
  const urlSort = urlParams.get("sort");
  const savedFilter = urlFilter || localStorage.getItem(filterKey);
  const savedButton = savedFilter && $(`.filter-row .filter[data-filter="${savedFilter}"]`);
  if (savedButton) {
    activeFilter = savedFilter;
    $$(".filter-row .filter").forEach((item) => item.classList.toggle("active", item === savedButton));
  }
  if (urlQuery) {
    searchQuery = urlQuery;
    const inlineSearchEl = $("#inlineSearchInput");
    if (inlineSearchEl) inlineSearchEl.value = urlQuery;
  }
  if (urlSort && ["relevance", "newest", "az", "za"].includes(urlSort)) {
    sortMode = urlSort;
    const sortSelectEl = $("#sortSelect");
    if (sortSelectEl) sortSelectEl.value = urlSort;
  }
  const urlLang = urlParams.get("lang");
  if (urlLang && ["hindi", "english", "hinglish"].includes(urlLang)) {
    langFilter = urlLang;
    const langSelectEl = $("#langSelect");
    if (langSelectEl) langSelectEl.value = urlLang;
  }
  $$(".filter-row .filter").forEach((button) => button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    localStorage.setItem(filterKey, activeFilter);
    visibleCount = PAGE_SIZE;
    $$(".filter-row .filter").forEach((item) => item.classList.toggle("active", item === button));
    renderBatches();
  }));
  const inlineSearch = $("#inlineSearchInput");
  let searchDebounce;
  inlineSearch?.addEventListener("input", (event) => {
    const value = event.target.value;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchQuery = value;
      visibleCount = PAGE_SIZE;
      renderBatches();
    }, 150);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
    const active = document.activeElement;
    const typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
    if (typing) return;
    event.preventDefault();
    inlineSearch?.focus();
  });
  $("#sortSelect")?.addEventListener("change", (event) => {
    sortMode = event.target.value;
    visibleCount = PAGE_SIZE;
    renderBatches();
  });
  $("#langSelect")?.addEventListener("change", (event) => {
    langFilter = event.target.value;
    visibleCount = PAGE_SIZE;
    renderBatches();
  });
  $("#copyLinkBtn")?.addEventListener("click", () => {
    syncUrlParams();
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast("Link copied!")).catch(() => showToast("Could not copy link"));
    } else {
      showToast("Copy not supported on this browser");
    }
  });
  $("#clearFiltersBtn")?.addEventListener("click", () => {
    activeFilter = "all";
    searchQuery = "";
    sortMode = "relevance";
    langFilter = "all";
    const langSelectEl = $("#langSelect");
    if (langSelectEl) langSelectEl.value = "all";
    visibleCount = PAGE_SIZE;
    localStorage.setItem(filterKey, "all");
    if (inlineSearch) inlineSearch.value = "";
    const sortSelectEl = $("#sortSelect");
    if (sortSelectEl) sortSelectEl.value = "relevance";
    $$(".filter-row .filter").forEach((item) => item.classList.toggle("active", item.dataset.filter === "all"));
    renderBatches();
  });
}

function setupLoadMore() {
  const loadMoreBtn = $("#loadMoreBtn");
  if (!loadMoreBtn) return;
  const loadNext = () => {
    visibleCount += PAGE_SIZE;
    renderBatches();
  };
  loadMoreBtn.addEventListener("click", loadNext);
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && loadMoreBtn.style.display !== "none") loadNext();
    });
  }, { rootMargin: "600px" });
  observer.observe(loadMoreBtn);
}

function setupAnnouncements() {
  const key = "codex-studys-announce-seen";
  const badge = document.querySelector("#announceBtn .icon-badge");
  if (localStorage.getItem(key) === "true") badge?.remove();
  $("#announceBtn")?.addEventListener("click", () => {
    openModal("announceModal");
    localStorage.setItem(key, "true");
    badge?.remove();
  });
  $("#announceCopyLink")?.addEventListener("click", () => {
    const url = window.location.origin + window.location.pathname;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast("Link copied!")).catch(() => showToast("Could not copy link"));
    } else {
      showToast("Copy not supported on this browser");
    }
  });
}

const THEME_COLORS = {
  light: "#f4f5f9", dark: "#090b10", sandalwood: "#1c130c", "forest-emerald": "#06140f",
  "ocean-deep": "#050e17", "sakura-blossom": "#fff3f6", "dracula-midnight": "#14121f",
  "lavender-mist": "#f5f2fc", "cyberpunk-neon": "#05020a"
};

function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const current = document.documentElement.getAttribute("data-theme");
  meta.setAttribute("content", THEME_COLORS[current] || THEME_COLORS.dark);
}

function setupThemePicker() {
  syncThemeColor();
  const key = "codex-studys-theme";
  const markActive = () => {
    const current = localStorage.getItem(key) || "system";
    $$(".theme-option").forEach((option) => option.classList.toggle("active", option.dataset.theme === current));
  };
  $("#themeBtn")?.addEventListener("click", () => {
    markActive();
    openModal("themeModal");
  });
  $$(".theme-option").forEach((option) => option.addEventListener("click", () => {
    const theme = option.dataset.theme;
    localStorage.setItem(key, theme);
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
      const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      if (prefersLight) document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
    syncThemeColor();
    markActive();
  }));
}

/* ================= Animation Effects ================= */
function setupFxEngine() {
  const ENABLED_KEY = "codex-studys-fx-enabled";
  const EFFECT_KEY = "codex-studys-fx-effect";
  const INTENSITY_KEY = "codex-studys-fx-intensity";
  const SCALE = [0.55, 1, 1.85];

  const enableToggle = $("#fxEnableToggle");
  const grid = $("#effectsGrid");
  const intensityInput = $("#fxIntensity");
  const fxBtn = $("#fxBtn");
  if (!grid) return;

  let canvas = null, ctx = null, rafId = null, dpr = 1, running = false, last = 0;
  let particles = [], bolts = [], flash = 0, burstTimer = 0, boltTimer = 0;
  let effect = localStorage.getItem(EFFECT_KEY) || "rain";
  let intensity = Number(localStorage.getItem(INTENSITY_KEY));
  if (!Number.isInteger(intensity) || intensity < 0 || intensity > 2) intensity = 1;
  let enabled = localStorage.getItem(ENABLED_KEY) === "true";

  const reducedMotion = () =>
    document.documentElement.getAttribute("data-reduced-motion") === "true" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.id = "fxCanvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
  }

  function resizeCanvas() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function density(base) {
    const w = window.innerWidth;
    const dscale = w < 480 ? 0.5 : w < 900 ? 0.75 : 1;
    return Math.max(6, Math.round(base * dscale * SCALE[intensity]));
  }

  function seed() {
    const w = window.innerWidth, h = window.innerHeight;
    particles = []; bolts = []; flash = 0; burstTimer = 0; boltTimer = 0;
    if (effect === "rain" || effect === "storm") {
      const n = density(effect === "storm" ? 100 : 75);
      for (let i = 0; i < n; i++) particles.push({
        x: Math.random() * w, y: Math.random() * h - h,
        len: 14 + Math.random() * 16, speed: 7 + Math.random() * 7,
        drift: effect === "storm" ? 2.6 : 0.7
      });
    } else if (effect === "snow") {
      const n = density(70);
      for (let i = 0; i < n; i++) particles.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 1.5 + Math.random() * 2.6, speed: 0.6 + Math.random() * 1.3,
        phase: Math.random() * Math.PI * 2, amp: 10 + Math.random() * 20
      });
    } else if (effect === "hail") {
      const n = density(55);
      for (let i = 0; i < n; i++) particles.push({
        x: Math.random() * w, y: Math.random() * h - h,
        r: 2 + Math.random() * 2, speed: 10 + Math.random() * 6, drift: 1.4
      });
    } else if (effect === "fireball") {
      const n = density(40);
      for (let i = 0; i < n; i++) particles.push({
        x: Math.random() * w, y: h + Math.random() * 100,
        r: 2 + Math.random() * 3.2, speed: 0.7 + Math.random() * 1.3,
        drift: Math.random() * 1.2 - 0.6, flick: Math.random() * Math.PI * 2
      });
    }
  }

  function spawnBurst(w, h) {
    const cx = 40 + Math.random() * (w - 80);
    const cy = 60 + Math.random() * (h * 0.45);
    const hue = Math.floor(Math.random() * 360);
    const count = density(26);
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const sp = 1.6 + Math.random() * 2.2;
      particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, hue });
    }
  }

  function spawnBolt(w, h) {
    const points = [];
    let x = 60 + Math.random() * Math.max(w - 120, 20), y = 0;
    points.push({ x, y });
    while (y < h * 0.7) {
      y += 18 + Math.random() * 22;
      x += (Math.random() - 0.5) * 40;
      points.push({ x, y });
    }
    bolts.push({ points, life: 1 });
    flash = 0.35;
  }

  function step(dt, w, h) {
    ctx.clearRect(0, 0, w, h);
    if (effect === "rain" || effect === "storm") {
      ctx.strokeStyle = "rgba(160,200,255,.55)";
      ctx.lineWidth = 1.3;
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.drift * 3, p.y + p.len);
        ctx.stroke();
        p.y += p.speed * dt * 60; p.x += p.drift * dt * 60;
        if (p.y > h) { p.y = -p.len; p.x = Math.random() * w; }
      });
      if (effect === "storm") {
        boltTimer -= dt;
        if (boltTimer <= 0) { spawnBolt(w, h); boltTimer = 2.5 + Math.random() * 4; }
      }
    } else if (effect === "snow") {
      ctx.fillStyle = "rgba(255,255,255,.85)";
      particles.forEach((p) => {
        p.phase += dt;
        const x = p.x + Math.sin(p.phase) * p.amp * 0.02;
        ctx.beginPath(); ctx.arc(x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        p.y += p.speed * dt * 60;
        if (p.y > h) { p.y = -4; p.x = Math.random() * w; }
      });
    } else if (effect === "hail") {
      ctx.fillStyle = "rgba(220,235,255,.9)";
      particles.forEach((p) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        p.y += p.speed * dt * 60; p.x += p.drift * dt * 60;
        if (p.y > h) { p.y = -6; p.x = Math.random() * w; }
      });
    } else if (effect === "fireball") {
      particles.forEach((p) => {
        p.flick += dt * 6;
        const alpha = 0.5 + Math.sin(p.flick) * 0.3;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
        grad.addColorStop(0, `rgba(255,180,80,${alpha})`);
        grad.addColorStop(1, "rgba(255,80,20,0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2); ctx.fill();
        p.y -= p.speed * dt * 60; p.x += p.drift * dt * 30;
        if (p.y < -10) { p.y = h + Math.random() * 40; p.x = Math.random() * w; }
      });
    } else if (effect === "firecracker") {
      burstTimer -= dt;
      if (burstTimer <= 0) { spawnBurst(w, h); burstTimer = 1.1 + Math.random() * (2.6 - intensity * 0.7); }
      particles = particles.filter((p) => p.life > 0);
      particles.forEach((p) => {
        p.vy += dt * 1.6; p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.life -= dt * 0.9;
        ctx.fillStyle = `hsla(${p.hue},95%,65%,${Math.max(p.life, 0)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
      });
    } else if (effect === "lightning") {
      boltTimer -= dt;
      if (boltTimer <= 0) { spawnBolt(w, h); boltTimer = 2.6 + Math.random() * (5 - intensity); }
    }

    if (effect === "storm" || effect === "lightning") {
      bolts = bolts.filter((b) => b.life > 0);
      bolts.forEach((b) => {
        ctx.strokeStyle = `rgba(220,235,255,${b.life})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        b.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.stroke();
        b.life -= dt * 1.8;
      });
      if (flash > 0) {
        ctx.fillStyle = `rgba(210,225,255,${flash})`;
        ctx.fillRect(0, 0, w, h);
        flash -= dt * 0.9;
      }
    }
  }

  function loop(ts) {
    if (!running) return;
    const dt = Math.min((ts - last) / 1000 || 0, 0.05);
    last = ts;
    step(dt, window.innerWidth, window.innerHeight);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    ensureCanvas();
    seed();
    running = true;
    last = 0;
    rafId = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  function apply() {
    if (enabled && !reducedMotion() && !document.hidden) start(); else stop();
  }

  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else apply(); });
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", apply);
  window.__codexFxApply = apply;

  function markActive() {
    $$(".effect-option").forEach((btn) => btn.classList.toggle("active", btn.dataset.effect === effect));
  }
  enableToggle?.setAttribute("aria-checked", String(enabled));
  if (intensityInput) intensityInput.value = String(intensity);
  markActive();

  enableToggle?.addEventListener("click", () => {
    enabled = enableToggle.getAttribute("aria-checked") !== "true";
    enableToggle.setAttribute("aria-checked", String(enabled));
    localStorage.setItem(ENABLED_KEY, String(enabled));
    apply();
  });

  grid.addEventListener("click", (event) => {
    const btn = event.target.closest(".effect-option");
    if (!btn) return;
    effect = btn.dataset.effect;
    localStorage.setItem(EFFECT_KEY, effect);
    markActive();
    if (running) { stop(); apply(); }
  });

  intensityInput?.addEventListener("input", () => {
    intensity = Number(intensityInput.value);
    localStorage.setItem(INTENSITY_KEY, String(intensity));
    if (running) seed();
  });

  fxBtn?.addEventListener("click", () => openModal("effectsModal"));

  if (enabled) apply();
}

/* ================= Network Status ================= */
function setupNetworkStatus() {
  const netBtn = $("#netBtn");
  const typeEl = $("#netType");
  const pingEl = $("#netPing");
  const latencyEl = $("#netLatency");
  const bwEl = $("#netBandwidth");
  const statusEl = $("#netStatus");
  const refreshBtn = $("#netRefreshBtn");
  if (!netBtn || !typeEl) return;

  let pollTimer = null;
  const PING_ASSET = "assets/icon-192.png";

  function connInfo() {
    return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  }
  function typeLabel() {
    const c = connInfo();
    if (c) {
      const t = c.type && c.type !== "unknown" ? c.type : c.effectiveType;
      if (t) return t === "wifi" ? "Wi-Fi" : t.toUpperCase();
    }
    return "Unknown";
  }
  function bandwidthLabel() {
    const c = connInfo();
    return c && typeof c.downlink === "number" ? `${c.downlink} Mbps` : "—";
  }
  function setStatus(online) {
    statusEl.innerHTML = `<span class="net-status-dot${online ? "" : " offline"}"></span>${online ? "Online" : "Offline"}`;
  }

  async function measure() {
    if (!navigator.onLine) {
      typeEl.textContent = "Offline"; pingEl.textContent = "—"; latencyEl.textContent = "—";
      bwEl.textContent = "—"; setStatus(false);
      return;
    }
    typeEl.textContent = typeLabel();
    bwEl.textContent = bandwidthLabel();
    setStatus(true);
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      try {
        await fetch(`${PING_ASSET}?_=${Date.now()}_${i}`, { method: "HEAD", cache: "no-store" });
        samples.push(performance.now() - t0);
      } catch (error) { /* ignore a single dropped sample */ }
    }
    if (samples.length) {
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      pingEl.textContent = `${Math.round(avg)} ms`;
      const entries = performance.getEntriesByType("resource").filter((r) => r.name.includes(PING_ASSET));
      const lastEntry = entries[entries.length - 1];
      const ttfb = lastEntry ? Math.max(0, lastEntry.responseStart - lastEntry.requestStart) : avg * 0.4;
      latencyEl.textContent = `${Math.round(ttfb || avg * 0.4)} ms`;
    } else {
      pingEl.textContent = "Timeout"; latencyEl.textContent = "—"; setStatus(false);
    }
  }

  function startPolling() {
    measure();
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => {
      const modal = document.getElementById("networkModal");
      if (!modal || !modal.classList.contains("visible")) {
        window.clearInterval(pollTimer); pollTimer = null; return;
      }
      measure();
    }, 8000);
  }

  netBtn.addEventListener("click", () => { openModal("networkModal"); startPolling(); });
  refreshBtn?.addEventListener("click", measure);
}

const POPUP_SNOOZE_KEY = "codex-studys-popups-snooze";
const POPUP_SNOOZE_MS = 24 * 60 * 60 * 1000;

function popupsSnoozed() {
  try {
    const until = Number(localStorage.getItem(POPUP_SNOOZE_KEY) || 0);
    return until > Date.now();
  } catch (e) { return false; }
}

function setupTelegramPopup() {
  document.querySelectorAll("[data-snooze-popups]").forEach((btn) => {
    btn.addEventListener("click", () => {
      try { localStorage.setItem(POPUP_SNOOZE_KEY, String(Date.now() + POPUP_SNOOZE_MS)); } catch (e) {}
      closeModal("telegramModal");
      closeModal("installModal");
      showToast("Popups 24 ghante ke liye band");
    });
  });
  if (popupsSnoozed()) return;
  let seen = false;
  try { seen = sessionStorage.getItem("cx-popups-shown") === "1"; } catch (e) {}
  if (seen) return; // already shown this session (e.g. coming back from a batch)
  window.setTimeout(() => {
    try { sessionStorage.setItem("cx-popups-shown", "1"); } catch (e) {}
    openModal("telegramModal");
    const modal = document.getElementById("telegramModal");
    if (!modal) return;
    const watcher = window.setInterval(() => {
      if (!modal.classList.contains("visible")) {
        window.clearInterval(watcher);
        window.setTimeout(() => { if (!isStandaloneApp() && !popupsSnoozed()) openModal("installModal"); }, 200);
      }
    }, 150);
  }, 700);
}

let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function setupInstallPrompt() {
  if (isStandaloneApp()) return;
  const installBtn = $("#installActionBtn");
  const iosSteps = $("#iosInstallSteps");
  const body = $("#installBody");

  const showForIOS = () => {
    if (installBtn) installBtn.style.display = "none";
    if (iosSteps) iosSteps.style.display = "grid";
    if (body) body.textContent = "Add CODEX STUDYS to your home screen for a faster, app-like experience.";
  };

  installBtn?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    closeModal("installModal");
    if (outcome === "accepted") showToast("Installing CODEX STUDYS…");
  });

  window.addEventListener("appinstalled", () => {
    closeModal("installModal");
    showToast("CODEX STUDYS installed!");
  });

  if (isIOSDevice()) showForIOS();
}

function setupOfflineBanner() {
  const banner = $("#offlineBanner");
  if (!banner) return;
  const update = () => banner.classList.toggle("visible", !navigator.onLine);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

function setupViewToggle() {
  const key = "codex-studys-view";
  const grid = $("#batchGrid");
  const gridBtn = $("#gridViewBtn");
  const listBtn = $("#listViewBtn");
  if (!grid || !gridBtn || !listBtn) return;
  const apply = (mode) => {
    grid.classList.toggle("list-view", mode === "list");
    gridBtn.classList.toggle("active", mode !== "list");
    gridBtn.setAttribute("aria-pressed", String(mode !== "list"));
    listBtn.classList.toggle("active", mode === "list");
    listBtn.setAttribute("aria-pressed", String(mode === "list"));
  };
  apply(localStorage.getItem(key) || "grid");
  gridBtn.addEventListener("click", () => { localStorage.setItem(key, "grid"); apply("grid"); });
  listBtn.addEventListener("click", () => { localStorage.setItem(key, "list"); apply("list"); });
}

function setupPreferences() {
  const contrastToggle = $("#contrastToggle");
  const motionToggle = $("#motionToggle");

  const applyContrast = (on) => {
    document.documentElement.setAttribute("data-contrast", on ? "high" : "normal");
    contrastToggle?.setAttribute("aria-checked", String(on));
  };
  const applyMotion = (on) => {
    document.documentElement.setAttribute("data-reduced-motion", String(on));
    motionToggle?.setAttribute("aria-checked", String(on));
  };
  applyContrast(localStorage.getItem("codex-studys-contrast") === "true");
  applyMotion(localStorage.getItem("codex-studys-reduced-motion") === "true");

  contrastToggle?.addEventListener("click", () => {
    const on = contrastToggle.getAttribute("aria-checked") !== "true";
    localStorage.setItem("codex-studys-contrast", String(on));
    applyContrast(on);
  });
  motionToggle?.addEventListener("click", () => {
    const on = motionToggle.getAttribute("aria-checked") !== "true";
    localStorage.setItem("codex-studys-reduced-motion", String(on));
    applyMotion(on);
    window.__codexFxApply?.();
  });

  $("#exportFavBtn")?.addEventListener("click", () => {
    const favorites = getFavorites();
    if (!favorites.length) return showToast("No favorites to export yet.");
    const details = allBatches.filter((batch) => favorites.includes(batch._id || batch.batch_id || ""));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), favorites: details }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "codex-studys-favorites.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Favorites exported.");
  });

  const importInput = $("#importFavFile");
  $("#importFavBtn")?.addEventListener("click", () => importInput?.click());
  importInput?.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const ids = (data.favorites || []).map((batch) => batch._id || batch.batch_id).filter(Boolean);
        const current = getFavorites();
        const merged = [...new Set([...current, ...ids])];
        localStorage.setItem("codex-studys-favorites", JSON.stringify(merged));
        updateFavoritesCount();
        renderBatches();
        showToast(`Imported ${ids.length} favorite${ids.length === 1 ? "" : "s"}.`);
      } catch {
        showToast("That file could not be read.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  });

  $("#clearDataBtn")?.addEventListener("click", () => {
    if (!confirm("This clears favorites, theme, search history and all saved preferences on this device. Continue?")) return;
    Object.keys(localStorage).filter((key) => key.startsWith("codex-studys")).forEach((key) => localStorage.removeItem(key));
    showToast("App data cleared. Reloading…");
    setTimeout(() => window.location.reload(), 900);
  });
}

function animateCount(element, target) {
  if (!element) return;
  if (target <= 0) { element.textContent = "0"; return; }
  const duration = 700;
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(target * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateStats() {
  const strip = $("#statsStrip");
  if (!strip) return;
  strip.style.display = "grid";
  const freshCount = allBatches.filter((batch) => isRecent(batch.startDate)).length;
  animateCount($("#statTotal"), allBatches.length);
  animateCount($("#statNew"), freshCount);
  const statFav = $("#statFav");
  if (statFav) statFav.textContent = getFavorites().length.toLocaleString();
  const statRecent = $("#statRecent");
  if (statRecent) statRecent.textContent = String(getRecentlyViewed().length);
}

function setupBackToTop() {
  const button = $("#backToTopBtn");
  if (!button) return;
  const onScroll = () => button.classList.toggle("visible", window.scrollY > 480);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}


/* ---------- Personal notes ---------- */
function getNotes() {
  try { return JSON.parse(localStorage.getItem("codex-studys-notes") || "{}"); }
  catch { return {}; }
}

function getNote(id) {
  return getNotes()[id] || "";
}

function setNote(id, text) {
  const notes = getNotes();
  if (text.trim()) notes[id] = text.trim(); else delete notes[id];
  localStorage.setItem("codex-studys-notes", JSON.stringify(notes));
}

/* ---------- Quick view ---------- */
let detailBatch = null;

function openDetail(batch) {
  detailBatch = batch;
  const id = batch._id || batch.batch_id || "";
  const hero = document.getElementById("detailHero");
  if (hero) {
    hero.src = batch.previewImage || FALLBACK_THUMB;
    hero.onerror = () => { hero.onerror = null; hero.src = FALLBACK_THUMB; };
  }
  const titleEl = document.getElementById("detailTitle");
  if (titleEl) titleEl.textContent = batch.name || "Untitled course";
  const subEl = document.getElementById("detailSub");
  if (subEl) subEl.textContent = batch.byName || "Structured learning for your next milestone";
  const facts = [
    ["Category", categoryFor(batch).toUpperCase()],
    ["Language", batch.language || "Self-paced"],
    ["Starts", formatDate(batch.startDate) || "Anytime"],
    ["Subjects", String((batch.subBatches || []).length || "—")]
  ];
  const factsEl = document.getElementById("detailFacts");
  if (factsEl) factsEl.innerHTML = facts.map(([k, v]) => `<div class="detail-fact"><span>${escapeHtml(k)}</span><span>${escapeHtml(String(v))}</span></div>`).join("");
  const noteEl = document.getElementById("detailNote");
  if (noteEl) noteEl.value = getNote(id);
  syncDetailFavButton(id);
  openModal("detailModal");
}

function syncDetailFavButton(id) {
  const favBtn = document.getElementById("detailFavBtn");
  if (favBtn) favBtn.textContent = isFavorite(id) ? "❤ Saved" : "❤ Save";
}

function setupDetailModal() {
  document.getElementById("detailFavBtn")?.addEventListener("click", () => {
    if (!detailBatch) return;
    const id = detailBatch._id || detailBatch.batch_id || "";
    const active = toggleFavorite(id);
    syncDetailFavButton(id);
    updateFavoritesCount();
    renderBatches();
    showToast(active ? "Added to favorites." : "Removed from favorites.");
  });
  document.getElementById("detailOpenBtn")?.addEventListener("click", () => {
    if (detailBatch) openBatch(detailBatch);
  });
  const noteEl = document.getElementById("detailNote");
  let noteTimer;
  noteEl?.addEventListener("input", () => {
    if (!detailBatch) return;
    const id = detailBatch._id || detailBatch.batch_id || "";
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      setNote(id, noteEl.value);
      renderBatches();
    }, 400);
  });
}

/* ---------- Reading progress ---------- */
function setupScrollProgress() {
  const bar = document.getElementById("scrollProgress");
  if (!bar) return;
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = `${max > 0 ? Math.min((window.scrollY / max) * 100, 100) : 0}%`;
  };
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

/* ---------- Shortcuts ---------- */
function setupShortcuts() {
  document.getElementById("shortcutsBtn")?.addEventListener("click", () => openModal("shortcutsModal"));
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
    const key = event.key.toLowerCase();
    if (event.key === "?") { event.preventDefault(); openModal("shortcutsModal"); }
    else if (key === "f") { event.preventDefault(); document.getElementById("favNavBtn")?.click(); }
    else if (key === "t") { event.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  });
}


/* =====================================================================
   View routing (Courses / E-Books)
   ===================================================================== */
let currentView = "courses";
function setView(view, { scroll = true, updateHash = true } = {}) {
  currentView = "books"; // Home shows books only
  const courses = $("#courses"), books = $("#books");
  if (courses) courses.hidden = currentView !== "courses";
  if (books) books.hidden = currentView !== "books";
  $$(".nav-link[data-view]").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === (currentView === "books" ? "#books" : "#courses"));
  });
  if (currentView === "books") { PinnacleBooks.ensureLoaded(); }
  if (updateHash) history.replaceState(null, "", "#books");
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
}

function setupViewRouting() {
  $$(".nav-link[data-view]").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    // Home and E-Books both land on the E-Books library; only "Courses" opens the courses view.
    setView("books");
  }));
  document.addEventListener("click", (event) => {
    const link = event.target.closest && event.target.closest("a.empty-link[href='#books']");
    if (link) { event.preventDefault(); setView("books"); }
  });
  window.addEventListener("hashchange", () => {
    setView("books", { updateHash: false });
  });
  // E-Books is the landing view; Courses opens only when asked for (#courses or a filter/sort deep link).
  const params = new URLSearchParams(location.search);
  const wantsCourses = location.hash === "#courses" || params.get("view") === "courses" || params.has("filter") || params.has("sort") || params.has("lang") || params.has("q");
  setView("books", { scroll: false, updateHash: false });
}

/* =====================================================================
   E-Books Library: Bunny, Pinnacle, Study Bison, PrepBooks, RCXE, Ebooks Official,
   Panda, BookieJee (local data + live Pinnacle API) and live libraries
   (Gutenberg, Open Library, Google Books, Standard Ebooks, Crossref, arXiv,
   Semantic Scholar, PubMed Central, LibriVox, MangaDex, Jikan).
   ===================================================================== */
const PinnacleBooks = (() => {
  const API = "https://pinnacleebooks.mikey-nt.workers.dev";
  const GUT = "https://gutendex.com/books";
  const CXB = window.CXB || { tg: "https://t.me/Cjc65o9aDEEwYWE1", books: [] };
  const TG = CXB.tg;
  const PROXY = ""; // optional: your Cloudflare worker, e.g. "https://x.workers.dev/?u=" (see proxy-worker.js)
  const CACHE_KEY = "cx-pinnacle-books-v2";
  const PAGE = 48;
  const ORD = ["JEE", "NEET", "SSC", "UPSC", "BPSC", "Railway", "Banking", "Teaching Exams", "Police & Defence", "State PSC", "UGC NET & PG", "Other Entrance", "Class 9", "Class 10", "Class 11", "Class 12", "Novels & Classics", "Research & Academic", "Audiobooks", "Manga & Comics", "General & Others"];
  const LIVE_CATS = ["Novels & Classics", "Research & Academic", "Audiobooks", "Manga & Comics"];
  const NV = LIVE_CATS[0], RA = LIVE_CATS[1], AU = LIVE_CATS[2], MG = LIVE_CATS[3];
  const PRI = { "Bunny Books": 0, "Pinnacle": 1, "Study Bison": 2, "PrepBooks": 3, "RCXE": 4, "Ebooks Official": 5, "Panda Books": 6, "BookieJee": 7 };
  const state = { all: [], list: [], seen: new Set(), cat: "All", subject: "", source: "", query: "", shown: PAGE, loaded: false, loading: false, pinErr: false, gutPage: 1, gutEnd: false, gutBusy: false, gutTotal: 0, fed: {}, chapterReq: 0, currentBook: null, chapters: [], qSeq: 0 };
  const chapterCache = new Map();
  async function request(url, timeout = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { reason: `Server replied HTTP ${res.status}`, network: false });
      const text = await res.text();
      try { return JSON.parse(text); }
      catch { throw Object.assign(new Error("Bad JSON"), { reason: "Server sent an unreadable response", network: false }); }
    } catch (err) {
      if (err.reason) throw err;
      if (err.name === "AbortError") throw Object.assign(err, { reason: "Request timed out", network: true });
      throw Object.assign(err, { reason: navigator.onLine ? "Request was blocked or the server is unreachable" : "You're offline", network: true });
    } finally { clearTimeout(timer); }
  }
  // Try each URL form in order; on a pure network failure retry the round once.
  async function requestAny(urls, accept, timeout) {
    let lastErr = null;
    for (let round = 0; round < 2; round++) {
      let allNetwork = true;
      for (const url of urls) {
        try {
          const data = await request(url, timeout);
          const picked = accept(data);
          if (picked !== undefined) return picked;
          allNetwork = false;
        } catch (err) { lastErr = err; if (!err.network) allNetwork = false; }
      }
      if (!allNetwork) break;
      await new Promise((r) => setTimeout(r, 600));
    }
    throw lastErr || Object.assign(new Error("No data"), { reason: "The server returned no usable data" });
  }
  const pickList = (d) => Array.isArray(d) ? d : (d && [d.chapters, d.data, d.items, d.result, d.results].find(Array.isArray));
  const fetchChapters = async (bookId) => {
    const id = encodeURIComponent(bookId);
    let best = null;
    const list = await requestAny([`${API}/chapters?id=${id}`, `${API}/chapters?${id}`], (d) => {
      const l = pickList(d);
      if (!l) return undefined;
      if (l.length) return l;
      best = l; return undefined; // empty: give the other URL form a chance
    }, 15000).catch((err) => { if (best) return best; throw err; });
    return [...list].sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0));
  };
  const pickPdfUrl = (d) => {
    if (typeof d === "string") return /^https?:/i.test(d) ? d : undefined;
    const u = d && (d.url || d.pdf || d.pdfUrl || d.link || d.file || (d.data && (typeof d.data === "string" ? d.data : d.data.url || d.data.pdf)));
    return typeof u === "string" && u ? u : undefined;
  };
  const fetchPdfUrl = async (chapterId) => {
    const id = encodeURIComponent(chapterId);
    return requestAny([`${API}/pdf?id=${id}`, `${API}/pdf?${id}`], pickPdfUrl, 20000);
  };

  const safeUrl = (u) => { if (!u || typeof u !== "string") return ""; try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
  const norm = (v) => String(v == null ? "" : v).toLowerCase();

  /* ---------- fetch helpers for the live libraries (direct, then CORS fallbacks) ---------- */
  async function tryFetch(url, ms, asText) {
    const chain = [url];
    if (PROXY) chain.push(PROXY + encodeURIComponent(url));
    chain.push("https://corsproxy.io/?" + encodeURIComponent(url), "https://api.allorigins.win/raw?url=" + encodeURIComponent(url));
    for (const u of chain) {
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), ms || 15000);
      try {
        const r = await fetch(u, { signal: ctrl.signal });
        if (!r.ok) continue;
        const text = await r.text();
        return asText ? text : JSON.parse(text);
      } catch (e) { /* try next */ } finally { clearTimeout(timer); }
    }
    throw new Error("network");
  }
  const jf = (url, ms) => tryFetch(url, ms, false);
  const xmlf = async (url) => new DOMParser().parseFromString(await tryFetch(url, 15000, true), "text/xml");
  const strip = (x) => String(x || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
  const noEmoji = (x) => String(x || "").replace(/[\u{1F000}-\u{1FAFF}\u2190-\u21FF\u2300-\u23FF\u2460-\u27BF\u2900-\u297F\u2B00-\u2BFF\uFE0F\u200D\u20E3]/gu, "").replace(/\s+/g, " ").trim();
  const au = (a) => (a || []).filter(Boolean).slice(0, 2).join(", ");
  const g1 = (e, t) => (e.getElementsByTagName(t)[0] || {}).textContent || "";
  const mk = (u, t, a, c, s, src, img, L, d, x) => { L = (L || []).filter((l) => l && l[1]); return { u, t: noEmoji(t), a: a || "", c, s, src, img: img || "", dl: L[0] ? L[0][1] : "", L, d: strip(d), x: x ? String(x) : "" }; };

  /* ---------- Pinnacle live API ---------- */
  const fetchBooks = async () => { const d = await request(`${API}/ebooks`, 20000); return Array.isArray(d) ? d : (Array.isArray(d && d.ebooks) ? d.ebooks : []); };
  const examOf = (b) => {
    const e = norm(b.category) + " " + norm(b.examName);
    if (e.includes("police") || e.includes("defence")) return "Police & Defence";
    return ORD.find((o) => o !== "General & Others" && e.includes(norm(o).split(" ")[0])) || "General & Others";
  };

  /* ---------- live providers ---------- */
  const gm = (b) => {
    const f = b.formats || {};
    const read = f["text/html"] || f["text/html; charset=utf-8"] || "";
    const epub = f["application/epub+zip"] || "";
    return mk("G" + b.id, b.title, ((b.authors || [])[0] || {}).name || "", NV, "Literature", "Project Gutenberg", f["image/jpeg"] || "",
      [["Read online", read], ["EPUB", epub], ["Kindle", f["application/x-mobipocket-ebook"]], ["Text", f["text/plain; charset=us-ascii"] || f["text/plain; charset=utf-8"]], ["Page", "https://www.gutenberg.org/ebooks/" + b.id]], "", (b.subjects || []).slice(0, 3).join(" "));
  };
  const PROV = [
    { n: "Gutenberg", c: NV, run: async (q, L) => { if (!q) return []; const r = await jf(GUT + "?" + new URLSearchParams({ search: q, languages: L })); state.gutTotal = Math.max(state.gutTotal, r.count || 0); return (r.results || []).map(gm); } },
    { n: "Open Library", c: NV, run: async (q) => ((await jf("https://openlibrary.org/search.json?" + new URLSearchParams({ q: q || "classic novels", limit: 24, fields: "title,author_name,cover_i,key,first_publish_year,ia" }))).docs || []).map((b) => { const ia = b.ia && b.ia[0]; return mk("O" + b.key, b.title, au(b.author_name), NV, "Literature", "Open Library", b.cover_i ? "https://covers.openlibrary.org/b/id/" + b.cover_i + "-M.jpg" : "", [[ia ? "Read online" : "View", ia ? "https://archive.org/details/" + ia : "https://openlibrary.org" + b.key]], "", b.first_publish_year); }) },
    { n: "Google Books", c: NV, run: async (q) => ((await jf("https://www.googleapis.com/books/v1/volumes?" + new URLSearchParams({ q: q || "subject:fiction", maxResults: 20 }))).items || []).map((b) => { const v = b.volumeInfo || {}, p = b.accessInfo && b.accessInfo.pdf; return mk("K" + b.id, v.title, au(v.authors), NV, (v.categories || ["Literature"])[0], "Google Books", ((v.imageLinks || {}).thumbnail || "").replace("http:", "https:"), [["View", v.infoLink], p && p.downloadLink ? ["PDF", p.downloadLink] : null], v.description, v.publishedDate); }) },
    { n: "Standard Ebooks", c: NV, run: async (q) => {
      const d = await xmlf("https://standardebooks.org/feeds/opds/" + (q ? "all?" + new URLSearchParams({ query: q }) : "new-releases"));
      const ab = (l) => { const h = l ? l.getAttribute("href") : ""; return h && h[0] === "/" ? "https://standardebooks.org" + h : h; };
      return [...d.getElementsByTagName("entry")].slice(0, 20).map((e) => { const ls = [...e.getElementsByTagName("link")], ep = ls.find((l) => /epub/.test(l.getAttribute("type") || "")), im = ls.find((l) => /image/.test(l.getAttribute("rel") || "")), al = ls.find((l) => l.getAttribute("rel") === "alternate"); return mk("E" + g1(e, "id"), g1(e, "title"), g1(e.getElementsByTagName("author")[0] || e, "name"), NV, "Literature", "Standard Ebooks", ab(im), [["EPUB", ab(ep)], ["Read online", ab(al)]], g1(e, "summary") || g1(e, "content")); });
    } },
    { n: "Crossref", c: RA, run: async (q) => ((await jf("https://api.crossref.org/works?" + new URLSearchParams({ query: q || "textbook", rows: 20, filter: "type:book", select: "title,author,DOI,URL,publisher,abstract" }))).message.items || []).map((b) => mk("C" + b.DOI, (b.title || [])[0], au((b.author || []).map((a) => ((a.given || "") + " " + (a.family || "")).trim())), RA, "Books & Monographs", "Crossref", "", [["View", b.URL]], b.abstract, b.publisher)) },
    { n: "arXiv", c: RA, run: async (q) => {
      const d = await xmlf("https://export.arxiv.org/api/query?" + new URLSearchParams({ search_query: "all:" + (q || "science"), max_results: 20 }));
      return [...d.getElementsByTagName("entry")].map((e) => { const id = g1(e, "id").replace("http:", "https:"), pdf = [...e.getElementsByTagName("link")].find((l) => l.getAttribute("title") === "pdf"); return mk("A" + id, g1(e, "title"), au([...e.getElementsByTagName("name")].map((n) => n.textContent)), RA, "Papers", "arXiv", "", [["PDF", pdf ? pdf.getAttribute("href").replace("http:", "https:") : id.replace("/abs/", "/pdf/")], ["Abstract", id]], g1(e, "summary")); });
    } },
    { n: "Semantic Scholar", c: RA, run: async (q) => ((await jf("https://api.semanticscholar.org/graph/v1/paper/search?" + new URLSearchParams({ query: q || "physics", limit: 20, fields: "title,authors,year,openAccessPdf,url,abstract" }))).data || []).map((p) => mk("S" + p.paperId, p.title, au((p.authors || []).map((a) => a.name)), RA, "Papers", "Semantic Scholar", "", [p.openAccessPdf && p.openAccessPdf.url ? ["PDF", p.openAccessPdf.url] : null, ["View", p.url]], p.abstract, p.year)) },
    { n: "PubMed Central", c: RA, run: async (q) => {
      const s = await jf("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?" + new URLSearchParams({ db: "pmc", term: q || "biology", retmax: 20, retmode: "json" }));
      const ids = (s.esearchresult && s.esearchresult.idlist) || [];
      if (!ids.length) return [];
      const m = await jf("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?" + new URLSearchParams({ db: "pmc", id: ids.join(","), retmode: "json" }));
      return ids.map((i) => { const p = (m.result || {})[i] || {}; return mk("M" + i, p.title, au((p.authors || []).map((a) => a.name)), RA, "Medical & Biology", "PubMed Central", "", [["Read", "https://pmc.ncbi.nlm.nih.gov/articles/PMC" + i + "/"]], "", p.pubdate); });
    } },
    { n: "LibriVox", c: AU, run: async (q) => ((await jf("https://librivox.org/api/feed/audiobooks?" + new URLSearchParams({ format: "json", limit: 24, ...(q ? { title: "^" + q } : {}) }))).books || []).map((b) => mk("V" + b.id, b.title, au((b.authors || []).map((a) => ((a.first_name || "") + " " + (a.last_name || "")).trim())), AU, "Audiobook", "LibriVox", "", [["Listen", b.url_librivox], ["ZIP (MP3)", b.url_zip_file], ["RSS", b.url_rss]], b.description, ((b.language || "") + " " + (b.totaltime || "")).trim())) },
    { n: "MangaDex", c: MG, run: async (q) => {
      const p = new URLSearchParams({ limit: 20 }); if (q) p.append("title", q); else p.append("order[followedCount]", "desc"); p.append("includes[]", "cover_art"); p.append("includes[]", "author");
      return ((await jf("https://api.mangadex.org/manga?" + p)).data || []).map((m) => { const a = m.attributes, cv = (m.relationships.find((x) => x.type === "cover_art") || {}).attributes, w = (m.relationships.find((x) => x.type === "author") || {}).attributes; return mk("D" + m.id, a.title.en || Object.values(a.title)[0], w && w.name, MG, "Manga", "MangaDex", cv ? "https://uploads.mangadex.org/covers/" + m.id + "/" + cv.fileName + ".256.jpg" : "", [["Read", "https://mangadex.org/title/" + m.id]], (a.description || {}).en, a.year); });
    } },
    { n: "Jikan", c: MG, run: async (q) => ((await jf("https://api.jikan.moe/v4/" + (q ? "manga?" + new URLSearchParams({ q, limit: 20 }) : "top/manga?limit=20"))).data || []).map((m) => mk("J" + m.mal_id, m.title, m.authors && m.authors[0] && m.authors[0].name, MG, "Manga", "MyAnimeList", m.images && m.images.jpg && m.images.jpg.image_url, [["View", m.url]], m.synopsis, m.type)) }
  ];

  /* ---------- store ---------- */
  function put(b) {
    if (!b || !b.t || !b.u || state.seen.has(b.u)) return false;
    state.seen.add(b.u);
    b.k = norm([b.t, b.a, b.c, b.s, b.src, b.x, b.d].join(" "));
    b.p = PRI[b.src] == null ? 9 : PRI[b.src];
    state.all.push(b);
    return true;
  }
  (CXB.books || []).forEach((b, i) => { b.u = "L" + i; put(b); });

  const hue = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
  const fmt = (n) => Number(n).toLocaleString("en-IN");
  const groupCount = (key) => state.all.reduce((m, b) => (m[b[key]] = (m[b[key]] || 0) + 1, m), {});
  const gutOnly = () => state.all.filter((b) => b.src === "Project Gutenberg").length;
  const totalBooks = () => state.all.length - gutOnly() + Math.max(state.gutTotal, gutOnly());

  /* ---------- filters + chips ---------- */
  function drawChrome() {
    const cc = groupCount("c"), jc = groupCount("s"), sc = groupCount("src");
    const total = totalBooks();
    const cats = ORD.filter((c) => cc[c] || LIVE_CATS.includes(c));
    const chips = $("#bookExams");
    if (chips) {
      const cnt = (c) => c === NV ? (state.gutTotal ? Math.max(cc[c] || 0, (cc[c] || 0) - gutOnly() + state.gutTotal) : (cc[c] || 0)) : (cc[c] || 0);
      chips.innerHTML = [["All", total]].concat(cats.map((c) => [c, cnt(c)])).map(([c, n]) => `<button class="exam-tag${c === state.cat ? " active" : ""}" data-exam="${escapeHtml(c)}" type="button">${escapeHtml(c)}${n ? ` <i class="cnt">${fmt(n)}</i>` : ""}</button>`).join("");
    }
    const subj = $("#bookSubject");
    if (subj) {
      subj.innerHTML = '<option value="">All subjects</option>' + Object.entries(jc).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<option value="${escapeHtml(k)}"${k === state.subject ? " selected" : ""}>${escapeHtml(k)} (${fmt(v)})</option>`).join("");
    }
    const src = $("#bookSource");
    if (src) {
      const names = Object.keys(sc).sort((a, b) => (PRI[a] == null ? 9 : PRI[a]) - (PRI[b] == null ? 9 : PRI[b]) || a.localeCompare(b));
      src.innerHTML = '<option value="">All sources</option>' + names.map((n) => `<option value="${escapeHtml(n)}"${n === state.source ? " selected" : ""}>${escapeHtml(n)}</option>`).join("");
    }
    const stat = $("#bookStats");
    if (stat) stat.textContent = `${fmt(total)}${state.gutTotal ? "+" : ""} books in ${cats.length} categories`;
  }

  function matches(b) {
    if (state.cat !== "All" && b.c !== state.cat) return false;
    if (state.source && b.src !== state.source) return false;
    if (state.subject && b.s !== state.subject) return false;
    const q = norm(state.query).trim();
    if (q) { const w = q.split(/\s+/); if (!(w.every((x) => b.k.includes(x)) || (b.qs && b.qs.has(q)))) return false; }
    return true;
  }

  function skeletons(n = 8) {
    return Array.from({ length: n }, () => '<div class="skeleton-card book-skel"><div class="skeleton-thumb"></div><div class="skeleton-body"><div class="skeleton-line" style="width:40%"></div><div class="skeleton-line" style="width:90%"></div><div class="skeleton-line" style="width:70%"></div></div></div>').join("");
  }

  /* ---------- cards ---------- */
  function card(b, index) {
    const title = escapeHtml(b.t), subject = escapeHtml(b.s || "Book");
    const meta = escapeHtml(b.a || b.c);
    const img = safeUrl(b.img);
    const h = hue(b.t);
    let actions;
    if (b.pin) actions = `<button class="book-cta" type="button" data-book-id="${escapeHtml(b.u)}" aria-label="View chapters of ${title}">View Chapters</button>`;
    else if (b.v) actions = `<div class="book-actions"><button class="book-cta" type="button" data-read="${escapeHtml(b.u)}" aria-label="Read ${title}">Read</button><a class="book-cta book-cta-alt" href="${escapeHtml(safeUrl(b.dl) || TG)}" target="_blank" rel="noopener noreferrer" aria-label="Download ${title}">Download</a></div>`;
    else if (b.live) actions = `<div class="book-actions"><a class="book-cta" href="${escapeHtml(safeUrl(b.dl) || TG)}" target="_blank" rel="noopener noreferrer">${escapeHtml(((b.L && b.L[0] && b.L[0][0]) || "Open"))}</a>${b.L && b.L[1] && safeUrl(b.L[1][1]) ? `<a class="book-cta book-cta-alt" href="${escapeHtml(safeUrl(b.L[1][1]))}" target="_blank" rel="noopener noreferrer">${escapeHtml(b.L[1][0])}</a>` : ""}</div>`;
    else actions = `<a class="book-cta" href="${escapeHtml(TG)}" target="_blank" rel="noopener noreferrer" aria-label="Download ${title} on Telegram">Download</a>`;
    return `
      <article class="book-card" style="animation-delay:${Math.min(index % PAGE, 12) * 0.03}s">
        <div class="book-cover">
          <div class="cover-fallback" style="background:linear-gradient(160deg,hsla(${h},70%,60%,.26),hsla(${(h + 60) % 360},70%,55%,.1))"><span>${title}</span></div>
          ${img ? `<img src="${escapeHtml(img)}" alt="${title} cover" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('loaded');this.previousElementSibling.style.display='none'" onerror="this.remove()">` : ""}
          <span class="subject-badge">${subject}</span>
        </div>
        <div class="book-body">
          <span class="book-exam">${meta}</span>
          <h3 class="book-title" title="${title}">${title}</h3>
          ${actions}
        </div>
      </article>`;
  }

  /* ---------- render (first page + infinite scroll) ---------- */
  function refilter(keepShown) {
    const list = state.all.filter(matches);
    const so = ($("#bookSort") || {}).value || "rel";
    if (so === "az") list.sort((a, b) => a.t.localeCompare(b.t));
    else if (so === "za") list.sort((a, b) => b.t.localeCompare(a.t));
    else if (so === "cover") list.sort((a, b) => (!!b.img - !!a.img) || a.p - b.p);
    else list.sort((a, b) => a.p - b.p);
    state.list = list;
    if (!keepShown) state.shown = PAGE;
    draw();
  }
  function draw() {
    const grid = $("#bookGrid"), note = $("#bookNote"), clear = $("#bookClear");
    if (!grid) return;
    const items = state.list.slice(0, state.shown);
    const filtered = state.cat !== "All" || state.source || state.subject || state.query.trim();
    clear.style.display = filtered ? "inline-flex" : "none";
    note.textContent = state.list.length ? `Showing ${fmt(items.length)} of ${fmt(state.list.length)} books${state.cat !== "All" ? " in " + state.cat : ""}` : "No books matched.";
    grid.innerHTML = items.length ? items.map(card).join("") : '<div class="books-error"><div>No books found. Try another category or search term, or ask on Telegram.</div></div>';
    watchEnd();
  }
  function drawMore() {
    const grid = $("#bookGrid"); if (!grid) return;
    const from = state.shown, to = Math.min(state.list.length, from + PAGE);
    if (to <= from) return;
    grid.insertAdjacentHTML("beforeend", state.list.slice(from, to).map((b, i) => card(b, i)).join(""));
    state.shown = to;
    $("#bookNote").textContent = `Showing ${fmt(state.shown)} of ${fmt(state.list.length)} books${state.cat !== "All" ? " in " + state.cat : ""}`;
  }
  let io = null;
  function watchEnd() {
    const s = $("#bookSentinel"); if (!s || !("IntersectionObserver" in window)) return;
    if (!io) io = new IntersectionObserver((en) => { if (en.some((e) => e.isIntersecting)) onEnd(); }, { rootMargin: "700px 0px" });
    io.disconnect(); io.observe(s);
  }
  async function onEnd() {
    if (state.shown < state.list.length) { drawMore(); watchEnd(); return; }
    // local list finished: pull more from the live libraries automatically
    if (state.query.trim()) return;
    const canGut = (!state.source || state.source === "Project Gutenberg") && (state.cat === "All" || state.cat === NV);
    if (canGut && await gutenbergNext()) { refilter(true); watchEnd(); return; }
    if (state.cat === "All" && !state.source) LIVE_CATS.forEach((c) => feed(c));
  }
  function setStatus(msg) { const el = $("#bookLive"); if (el) el.textContent = msg || ""; }

  /* ---------- live loading ---------- */
  async function gutenbergNext() {
    if (state.gutEnd || state.gutBusy) return false;
    state.gutBusy = true;
    let added = 0;
    try {
      const L = ($("#bookLang") || {}).value || "en";
      const r = await jf(GUT + "?" + new URLSearchParams({ page: state.gutPage, languages: L }), 20000);
      state.gutTotal = r.count || state.gutTotal; state.gutEnd = !r.next; state.gutPage++;
      (r.results || []).forEach((b) => { if (put(gm(b))) added++; });
    } catch (e) { state.gutEnd = true; setStatus("Gutenberg could not be reached right now. Check your connection."); }
    state.gutBusy = false; drawChrome();
    return added > 0;
  }
  async function runProviders(q, cats) {
    const L = ($("#bookLang") || {}).value || "en";
    const P = PROV.filter((p) => !cats || cats.includes(p.c));
    const rs = await Promise.allSettled(P.map((p) => Promise.race([p.run(q, L), new Promise((_, j) => setTimeout(() => j(new Error("timeout")), 22000))])));
    let ok = 0;
    rs.forEach((r) => {
      if (r.status !== "fulfilled") return;
      ok++;
      (r.value || []).forEach((x) => {
        if (!x || !x.t || !x.dl) return;
        x.live = 1;
        if (state.seen.has(x.u)) { const o = state.all.find((y) => y.u === x.u); if (o && q) (o.qs = o.qs || new Set()).add(norm(q)); return; }
        if (q) x.qs = new Set([norm(q)]);
        put(x);
      });
    });
    return { ok, total: P.length };
  }
  async function feed(cat) {
    if (state.fed[cat]) return; state.fed[cat] = 1;
    setStatus("Loading online libraries…");
    const r = await runProviders("", [cat]);
    setStatus(r.ok ? "" : "Online libraries are not reachable right now. Try again in a moment.");
    drawChrome(); refilter(true);
  }
  async function onlineSearch(q) {
    const seq = ++state.qSeq;
    setStatus("Searching online libraries…");
    const r = await runProviders(q);
    if (seq !== state.qSeq) return;
    setStatus(r.ok ? "" : "Online libraries are not reachable right now.");
    drawChrome(); refilter();
  }

  async function loadPinnacle(force) {
    state.pinErr = false;
    let shown = false;
    if (!force) {
      try { const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null"); if (Array.isArray(c) && c.length) { addPin(c); shown = true; } } catch (e) {}
    }
    try {
      const fresh = (await fetchBooks()).filter((b) => b && b._id);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(fresh)); } catch (e) {}
      addPin(fresh);
    } catch (error) {
      console.error("Pinnacle books error:", error);
      state.pinErr = true;
      if (!shown) setStatus("Pinnacle books could not be loaded. Tap Refresh to retry.");
    }
  }
  function addPin(list) {
    let n = 0;
    list.forEach((x) => { if (put({ u: "P" + x._id, pin: 1, t: noEmoji(x.title || "Untitled book"), a: "", c: examOf(x), s: x.subject || "E-Book", src: "Pinnacle", img: x.image || "", dl: TG, d: strip(x.details), x: ((x.search || "") + " " + (x.category || "")).trim(), _book: x })) n++; });
    if (n) { drawChrome(); refilter(true); }
  }

  async function load(force = false) {
    if (state.loading) return;
    state.loading = true;
    const grid = $("#bookGrid");
    drawChrome(); refilter();           // local books show immediately
    loadPinnacle(force).finally(() => { state.loaded = true; });
    gutenbergNext().then((ok) => { if (ok) refilter(true); });
    state.loading = false;
  }

  /* ---------- Pinnacle chapters + reader ---------- */
  function chapterRow(ch, i) {
    const no = ch.sequence || i + 1;
    return `<div class="chapter-row" data-chapter-id="${escapeHtml(ch._id)}" style="animation-delay:${Math.min(i, 14) * 0.025}s">
      <button class="chapter-open" type="button" data-act="auto" aria-label="Read chapter ${escapeHtml(String(no))}">
        <span class="chapter-no">${escapeHtml(String(no))}</span>
        <span class="chapter-name">${escapeHtml(ch.title || `Chapter ${no}`)}</span>
      </button>
      <button class="chapter-pdf" type="button" data-act="auto" aria-label="Read PDF inside app"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z"/></svg><span>Read</span></button>
      <button class="chapter-tab" type="button" data-act="tab" aria-label="Open PDF in new tab" title="Open PDF in new tab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></button>
    </div>`;
  }

  function renderChapters() {
    const box = $("#chapterList");
    const q = norm($("#chapterSearch").value).trim();
    const list = state.chapters.filter((c) => !q || norm(c.title).includes(q) || String(c.sequence || "").includes(q));
    box.innerHTML = list.length ? list.map((c) => chapterRow(c, state.chapters.indexOf(c))).join("") : `<div class="books-error">${state.chapters.length ? "No chapter matched your search." : "No chapters are available for this book yet."}</div>`;
  }


  async function openBook(bookId) {
    const item = state.all.find((b) => b.u === bookId);
    if (!item || !item._book) return;
    const rawId = item._book._id;
    state.currentBook = { title: item.t, image: item.img };
    const thumb = $("#chaptersThumb"), img = safeUrl(item.img);
    thumb.style.display = img ? "" : "none";
    if (img) thumb.src = img;
    $("#chaptersTitle").textContent = item.t || "Chapters";
    $("#chaptersBadge").textContent = item.s || "E-Book";
    $("#chaptersMeta").textContent = item.c || "";
    $("#chapterSearch").value = "";
    $("#chapterList").innerHTML = Array.from({ length: 7 }, () => '<div class="chapter-skel"></div>').join("");
    openModal("chaptersModal");
    const req = ++state.chapterReq;
    try {
      let chapters = chapterCache.get(rawId);
      if (!chapters) { chapters = await fetchChapters(rawId); chapterCache.set(rawId, chapters); }
      if (req !== state.chapterReq) return;
      state.chapters = chapters;
      $("#chaptersMeta").textContent = `${chapters.length} chapter${chapters.length === 1 ? "" : "s"}${item.c ? " · " + item.c : ""}`;
      renderChapters();
    } catch (error) {
      if (req !== state.chapterReq) return;
      console.error("Chapters error:", error);
      state.chapters = [];
      $("#chapterList").innerHTML = `<div class="books-error"><div>Couldn't load chapters.</div><small class="err-reason">${escapeHtml(error.reason || "Unknown error")}</small><button class="btn" id="chapterRetry" type="button">Try again</button></div>`;
      $("#chapterRetry")?.addEventListener("click", () => openBook(bookId));
      showToast(`Failed to load chapters — ${error.reason || "please try again"}.`, "error");
    }
  }

  const isTouchDevice = () => (window.matchMedia && matchMedia("(pointer: coarse)").matches) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  // Reader frame. Drive links use the Drive preview; phones render PDFs through a document viewer (their iframe can't show a PDF).
  function embedUrl(url) {
    const d = /drive\.google\.com\/file\/d\/([^/]+)/.exec(url);
    if (d) return `https://drive.google.com/file/d/${d[1]}/preview`;
    if (/docs\.google\.com|drive\.google\.com/.test(url)) return url;
    return isTouchDevice() ? "https://docs.google.com/viewer?embedded=true&url=" + encodeURIComponent(url) : url;
  }
  function showInViewer(url, chapter) {
    const frame = $("#pdfFrame"), loading = $("#pdfLoading");
    loading.classList.remove("done");
    const title = `${state.currentBook && state.currentBook.title ? state.currentBook.title + " — " : ""}${chapter.title || "Chapter"}`.replace(/ — $/, "");
    $("#pdfTitle").textContent = title;
    $("#pdfOpenTab").href = url;
    const fileName = title.replace(/[\\/:*?"<>|]+/g, " ").trim() + ".pdf";
    const dl = $("#pdfDownload");
    dl.href = url; dl.setAttribute("download", fileName);
    dl.onclick = async (e) => {
      e.preventDefault();
      try { // save as a real file; needs CORS on the PDF host, otherwise fall back to a new tab
        const r = await fetch(url); if (!r.ok) throw 0;
        const b = URL.createObjectURL(await r.blob());
        const x = document.createElement("a"); x.href = b; x.download = fileName; document.body.appendChild(x); x.click(); x.remove();
        setTimeout(() => URL.revokeObjectURL(b), 4000);
      } catch (err) { window.open(url, "_blank", "noopener,noreferrer"); }
    };
    frame.onload = () => loading.classList.add("done");
    frame.src = embedUrl(url);
    setTimeout(() => loading.classList.add("done"), 8000);
    openModal("pdfModal");
  }
  function readLocal(id) {
    const b = state.all.find((x) => x.u === id); if (!b) return;
    const url = safeUrl(b.dl); if (!url) return;
    state.currentBook = null;
    showInViewer(url, { title: b.t });
  }

  async function openChapter(chapterId, row, mode = "auto") {
    const chapter = state.chapters.find((c) => c._id === chapterId);
    if (!chapter || row.classList.contains("busy")) return;
    const wantTab = mode === "tab";
    // Open the tab *now*, inside the tap, so popup blockers allow it; point it at the PDF once the link arrives.
    let win = null;
    if (wantTab) {
      try {
        win = window.open("", "_blank");
        if (win) win.document.write('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Loading PDF…</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#090b10;color:#a69cff;font:600 16px system-ui,sans-serif">Loading PDF…</body>');
      } catch (e) { win = null; }
    }
    row.classList.add("busy");
    const pill = row.querySelector(mode === "tab" ? ".chapter-tab" : ".chapter-pdf");
    const pillHtml = pill ? pill.innerHTML : "";
    if (pill) pill.innerHTML = '<span class="mini-spin"></span>';
    try {
      const url = safeUrl(await fetchPdfUrl(chapterId));
      if (!url) throw Object.assign(new Error("No PDF link"), { reason: "This chapter has no PDF link" });
      if (wantTab) {
        if (win && !win.closed) { try { win.opener = null; } catch (e) {} win.location.replace(url); win = null; }
        else { const w2 = window.open(url, "_blank", "noopener,noreferrer"); if (!w2) showInViewer(url, chapter); }
      } else {
        showInViewer(url, chapter);
      }
    } catch (error) {
      console.error("PDF error:", error);
      if (win && !win.closed) win.close();
      showToast(`Couldn't open this PDF — ${error.reason || "please try again"}.`, "error");
    } finally {
      row.classList.remove("busy");
      if (pill) pill.innerHTML = pillHtml;
    }
  }


  function setup() {
    const search = $("#bookSearch");
    let t, t2;
    search?.addEventListener("input", () => {
      clearTimeout(t); clearTimeout(t2);
      t = setTimeout(() => { state.query = search.value; refilter(); }, 80);
      const q = search.value.trim();
      if (q.length >= 2) t2 = setTimeout(() => onlineSearch(q), 600); else setStatus("");
    });
    $("#bookExams")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-exam]"); if (!b) return;
      state.cat = b.dataset.exam;
      $$("#bookExams .exam-tag").forEach((x) => x.classList.toggle("active", x === b));
      refilter();
      if (LIVE_CATS.includes(state.cat)) feed(state.cat);
    });
    $("#bookSubject")?.addEventListener("change", (e) => { state.subject = e.target.value; refilter(); });
    $("#bookSource")?.addEventListener("change", (e) => { state.source = e.target.value; refilter(); });
    $("#bookSort")?.addEventListener("change", () => refilter());
    $("#bookLang")?.addEventListener("change", () => { state.gutPage = 1; state.gutEnd = false; const q = state.query.trim(); if (q.length >= 2) onlineSearch(q); else gutenbergNext().then(() => refilter(true)); });
    $("#bookClear")?.addEventListener("click", () => {
      state.cat = "All"; state.subject = ""; state.source = ""; state.query = ""; search.value = ""; setStatus("");
      const so = $("#bookSort"); if (so) so.value = "rel";
      drawChrome(); refilter();
    });
    $("#bookGrid")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-book-id]"); if (b) { openBook(b.dataset.bookId); return; }
      const r = e.target.closest("[data-read]"); if (r) readLocal(r.dataset.read);
    });
    $("#chapterList")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]"); if (!btn) return;
      const row = btn.closest("[data-chapter-id]"); if (row) openChapter(row.dataset.chapterId, row, btn.dataset.act);
    });
    let ct;
    $("#chapterSearch")?.addEventListener("input", () => { clearTimeout(ct); ct = setTimeout(renderChapters, 80); });
    // stop the PDF and free memory when the viewer closes
    new MutationObserver(() => {
      const modal = $("#pdfModal");
      if (modal && !modal.classList.contains("visible")) { const f = $("#pdfFrame"); if (f && f.getAttribute("src")) f.removeAttribute("src"); }
    }).observe($("#pdfModal"), { attributes: true, attributeFilter: ["class"] });
    // books are shown right away, no tap needed
    load();
  }

  return { setup, ensureLoaded() { if (!state.loaded && !state.loading) load(); }, refresh() { state.fed = {}; state.gutPage = 1; state.gutEnd = false; loadPinnacle(true).then(() => refilter(true)); } };
})();

document.addEventListener("DOMContentLoaded", () => {
  PinnacleBooks.setup();
  setupDetailModal();
  setupScrollProgress();
  setupShortcuts();
  setupNavigation();
  setupModals();
  setupFilters();
  setupLoadMore();
  setupViewToggle();
  setupThemePicker();
  setupPreferences();
  setupFxEngine();
  setupNetworkStatus();
  setupAnnouncements();
  setupHeaderActions();
  setupTelegramPopup();
  setupInstallPrompt();
  setupQuickInstall();
  setupBackToTop();
  setupOfflineBanner();
  registerServiceWorker();
  loadBatches();
});


/* Disable page zoom (pinch, double-tap, ctrl+wheel, ctrl +/-) */
(() => {
  ["gesturestart", "gesturechange", "gestureend"].forEach((t) =>
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener("touchmove", (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  let lastTouch = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouch < 300) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
  document.addEventListener("wheel", (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && ["+", "=", "-", "_", "0"].includes(e.key)) e.preventDefault();
  });
})();
