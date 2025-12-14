// frontend/components/FilterBar.js
// Search + filters (platform, genre, status, rating, date range) + sort.
// Works with your existing element IDs: q/status/minRating/dateFrom/dateTo/platformChips/genreChips/sortBy/applyBtn/clearBtn

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function parseMinRating(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function uniqSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function buildChip(label, pressed = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.setAttribute("aria-pressed", pressed ? "true" : "false");
  b.textContent = label;
  return b;
}

/**
 * Creates a filter bar controller bound to the current page DOM.
 */
export function initFilterBar({
  root = document,
  onApply,       // (filters) => void
  onClear,       // () => void
  onChange       // optional: (filters) => void
} = {}) {
  const $ = (sel) => root.querySelector(sel);

  const els = {
    q: $("#q"),
    status: $("#status"),
    minRating: $("#minRating"),
    dateFrom: $("#dateFrom"),
    dateTo: $("#dateTo"),
    sortBy: $("#sortBy"),
    platformChips: $("#platformChips"),
    genreChips: $("#genreChips"),
    applyBtn: $("#applyBtn"),
    clearBtn: $("#clearBtn")
  };

  // Some pages (favorites, etc.) might not have filters; return no-op controller
  const required = [els.platformChips, els.genreChips, els.applyBtn, els.clearBtn].every(Boolean);
  if (!required) {
    return {
      getFilters: () => ({}),
      setOptions: () => {},
      apply: () => {},
      clear: () => {}
    };
  }

  const state = {
    selPlatforms: new Set(),
    selGenres: new Set()
  };

  function getFilters() {
    return {
      q: (els.q?.value || "").trim().toLowerCase(),
      status: els.status?.value || "",
      minRating: parseMinRating(els.minRating?.value),
      dateFrom: els.dateFrom?.value || "",
      dateTo: els.dateTo?.value || "",
      sortBy: els.sortBy?.value || "releaseDesc",
      platforms: [...state.selPlatforms],
      genres: [...state.selGenres]
    };
  }

  function emitChange() {
    onChange?.(getFilters());
  }

  function setChipPressed(btn, isPressed) {
    btn.setAttribute("aria-pressed", isPressed ? "true" : "false");
  }

  function renderChips(container, values, selectedSet) {
    container.innerHTML = "";
    for (const v of values) {
      const btn = buildChip(v, selectedSet.has(v));
      btn.addEventListener("click", () => {
        if (selectedSet.has(v)) {
          selectedSet.delete(v);
          setChipPressed(btn, false);
        } else {
          selectedSet.add(v);
          setChipPressed(btn, true);
        }
        emitChange();
      });
      container.appendChild(btn);
    }
  }

  function setOptions({ platforms = [], genres = [] } = {}) {
    renderChips(els.platformChips, uniqSorted(platforms), state.selPlatforms);
    renderChips(els.genreChips, uniqSorted(genres), state.selGenres);
  }

  function clear() {
    els.q && (els.q.value = "");
    els.status && (els.status.value = "");
    els.minRating && (els.minRating.value = "");
    els.dateFrom && (els.dateFrom.value = "");
    els.dateTo && (els.dateTo.value = "");
    state.selPlatforms.clear();
    state.selGenres.clear();

    // Reset chip UI
    root.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));

    onClear?.();
    emitChange();
  }

  function apply() {
    onApply?.(getFilters());
  }

  // Hook buttons
  els.applyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    apply();
  });
  els.clearBtn.addEventListener("click", (e) => {
    e.preventDefault();
    clear();
  });

  // Optional “live filtering”
  ["input", "change"].forEach((evt) => {
    els.q?.addEventListener(evt, emitChange);
    els.status?.addEventListener(evt, emitChange);
    els.minRating?.addEventListener(evt, emitChange);
    els.dateFrom?.addEventListener(evt, emitChange);
    els.dateTo?.addEventListener(evt, emitChange);
    els.sortBy?.addEventListener(evt, emitChange);
  });

  return { getFilters, setOptions, apply, clear };
}

/**
 * Pure helper: filter + sort games using the same logic you had in your original frontend.
 */
export function filterAndSortGames(games, filters) {
  const {
    q = "",
    status = "",
    minRating = null,
    dateFrom = "",
    dateTo = "",
    sortBy = "releaseDesc",
    platforms = [],
    genres = []
  } = filters || {};

  let out = [...(games || [])];

  // title/keywords (title + description)
  if (q) {
    out = out.filter((g) => {
      const t = String(g?.title || "").toLowerCase();
      const d = String(g?.description || "").toLowerCase();
      return t.includes(q) || d.includes(q);
    });
  }

  if (status) out = out.filter((g) => g?.status === status);

  if (platforms.length) {
    const s = new Set(platforms);
    out = out.filter((g) => (g?.platform || []).some((p) => s.has(p)));
  }

  if (genres.length) {
    const s = new Set(genres);
    out = out.filter((g) => (g?.genre || []).some((x) => s.has(x)));
  }

  if (minRating !== null) {
    out = out.filter((g) => (g?.averageRating || 0) >= minRating);
  }

  const from = dateOrNull(dateFrom);
  if (from) {
    out = out.filter((g) => g?.releaseDate && new Date(g.releaseDate) >= from);
  }

  const to = dateOrNull(dateTo);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    out = out.filter((g) => g?.releaseDate && new Date(g.releaseDate) <= end);
  }

  // sort
  out.sort((a, b) => {
    if (sortBy === "titleAsc") return String(a?.title || "").localeCompare(String(b?.title || ""));
    if (sortBy === "ratingDesc") return (b?.averageRating || 0) - (a?.averageRating || 0);

    const da = a?.releaseDate ? new Date(a.releaseDate).getTime() : 0;
    const db = b?.releaseDate ? new Date(b.releaseDate).getTime() : 0;
    return sortBy === "releaseAsc" ? da - db : db - da;
  });

  return out;
}

/**
 * Pure helper: compute available platform/genre options from a game list.
 */
export function computeFilterOptions(games) {
  const platforms = [];
  const genres = [];
  for (const g of games || []) {
    for (const p of (g?.platform || [])) platforms.push(p);
    for (const x of (g?.genre || [])) genres.push(x);
  }
  return {
    platforms: uniqSorted(platforms),
    genres: uniqSorted(genres)
  };
}
