// frontend/js/main.js
// App bootstrap: auth check, routing, component initialization

import { bindImageUrlPreview } from "../utils/imageHandler.js";
import * as Auth from "../services/auth.js";
import * as API from "../services/api.js";

import * as Calendar from "../components/Calendar.js";
import * as FilterBar from "../components/FilterBar.js";
import * as GameCard from "../components/GameCard.js";
import * as ReviewForm from "../components/ReviewForm.js";

const PAGES_BASE = new URL("../pages/", import.meta.url);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Tiny HTML-escape helper for template strings
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[c]));
}

function pageUrl(rel) {
  return new URL(rel, PAGES_BASE).toString();
}
function navTo(rel) {
  window.location.assign(pageUrl(rel));
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function detectPageKey() {
  const p = (window.location.pathname || "").replaceAll("\\", "/");

  // Root index.html (frontend/index.html) -> redirect to shared/index.html
  if (!p.includes("/pages/") && p.endsWith("/index.html")) return "root-index";

  if (p.endsWith("/pages/shared/index.html")) return "shared-index";
  if (p.endsWith("/pages/shared/catalog.html")) return "shared-catalog";
  if (p.endsWith("/pages/shared/game-detail.html")) return "shared-game-detail";

  if (p.endsWith("/pages/user/index.html")) return "user-index";
  if (p.endsWith("/pages/user/favorites.html")) return "user-favorites";
  if (p.endsWith("/pages/user/my-reviews.html")) return "user-my-reviews";
  if (p.endsWith("/pages/user/calendar.html")) return "user-calendar";

  if (p.endsWith("/pages/admin/index.html")) return "admin-index";
  if (p.endsWith("/pages/admin/add-game.html")) return "admin-add-game";
  if (p.endsWith("/pages/admin/edit-game.html")) return "admin-edit-game";
  if (p.endsWith("/pages/admin/calendar.html")) return "admin-calendar";
  if (p.endsWith("/pages/admin/reviews.html")) return "admin-reviews";

  // If you added body data-page, we’ll accept it as a fallback.
  return document.body?.dataset?.page || "unknown";
}

function getSession() {
  // tolerate different export names
  const s = (Auth.getSession && Auth.getSession()) || {};
  const token = s?.token || localStorage.getItem("token") || null;
  const user =
    s?.user ||
    (() => {
      try {
        return JSON.parse(localStorage.getItem("user") || "null");
      } catch {
        return null;
      }
    })();

  const loggedIn = !!(token && user);
  const isAdmin = loggedIn && (user.userType === "Admin" || user.role === "Admin");
  return { token, user, loggedIn, isAdmin };
}


function enhanceDateYearSelect(scope = document) {
  const inputs = Array.from(scope.querySelectorAll('input[type="date"]'));
  if (!inputs.length) return;

  const nowY = new Date().getFullYear();
  const years = [];
  for (let y = nowY - 10; y <= nowY + 10; y++) years.push(y);

  for (const input of inputs) {
    if (input.dataset.yearEnhanced === "1") continue;
    input.dataset.yearEnhanced = "1";

    const wrap = document.createElement("div");
    wrap.className = "datewrap";

    // Create year select
    const sel = document.createElement("select");
    sel.className = "year";
    sel.setAttribute("aria-label", "Year");
    sel.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");

    const setSelFromInput = () => {
      const v = input.value;
      const y = v ? Number(String(v).slice(0, 4)) : nowY;
      sel.value = String(y);
    };

    const applyYearToInput = () => {
      const y = Number(sel.value);
      if (!input.value) {
        // If empty, set a safe default date so user can refine using the date picker.
        input.value = `${y}-01-01`;
      } else {
        const [_, m, d] = String(input.value).split("-");
        input.value = `${y}-${m || "01"}-${d || "01"}`;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    sel.addEventListener("change", applyYearToInput);
    input.addEventListener("change", setSelFromInput);

    // Wrap: replace input with wrap containing input + select
    const parent = input.parentElement;
    if (parent) {
      parent.insertBefore(wrap, input);
      wrap.appendChild(input);
      wrap.appendChild(sel);
      setSelFromInput();
    }
  }
}


function enhanceCustomSelects(scope = document) {
  const selects = Array.from(scope.querySelectorAll("select"))
    .filter((s) => !s.dataset.customSelect && !s.multiple && (!s.size || s.size <= 1) && !s.closest(".cselect"));

  if (!selects.length) return;

  // One global outside-click handler
  if (!document.documentElement.dataset.cselectBound) {
    document.documentElement.dataset.cselectBound = "1";
    document.addEventListener("click", (e) => {
      const openOnes = Array.from(document.querySelectorAll(".cselect.open"));
      for (const w of openOnes) {
        if (!w.contains(e.target)) w.classList.remove("open");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".cselect.open").forEach((w) => w.classList.remove("open"));
      }
    });
  }

  for (const sel of selects) {
    sel.dataset.customSelect = "1";

    // Copy any sizing/utility classes (e.g., "year") onto the wrapper BEFORE hiding the native <select>
    const extraClass = sel.className ? String(sel.className).trim() : "";
    sel.classList.add("cselect-native");

    const wrap = document.createElement("div");
    const safeExtra = extraClass.replace(/\bcselect-native\b/g, "").trim();
    wrap.className = "cselect" + (safeExtra ? " " + safeExtra : "");

    // Replace select with wrapper
    const parent = sel.parentElement;
    if (!parent) continue;
    parent.insertBefore(wrap, sel);
    wrap.appendChild(sel);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cselect-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `<span class="label"></span><span class="arrow">▾</span>`;

    const label = btn.querySelector(".label");

    const pop = document.createElement("div");
    pop.className = "cselect-pop";
    pop.setAttribute("role", "listbox");

    wrap.appendChild(btn);
    wrap.appendChild(pop);

    const buildOptions = () => {
      pop.innerHTML = "";
      for (const opt of Array.from(sel.options)) {
        const o = document.createElement("button");
        o.type = "button";
        o.className = "cselect-opt";
        o.textContent = opt.textContent || opt.label || opt.value;
        o.dataset.value = opt.value;
        o.disabled = !!opt.disabled;
        o.setAttribute("role", "option");
        o.setAttribute("aria-selected", opt.value === sel.value ? "true" : "false");

        o.addEventListener("click", () => {
          if (opt.disabled) return;
          sel.value = opt.value;
          sel.dispatchEvent(new Event("input", { bubbles: true }));
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          wrap.classList.remove("open");
          btn.setAttribute("aria-expanded", "false");
          btn.focus();
        });

        o.addEventListener("keydown", (e) => {
          const opts = Array.from(pop.querySelectorAll(".cselect-opt:not([disabled])"));
          const idx = opts.indexOf(o);
          if (e.key === "ArrowDown") {
            e.preventDefault();
            (opts[idx + 1] || opts[0])?.focus();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            (opts[idx - 1] || opts[opts.length - 1])?.focus();
          } else if (e.key === "Escape") {
            e.preventDefault();
            wrap.classList.remove("open");
            btn.setAttribute("aria-expanded", "false");
            btn.focus();
          }
        });

        pop.appendChild(o);
      }
    };

    const sync = () => {
      const t = sel.options[sel.selectedIndex]?.textContent || sel.value || "";
      if (label) label.textContent = t;
      pop.querySelectorAll(".cselect-opt").forEach((o) => {
        o.setAttribute("aria-selected", o.dataset.value === sel.value ? "true" : "false");
      });
    };

    const open = () => {
      // Open first so pop has layout for measurements
      wrap.classList.add("open");
      btn.setAttribute("aria-expanded", "true");

      // If we're near the bottom of the viewport, open upwards (prevents clipping)
      wrap.classList.remove("dropup");
      try {
        const btnRect = btn.getBoundingClientRect();
        // Use the CSS max height (or a sane fallback) for the pop measurement
        const cssMaxH = parseFloat(getComputedStyle(pop).maxHeight) || 260;
        const popH = Math.min(pop.scrollHeight || cssMaxH, cssMaxH);
        const spaceBelow = window.innerHeight - btnRect.bottom - 12;
        const spaceAbove = btnRect.top - 12;
        if (spaceBelow < popH && spaceAbove > spaceBelow) wrap.classList.add("dropup");
      } catch (_) {
        // no-op
      }

      // Focus the selected option for keyboard users, but DON'T scroll the page
      const active = pop.querySelector(`.cselect-opt[aria-selected="true"]`) || pop.querySelector(".cselect-opt:not([disabled])");
      if (active) {
        try {
          active.focus({ preventScroll: true });
        } catch (_) {
          active.focus();
        }
      }
    };

    const toggle = () => {
      const isOpen = wrap.classList.contains("open");
      document.querySelectorAll(".cselect.open").forEach((w) => w !== wrap && w.classList.remove("open"));
      if (isOpen) {
        wrap.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      } else {
        open();
      }
    };

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      toggle();
    });

    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!wrap.classList.contains("open")) open();
      } else if (e.key === "Escape") {
        wrap.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      }
    });

    sel.addEventListener("change", () => {
      // In case options changed dynamically, rebuild once
      if (pop.childElementCount !== sel.options.length) buildOptions();
      sync();
    });

    // Initial render
    buildOptions();
    sync();
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showToast(msg) {
  // If you have a toast element, use it; otherwise alert.
  const box = $("#toast");
  if (!box) return alert(msg);
  box.textContent = msg;
  box.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (box.hidden = true), 2500);
}

function setAuthedNavUI() {
  const { loggedIn, user, isAdmin } = getSession();

  // Update BOTH id styles (so you don't have to edit every HTML page)
  if (loggedIn && user) {
    const name = user.username || "User";
    const role = isAdmin ? "Admin" : "Registered";

    setText("pillName", name);
    setText("pillRole", role);

    setText("userPillName", name);
    setText("userPillRole", role);
  } else {
    setText("pillName", "Guest");
    setText("pillRole", "Browsing");

    setText("userPillName", "Guest");
    setText("userPillRole", "Browsing");
  }

  const loginBtn = $("#loginBtn");
  const logoutBtn = $("#logoutBtn");

  if (loginBtn) loginBtn.hidden = loggedIn;
  if (logoutBtn) logoutBtn.hidden = !loggedIn;

  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      try {
        if (Auth.logout) await Auth.logout();
      } finally {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navTo("shared/index.html");
      }
    };
  }
}


function initAuthModal() {
  const modal = document.getElementById("authModal");
  if (!modal) return;

  // ✅ Prevent duplicate binding if boot() runs again
  if (modal.dataset.bound === "1") return;
  modal.dataset.bound = "1";

  // --- Elements ---
  const loginBtnTop = document.getElementById("loginBtn");
  const openLogin = document.getElementById("openLogin");
  const openRegister = document.getElementById("openRegister");

  const authClose = document.getElementById("authClose");
  const tabLogin = document.getElementById("tabLogin");
  const tabRegister = document.getElementById("tabRegister");
  const paneLogin = document.getElementById("paneLogin");
  const paneRegister = document.getElementById("paneRegister");

  const toLogin = document.getElementById("toLogin");
  const toRegister = document.getElementById("toRegister");

  const loginForm = document.getElementById("loginForm") || document.querySelector("#paneLogin form");
  const registerForm = document.getElementById("registerForm") || document.querySelector("#paneRegister form");
  const errorBox = document.getElementById("authError");

  // --- Helpers ---
  const setError = (msg) => {
    if (!errorBox) return showToast(msg);
    errorBox.textContent = msg;
    errorBox.hidden = !msg;
  };

  const setMode = (mode) => {
    setError(""); // ✅ clear stale error when switching tabs

    const isLogin = mode === "login";

    if (paneLogin) paneLogin.hidden = !isLogin;
    if (paneRegister) paneRegister.hidden = isLogin;

    tabLogin?.classList.toggle("active", isLogin);
    tabRegister?.classList.toggle("active", !isLogin);
    tabLogin?.setAttribute("aria-selected", isLogin ? "true" : "false");
    tabRegister?.setAttribute("aria-selected", isLogin ? "false" : "true");
  };

  const open = (mode) => {
    setMode(mode);

    // ✅ If already open, don't call showModal again (it can throw)
    if (modal.open) {
      modal.setAttribute("aria-hidden", "false");
      return;
    }

    if (typeof modal.showModal === "function") modal.showModal();
    else modal.setAttribute("open", "");

    modal.setAttribute("aria-hidden", "false");
  };

  const close = () => {
    if (typeof modal.close === "function") modal.close();
    else modal.removeAttribute("open");

    modal.setAttribute("aria-hidden", "true");
  };

  async function afterAuthRedirect() {
    const { isAdmin } = getSession();
    navTo(isAdmin ? "admin/index.html" : "user/index.html");
  }

  // --- Keep aria-hidden correct for native dialog closes (ESC, etc.) ---
  modal.addEventListener("close", () => {
    modal.setAttribute("aria-hidden", "true");
  });
  modal.addEventListener("cancel", () => {
    modal.setAttribute("aria-hidden", "true");
  });

  // --- Open / Close wiring ---
  loginBtnTop?.addEventListener("click", () => open("login"));
  openLogin?.addEventListener("click", () => open("login"));
  openRegister?.addEventListener("click", () => open("register"));

  authClose?.addEventListener("click", close);

  // click outside closes
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  // --- Tab / link wiring ---
  tabLogin?.addEventListener("click", () => setMode("login"));
  tabRegister?.addEventListener("click", () => setMode("register"));
  toLogin?.addEventListener("click", () => setMode("login"));
  toRegister?.addEventListener("click", () => setMode("register"));

  // --- Form submits (same logic as yours) ---
  if (loginForm && !loginForm.dataset.bound) {
    loginForm.dataset.bound = "1";
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setError("");

      const email = (document.getElementById("loginEmail")?.value || "").trim();
      const password = document.getElementById("loginPassword")?.value || "";

      try {
        if (!Auth.login) throw new Error("Missing Auth.login() in services/auth.js");
        await Auth.login({ email, password });
        close();
        await afterAuthRedirect();
      } catch (err) {
        setError(err?.message || "Login failed.");
      }
    });
  }

  if (registerForm && !registerForm.dataset.bound) {
    registerForm.dataset.bound = "1";
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setError("");

      const username = (document.getElementById("regUsername")?.value || "").trim();
      const email = (document.getElementById("regEmail")?.value || "").trim();
      const password = document.getElementById("regPassword")?.value || "";
      const userType = document.getElementById("regUserType")?.value || "Registered";

      try {
        if (!Auth.register) throw new Error("Missing Auth.register() in services/auth.js");
        await Auth.register({ username, email, password, userType });
        close();
        await afterAuthRedirect();
      } catch (err) {
        setError(err?.message || "Registration failed.");
      }
    });
  }

  setMode("login");
}



function requireLoggedIn() {
  const { loggedIn } = getSession();
  if (!loggedIn) navTo("shared/index.html");
  return loggedIn;
}

function requireAdmin() {
  const { loggedIn, isAdmin } = getSession();
  if (!loggedIn) navTo("shared/index.html");
  if (loggedIn && !isAdmin) navTo("user/index.html");
  return loggedIn && isAdmin;
}

async function loadAllGamesSafe() {
  if (!API.gameAPI?.getAll) throw new Error("Missing gameAPI.getAll() in services/api.js");
  return await API.gameAPI.getAll({});
}

function normalizeGameId(g) {
  return g?._id || g?.id || g?.gameId || null;
}

function normalizeUserId(u) {
  return u?._id || u?.id || null;
}

async function loadFavoriteSet() {
  const { loggedIn, isAdmin } = getSession();
  if (!loggedIn || isAdmin) return new Set();

  if (!API.favoriteAPI?.getAll) return new Set();
  const favs = await API.favoriteAPI.getAll();

  // backend usually returns favorite docs, often with populated gameId
  const ids = new Set();
  for (const f of favs || []) {
    const game = f.gameId || f.game || f;
    const id = normalizeGameId(game) || f.gameId;
    if (id) ids.add(String(id));
  }
  return ids;
}

function setStatsFromGames(games) {
  const all = games?.length || 0;
  const up = (games || []).filter((g) => g.status === "Upcoming").length;
  const rel = (games || []).filter((g) => g.status === "Released").length;

  setText("statGames", String(all));
  setText("statUpcoming", String(up));
  setText("statReleased", String(rel));
}

function getGridEl() {
  // Support all pages without having to keep IDs perfectly identical.
  return (
    $("#grid") ||
    $("#adminGrid") ||
    $("#favGrid") ||
    $("#gameGrid") ||
    $("#gamesGrid")
  );
}

function getEmptyEl() {
  return (
    $("#empty") ||
    $("#adminEmpty") ||
    $("#favEmpty") ||
    $("#myReviewEmpty") ||
    $("#adminReviewEmpty")
  );
}

function setEmptyVisible(visible) {
  const empty = getEmptyEl();
  if (empty) empty.hidden = !visible;
}

function openGameDetail(gameId) {
  const u = new URL(pageUrl("shared/game-detail.html"));
  u.searchParams.set("id", gameId);
  window.location.assign(u.toString());
}

async function initCatalogPage({ mode }) {
  const grid = getGridEl();
  if (!grid) return;

  // Inputs (from catalog.html)
  const qEl = document.getElementById("q");
  const statusEl = document.getElementById("status");
  const minRatingEl = document.getElementById("minRating");
  const dateFromEl = document.getElementById("dateFrom");
  const dateToEl = document.getElementById("dateTo");
  const sortEl = document.getElementById("sortBy");
  const refreshBtn = document.getElementById("refreshBtn");
  const applyBtn = document.getElementById("applyBtn");
  const clearBtn = document.getElementById("clearBtn");

  const platformChipsEl = document.getElementById("platformChips");
  const genreChipsEl = document.getElementById("genreChips");

  const { loggedIn, isAdmin } = getSession();
  let favoriteSet = await loadFavoriteSet();

  // Prevent duplicate event wiring if boot() runs again
  if (document.body.dataset.catalogBound === "1") {
    // still rerender games if needed
  } else {
    document.body.dataset.catalogBound = "1";
  }

  const selectedPlatforms = new Set();
  const selectedGenres = new Set();

  const uniqSorted = (arr) =>
    Array.from(new Set(arr.filter(Boolean).map(String))).sort((a, b) => a.localeCompare(b));

  function renderChipGroup(container, values, selectedSet) {
    if (!container) return;
    container.innerHTML = "";

    if (!values.length) {
      container.innerHTML = `<div class="muted">—</div>`;
      return;
    }

    for (const val of values) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = val;
      b.dataset.value = val;

      const sync = () => {
        const on = selectedSet.has(val);
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      };

      b.addEventListener("click", () => {
        if (selectedSet.has(val)) selectedSet.delete(val);
        else selectedSet.add(val);
        sync();
        // instant filtering
        rerender();
      });

      sync();
      container.appendChild(b);
    }
  }

  function matchesMulti(valueArr, selectedSet) {
    if (!selectedSet.size) return true;
    const set = new Set((valueArr || []).map(String));
    for (const s of selectedSet) if (set.has(String(s))) return true;
    return false;
  }

  function applyFilters(games) {
    const q = (qEl?.value || "").trim().toLowerCase();
    const status = statusEl?.value || "";
    const minRating = Number(minRatingEl?.value || 0);
    const df = dateFromEl?.value ? new Date(dateFromEl.value).getTime() : null;
    const dt = dateToEl?.value ? new Date(dateToEl.value).getTime() : null;

    return (games || []).filter((g) => {
      // keyword match
      if (q) {
        const hay = [
          g.title,
          g.description,
          ...(g.platform || []),
          ...(g.genre || []),
          g.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!hay.includes(q)) return false;
      }

      // status match
      if (status && String(g.status || "") !== status) return false;

      // rating match (use averageRating if your backend provides it)
      const ar = Number(g.averageRating || 0);
      if (minRating && ar < minRating) return false;

      // date range match
      if (df || dt) {
        const t = g.releaseDate ? new Date(g.releaseDate).getTime() : null;
        if (!t) return false;
        if (df && t < df) return false;
        if (dt && t > dt) return false;
      }

      // multi chips
      if (!matchesMulti(g.platform || [], selectedPlatforms)) return false;
      if (!matchesMulti(g.genre || [], selectedGenres)) return false;

      return true;
    });
  }

  function sortGames(games) {
    const sort = sortEl?.value || "releaseDesc";
    const copy = [...games];

    copy.sort((a, b) => {
      if (sort === "titleAsc") return (a.title || "").localeCompare(b.title || "");
      if (sort === "ratingDesc") return (Number(b.averageRating || 0)) - (Number(a.averageRating || 0));

      const da = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
      const db = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
      return sort === "releaseAsc" ? da - db : db - da;
    });

    return copy;
  }

  const render = (games) => {
    setStatsFromGames(games);

    if (!games || games.length === 0) {
      setEmptyVisible(true);
      grid.innerHTML = "";
      return;
    }
    setEmptyVisible(false);

    if (GameCard.renderGameGrid) {
      GameCard.renderGameGrid({
        container: grid,
        games,
        favoriteSet,
        mode: isAdmin ? "admin" : loggedIn ? "user" : "guest",
        onDetails: (g) => openGameDetail(normalizeGameId(g)),
        onFavoriteToggle: async (g) => {
          const id = String(normalizeGameId(g));

          if (!loggedIn) {
            const loginBtn = document.getElementById("loginBtn");
            loginBtn ? loginBtn.click() : showToast("Please login to favorite.");
            return;
          }
          if (isAdmin) return;

          if (!API.favoriteAPI) return;

          if (favoriteSet.has(id)) {
            await API.favoriteAPI.remove(id);
            favoriteSet.delete(id);
          } else {
            await API.favoriteAPI.add(id);
            favoriteSet.add(id);
          }

          // re-render immediately
          rerender();
        },
        onEdit: (g) => {
          const id = normalizeGameId(g);
          const u = new URL(pageUrl("admin/edit-game.html"));
          u.searchParams.set("id", id);
          window.location.assign(u.toString());
        },
        onDelete: async (g) => {
          const id = normalizeGameId(g);
          if (!confirm("Delete this game?")) return;
          await API.gameAPI.delete(id);
          showToast("Game deleted.");
          await boot();
        },
      });
    } else {
      // fallback
      grid.innerHTML = "";
      for (const g of games) {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
          <div class="card-body">
            <div class="card-title">${g.title || "Untitled"}</div>
            <div class="muted">${g.status || "—"} • ${(Number(g.averageRating || 0)).toFixed(1)}★</div>
          </div>
          <div class="card-foot">
            <button class="btn ghost" type="button">Details</button>
          </div>
        `;
        card.querySelector("button").onclick = () => openGameDetail(normalizeGameId(g));
        grid.appendChild(card);
      }
    }
  };

  // Load all games once
  const allGames = await loadAllGamesSafe();

  // Build chip values based on dataset
  const platformVals = uniqSorted(allGames.flatMap((g) => g.platform || []));
  const genreVals = uniqSorted(allGames.flatMap((g) => g.genre || []));

  renderChipGroup(platformChipsEl, platformVals, selectedPlatforms);
  renderChipGroup(genreChipsEl, genreVals, selectedGenres);

  const rerender = () => {
    const filtered = applyFilters(allGames);
    const sorted = sortGames(filtered);
    render(sorted);
  };


  // Wire live listeners for all filter controls
  const wire = (el, ev) => el && el.addEventListener(ev, () => rerender());
  wire(qEl, "input");
  wire(statusEl, "change");
  wire(minRatingEl, "change");
  wire(dateFromEl, "change");
  wire(dateToEl, "change");
  wire(sortEl, "change");

  // Live filtering (no Apply button)
  clearBtn && (clearBtn.onclick = () => {
    // clear inputs
    ["q", "status", "minRating", "dateFrom", "dateTo"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    // clear chip selections
    selectedPlatforms.clear();
    selectedGenres.clear();

    // re-render chips to remove active states
    renderChipGroup(platformChipsEl, platformVals, selectedPlatforms);
    renderChipGroup(genreChipsEl, genreVals, selectedGenres);

    rerender();
  });

  refreshBtn && (refreshBtn.onclick = async () => {
    // hard reload data from server
    document.body.dataset.catalogBound = "0"; // allow rebinding
    await boot();
  });

  sortEl && (sortEl.onchange = rerender);

  // Quality-of-life: press Enter in search triggers Apply
  qEl && qEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") rerender();
  });

  rerender();
}


async function initSharedIndex() {
  // If already logged in, stop pretending and redirect.
  const { loggedIn, isAdmin } = getSession();
  if (loggedIn) navTo(isAdmin ? "admin/index.html" : "user/index.html");

  // Otherwise: do nothing special; modal + buttons handle it.
}

async function initSharedGameDetail() {
  const gameId = getQueryParam("id");
  if (!gameId) {
    showToast("Missing game id.");
    navTo("shared/catalog.html");
    return;
  }

  const { loggedIn, isAdmin, user } = getSession();
  const canFavorite = loggedIn && !isAdmin;
  const canReview = loggedIn && !isAdmin;
  // Admins can't post reviews/favorites, but they *can* moderate (delete) reviews.
  const canModerate = loggedIn && isAdmin;

  // --- DOM (support your current game-detail.html IDs) ---
  const hero = $("#heroImg");
  const titleEl = $("#gameTitle");
  const subEl = $("#gameSub");

  const statusEl = $("#gStatus");
  const releaseEl = $("#gRelease");
  const ratingEl = $("#gRating");
  const tagsEl = $("#gTags");
  const descEl = $("#gDesc");

  const favBtn = $("#favBtn");
  const favHint = $("#favHint");
  const backBtn = $("#backBtn");

  const reviewComposer = $("#reviewComposer");
  const reviewLocked = $("#reviewLocked");
  const ratingSel = $("#ratingSel");
  const reviewText = $("#reviewText");
  const postReviewBtn = $("#postReview");

  // your HTML uses #reviewList, but keep compatibility with older #reviewsList too
  const reviewListEl = $("#reviewList") || $("#reviewsList");

  // back button
  if (backBtn) {
    backBtn.onclick = () => {
      if (history.length > 1) history.back();
      else navTo("shared/catalog.html");
    };
  }

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[c]));

  const stars = (n) => {
    const v = Math.max(0, Math.min(5, Number(n) || 0));
    const full = "★".repeat(v);
    const empty = "☆".repeat(5 - v);
    return full + empty;
  };

  const fmtDate = (d) => {
    if (!d) return "—";
    const dt = new Date(d);
    return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString();
  };

  // --- Load game ---
  if (!API.gameAPI?.getById) throw new Error("Missing gameAPI.getById()");
  const data = await API.gameAPI.getById(gameId);
  const game = data?.game || data;

  // --- Populate header + fields ---
  if (titleEl) titleEl.textContent = game?.title || "Game";
  if (subEl) subEl.textContent = "Game Details";

  if (statusEl) statusEl.textContent = game?.status || "—";
  if (releaseEl) releaseEl.textContent = fmtDate(game?.releaseDate);
  if (ratingEl) {
    const avg = Number(game?.averageRating || 0).toFixed(1);
    const total = Number(game?.totalRatings || 0);
    ratingEl.textContent = `${avg} ★ (${total})`;
  }

  if (descEl) descEl.textContent = game?.description || "No description.";

  if (tagsEl) {
    const plats = Array.isArray(game?.platform) ? game.platform : (game?.platform ? [game.platform] : []);
    const gens = Array.isArray(game?.genre) ? game.genre : (game?.genre ? [game.genre] : []);
    const pills = [...plats.map((p) => ({ t: p, k: "Platform" })), ...gens.map((g) => ({ t: g, k: "Genre" }))];

    tagsEl.innerHTML = pills.length
      ? pills
          .map(
            (x) =>
              `<span class="tag" title="${esc(x.k)}">${esc(x.t)}</span>`
          )
          .join(" ")
      : `<span class="muted">No tags.</span>`;
  }

  if (hero) {
    const src = game?.imageURL?.trim();
    hero.src = src || "../../assets/images/VGB_Logo.png";
    hero.onerror = () => (hero.src = "../../assets/images/VGB_Logo.png");
  }

  // --- Favorite button ---
  if (favBtn) {
    if (!canFavorite) {
      favBtn.disabled = true;
      favBtn.textContent = loggedIn ? "Admin cannot favorite" : "Login to favorite";
      if (favHint) favHint.textContent = loggedIn ? "" : "Login required.";
    } else {
      let favoriteSet = await loadFavoriteSet();
      const setFavLabel = () => {
        const on = favoriteSet.has(String(gameId));
        favBtn.textContent = on ? "★ Favorited" : "☆ Favorite";
      };
      setFavLabel();

      favBtn.onclick = async () => {
        try {
          if (favoriteSet.has(String(gameId))) {
            await API.favoriteAPI.remove(String(gameId));
            favoriteSet.delete(String(gameId));
          } else {
            await API.favoriteAPI.add(String(gameId));
            favoriteSet.add(String(gameId));
          }
          setFavLabel();
        } catch (e) {
          showToast(e?.message || "Failed to update favorite.");
        }
      };
    }
  }

  // --- Reviews (read for everyone, write only for registered users) ---
  const renderReviews = async () => {
    if (!reviewListEl) return;

    try {
      const reviews = await API.reviewAPI.getByGame(String(gameId));
      const list = Array.isArray(reviews) ? reviews : (reviews?.reviews || []);

      if (!list.length) {
        reviewListEl.innerHTML = `<div class="muted">No reviews yet.</div>`;
        return;
      }

      reviewListEl.innerHTML = list
        .map((r) => {
          const author =
            r?.username ||
            r?.user?.username ||
            r?.userId?.username ||
            "User";

          const rating = r?.rating ?? r?.stars ?? 0;
          const text = r?.text || r?.reviewText || "";

          const reviewId = r?._id || r?.id || "";
          const ownerId =
            r?.userId?._id || r?.userId || r?.user?._id || r?.user || "";

          const myId = user?._id || user?.id || "";
          const isOwner = myId && String(ownerId) === String(myId);
          // Registered users can delete their own reviews; admins can delete any review.
          const canDelete = !!reviewId && ((canReview && isOwner) || canModerate);

          return `
            <div class="card" style="margin-bottom:10px">
              <div class="card-body">
                <div class="row" style="justify-content:space-between; gap:12px">
                  <div>
                    <div class="card-title">${esc(author)}</div>
                    <div class="muted">${rating ? esc(stars(rating)) : ""}</div>
                  </div>
                  ${
                    canDelete
                      ? `<button class="btn btn-outline btn-sm" data-del="${esc(reviewId)}">Delete</button>`
                      : ``
                  }
                </div>
                ${text ? `<div style="margin-top:8px">${esc(text)}</div>` : ``}
              </div>
            </div>
          `;
        })
        .join("");

      // wire delete buttons (registered users + admins)
      if (canReview || canModerate) {
        reviewListEl.querySelectorAll("[data-del]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-del");
            if (!id) return;
            try {
              await API.reviewAPI.delete(id);
              showToast("Review deleted.");
              await renderReviews();
            } catch (e) {
              showToast(e?.message || "Failed to delete review.");
            }
          });
        });
      }
    } catch (e) {
      reviewListEl.innerHTML = `<div class="muted">Failed to load reviews.</div>`;
    }
  };

  // show/hide composer properly (your HTML starts it as display:none)
  if (reviewComposer) reviewComposer.style.display = canReview ? "" : "none";
  if (reviewLocked) reviewLocked.hidden = canReview;

  // post review
  if (postReviewBtn) {
    postReviewBtn.onclick = async () => {
      if (!canReview) return showToast("Login as a registered user to write a review.");

      const rating = Number(ratingSel?.value || 0);
      const text = (reviewText?.value || "").trim();

      if (!text && !rating) return showToast("Please enter a review or a rating.");

      try {
        await API.reviewAPI.create({
          gameId: String(gameId),
          rating: rating || undefined,
          text: text || undefined,
        });

        if (reviewText) reviewText.value = "";
        if (ratingSel) ratingSel.value = "0";

        showToast("Review posted.");
        await renderReviews();
      } catch (e) {
        showToast(e?.message || "Failed to post review.");
      }
    };
  }

  // initial load
  await renderReviews();
}


async function initUserFavorites() {
  if (!requireLoggedIn()) return;

  const { isAdmin } = getSession();
  if (isAdmin) {
    navTo("admin/index.html");
    return;
  }

  const grid = document.getElementById("favGrid") || getGridEl();
  if (!grid) return;

  const refreshBtn = document.getElementById("refreshBtn");

  // Prevent duplicate event wiring if boot() runs again
  if (document.body.dataset.userFavBound !== "1") {
    document.body.dataset.userFavBound = "1";
    refreshBtn?.addEventListener("click", () => boot());
  }

  const favs = await API.favoriteAPI.getAll();
  const games = (favs || [])
    .map((f) => f.gameId || f.game || null)
    .filter(Boolean);

  const favoriteSet = new Set(games.map((g) => String(normalizeGameId(g))));
  setText("statGames", String(games.length));

  if (games.length === 0) {
    setEmptyVisible(true);
    grid.innerHTML = "";
    return;
  }
  setEmptyVisible(false);

  if (GameCard.renderGameGrid) {
    GameCard.renderGameGrid({
      container: grid,
      games,
      favoriteSet,
      mode: "user",
      onDetails: (g) => openGameDetail(normalizeGameId(g)),
      onFavoriteToggle: async (g) => {
        const id = String(normalizeGameId(g));
        await API.favoriteAPI.remove(id);
        showToast("Removed from favorites.");
        await boot();
      },
    });
  } else {
    grid.innerHTML = games
      .map(
        (g) => `
        <div class="panel">
          <div class="panel-title">${g.title || "Untitled"}</div>
          <button class="btn ghost" data-open="${normalizeGameId(g)}">Details</button>
          <button class="btn ghost" data-unfav="${normalizeGameId(g)}">Remove</button>
        </div>
      `
      )
      .join("");

    $$("[data-open]", grid).forEach((b) => (b.onclick = () => openGameDetail(b.dataset.open)));
    $$("[data-unfav]", grid).forEach(
      (b) =>
        (b.onclick = async () => {
          await API.favoriteAPI.remove(b.dataset.unfav);
          await boot();
        })
    );
  }
}

async function initUserMyReviews() {
  if (!requireLoggedIn()) return;

  const { user, isAdmin } = getSession();
  if (isAdmin) {
    navTo("admin/reviews.html");
    return;
  }

  const list = $("#myReviewList") || $("#myReviewsList") || $("#reviewsList");
  const emptyBox = document.getElementById("myReviewEmpty");
  const filterEl = document.getElementById("reviewFilter");
  const refreshBtn = document.getElementById("refreshBtn");
  if (!list) return;

  let allRows = [];

  // Delegate clicks (prevents re-binding every render)
  if (list.dataset.bound !== "1") {
    list.dataset.bound = "1";
    list.addEventListener("click", async (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const openId = t.getAttribute("data-open");
      const delId = t.getAttribute("data-del");
      if (openId) return openGameDetail(openId);
      if (delId) {
        if (!confirm("Delete your review?")) return;
        try {
          await API.reviewAPI.delete(delId);
          showToast("Review deleted.");
          await loadAndRender({ forceReload: true });
        } catch (err) {
          showToast(err?.message || "Failed to delete review.");
        }
      }
    });
  }

  if (document.body.dataset.userMyReviewsBound !== "1") {
    document.body.dataset.userMyReviewsBound = "1";
    filterEl?.addEventListener("input", () => render());
    refreshBtn?.addEventListener("click", () => loadAndRender({ forceReload: true }));
  }

  async function loadRows() {
    const games = await loadAllGamesSafe();
    const me = String(normalizeUserId(user));

    // Brute-force fetch reviews per game (fine for small catalogs)
    const rows = [];
    for (const g of games || []) {
      const gid = normalizeGameId(g);
      if (!gid) continue;
      try {
        const revs = await API.reviewAPI.getByGame(gid);
        for (const r of revs || []) {
          const uid = String(normalizeUserId(r.userId) || r.userId || "");
          if (uid === me) {
            rows.push({
              ...r,
              _gameTitle: g.title || "Game",
              _gameId: gid,
            });
          }
        }
      } catch {
        // ignore broken game
      }
    }

    rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return rows;
  }

  function render() {
    const q = (filterEl?.value || "").trim().toLowerCase();
    const view = !q
      ? allRows
      : allRows.filter((r) => {
          const hay = `${r._gameTitle || ""} ${r.text || ""}`.toLowerCase();
          return hay.includes(q);
        });

    if (emptyBox) emptyBox.hidden = view.length !== 0;
    if (view.length === 0) {
      list.innerHTML = "";
      return;
    }

    list.innerHTML = view
      .map((r) => {
        const stars = r.rating ? `${r.rating}★` : "—";
        const dt = r.createdAt ? new Date(r.createdAt).toLocaleString() : "";
        return `
          <div class="item">
            <div class="item-title">${r._gameTitle} <span class="muted">• ${stars}</span></div>
            <div class="item-sub">${esc(r.text || "")}</div>
            <div class="item-sub">${esc(dt)}</div>
            <div class="actions" style="margin-top:8px">
              <button class="btn ghost" type="button" data-open="${esc(r._gameId)}">Open game</button>
              <button class="btn ghost" type="button" data-del="${esc(r._id || r.id)}">Delete</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  async function loadAndRender({ forceReload = false } = {}) {
    if (forceReload) {
      // no persistent cache, but keep signature
    }
    allRows = await loadRows();
    render();
  }

  await loadAndRender({ forceReload: true });
}

async function initCalendarPage() {
  const cal = $("#calendar");
  if (!cal) return;

  // calendar component expects a container + game source + click handler
  const getGames = async () => await loadAllGamesSafe();
  const onGameClick = (game) => openGameDetail(normalizeGameId(game));

  if (Calendar.initCalendar) {
    Calendar.initCalendar({
      container: cal,
      getGames,
      onGameClick,
      titleEl: $("#calTitle") || null,
      prevBtn: $("#calPrev") || null,
      nextBtn: $("#calNext") || null,
      todayBtn: $("#calToday") || null,
    });
  } else {
    cal.innerHTML = `<div class="muted">Calendar component missing (Calendar.js).</div>`;
  }
}

async function initAdminIndex() {
  if (!requireAdmin()) return;

  // Admin dashboard has different IDs than the public/user catalog.
  const grid = document.getElementById("adminGrid") || getGridEl();
  const empty = document.getElementById("adminEmpty") || getEmptyEl();

  const searchEl = document.getElementById("adminSearch");
  const sortEl = document.getElementById("sortBy");
  const refreshBtn = document.getElementById("refreshBtn");
  const clearBtn = document.getElementById("clearBtn");
  const addBtn = document.getElementById("addGameBtn");

  if (!grid) return;

  // Prevent duplicate event wiring if boot() runs again
  if (document.body.dataset.adminIndexBound !== "1") {
    document.body.dataset.adminIndexBound = "1";

    searchEl?.addEventListener("input", () => render());
    sortEl?.addEventListener("change", () => render());

    refreshBtn?.addEventListener("click", async () => {
      await loadAndRender({ forceReload: true });
    });

    clearBtn?.addEventListener("click", () => {
      if (searchEl) searchEl.value = "";
      render();
    });

    addBtn?.addEventListener("click", () => navTo("admin/add-game.html"));
  }

  let allGames = [];

  async function loadAndRender({ forceReload = false } = {}) {
    if (forceReload) {
      // no cache in this file, but keep symmetry
    }
    allGames = await loadAllGamesSafe();
    setStatsFromGames(allGames);
    render();
  }

  function matchesSearch(g, q) {
    if (!q) return true;
    const hay = `${g?.title || ""} ${g?.description || ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function applySort(arr, sortBy) {
    const a = [...(arr || [])];
    switch (sortBy) {
      case "releaseAsc":
        a.sort((x, y) => new Date(x.releaseDate || 0) - new Date(y.releaseDate || 0));
        break;
      case "titleAsc":
        a.sort((x, y) => String(x.title || "").localeCompare(String(y.title || "")));
        break;
      case "ratingDesc":
        a.sort((x, y) => (y.averageRating || 0) - (x.averageRating || 0));
        break;
      case "releaseDesc":
      default:
        a.sort((x, y) => new Date(y.releaseDate || 0) - new Date(x.releaseDate || 0));
        break;
    }
    return a;
  }

  function render() {
    const q = (searchEl?.value || "").trim();
    const sortBy = sortEl?.value || "releaseDesc";

    const filtered = allGames.filter((g) => matchesSearch(g, q));
    const view = applySort(filtered, sortBy);

    if (empty) empty.hidden = view.length !== 0;

    if (GameCard.renderGameGrid) {
      GameCard.renderGameGrid({
        container: grid,
        games: view,
        favoriteSet: new Set(),
        mode: "admin",
        onDetails: (g) => openGameDetail(normalizeGameId(g)),
        onEdit: (g) => navTo(`admin/edit-game.html?id=${encodeURIComponent(normalizeGameId(g))}`),
        onDelete: async (g) => {
          const id = normalizeGameId(g);
          if (!id) return;
          if (!confirm("Delete this game? This also removes related reviews.")) return;
          try {
            await API.gameAPI.delete(String(id));
            showToast("Game deleted.");
            await loadAndRender({ forceReload: true });
          } catch (e) {
            showToast(e?.message || "Failed to delete game.");
          }
        },
      });
    } else {
      grid.innerHTML = view
        .map(
          (g) => `
          <div class="panel">
            <div class="panel-title">${g.title || "Untitled"}</div>
            <div class="actions">
              <button class="btn ghost" data-open="${normalizeGameId(g)}">Details</button>
              <button class="btn ghost" data-edit="${normalizeGameId(g)}">Edit</button>
              <button class="btn ghost" data-del="${normalizeGameId(g)}">Delete</button>
            </div>
          </div>
        `
        )
        .join("");

      $$('[data-open]', grid).forEach((b) => (b.onclick = () => openGameDetail(b.dataset.open)));
      $$('[data-edit]', grid).forEach((b) => (b.onclick = () => navTo(`admin/edit-game.html?id=${encodeURIComponent(b.dataset.edit)}`)));
      $$('[data-del]', grid).forEach(
        (b) =>
          (b.onclick = async () => {
            if (!confirm("Delete this game?")) return;
            await API.gameAPI.delete(b.dataset.del);
            await loadAndRender({ forceReload: true });
          })
      );
    }
  }

  await loadAndRender({ forceReload: true });
}

async function initAdminAddGame() {
  if (!requireAdmin()) return;

   bindImageUrlPreview({
    inputEl: document.getElementById("imageURL"),
    previewImgEl: document.getElementById("imgPreview"),
  });

  const form = $("#addGameForm") || $("form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      title: $("#title")?.value?.trim() || "",
      description: $("#description")?.value?.trim() || "",
      releaseDate: $("#releaseDate")?.value || "",
      status: $("#status")?.value || "Upcoming",
      imageURL: $("#imageURL")?.value?.trim() || "",
      platform: ($("#platform")?.value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      genre: ($("#genre")?.value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    try {
      await API.gameAPI.create(payload);
      showToast("Game added.");
      navTo("admin/index.html");
    } catch (err) {
      showToast(err?.message || "Failed to add game.");
    }
  });
}

async function initAdminEditGame() {
  if (!requireAdmin()) return;

  // ✅ add this block
  bindImageUrlPreview({
    inputEl: document.getElementById("imageURL"),
    previewImgEl: document.getElementById("imgPreview"),
  });

  const gameId = getQueryParam("id");
  if (!gameId) {
    showToast("Missing game id.");
    navTo("admin/index.html");
    return;
  }

  const form = $("#editGameForm") || $("form");
  if (!form) return;

  // load existing
  const data = await API.gameAPI.getById(gameId);
  const g = data?.game || data;

  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v ?? "";
  };

  setVal("title", g.title);
  setVal("description", g.description);
  setVal("releaseDate", (g.releaseDate || "").slice?.(0, 10) || g.releaseDate || "");
  setVal("status", g.status || "Upcoming");
  setVal("imageURL", g.imageURL || "");
  setVal("platform", (g.platform || []).join(", "));
  setVal("genre", (g.genre || []).join(", "));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      title: $("#title")?.value?.trim() || "",
      description: $("#description")?.value?.trim() || "",
      releaseDate: $("#releaseDate")?.value || "",
      status: $("#status")?.value || "Upcoming",
      imageURL: $("#imageURL")?.value?.trim() || "",
      platform: ($("#platform")?.value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      genre: ($("#genre")?.value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    try {
      await API.gameAPI.update(gameId, payload);
      showToast("Game updated.");
      navTo("admin/index.html");
    } catch (err) {
      showToast(err?.message || "Failed to update game.");
    }
  });

  const delBtn = $("#deleteBtn");
  if (delBtn) {
    delBtn.onclick = async () => {
      if (!confirm("Delete this game? This also removes related reviews/favorites.")) return;
      try {
        await API.gameAPI.delete(gameId);
        showToast("Game deleted.");
        navTo("admin/index.html");
      } catch (err) {
        showToast(err?.message || "Failed to delete game.");
      }
    };
  }
}

async function initAdminReviews() {
  if (!requireAdmin()) return;

  const list = document.getElementById("adminReviewList") || $("#adminReviewsList") || $("#reviewsList");
  const emptyBox = document.getElementById("adminReviewEmpty");
  const searchEl = document.getElementById("reviewSearch");
  const refreshBtn = document.getElementById("refreshBtn");
  const clearBtn = document.getElementById("clearBtn");
  const addBtn = document.getElementById("addBtn");
  if (!list) return;

  let allRows = [];

  // Delegate clicks (prevents re-binding every render)
  if (list.dataset.bound !== "1") {
    list.dataset.bound = "1";
    list.addEventListener("click", async (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const openId = t.getAttribute("data-open");
      const delId = t.getAttribute("data-del");
      if (openId) return openGameDetail(openId);
      if (delId) {
        if (!confirm("Delete this review?")) return;
        try {
          await API.reviewAPI.delete(delId);
          showToast("Review deleted.");
          await loadAndRender({ forceReload: true });
        } catch (err) {
          showToast(err?.message || "Failed to delete review.");
        }
      }
    });
  }

  if (document.body.dataset.adminReviewsBound !== "1") {
    document.body.dataset.adminReviewsBound = "1";
    searchEl?.addEventListener("input", () => render());
    refreshBtn?.addEventListener("click", () => loadAndRender({ forceReload: true }));
    clearBtn?.addEventListener("click", () => {
      if (searchEl) searchEl.value = "";
      render();
    });

    // Some layouts may include an "Add Game" button; don't crash if it's absent.
    addBtn?.addEventListener("click", () => navTo("admin/add-game.html"));
  }

  async function loadRows() {
    const games = await loadAllGamesSafe();
    const rows = [];

    for (const g of games || []) {
      const gid = normalizeGameId(g);
      if (!gid) continue;
      try {
        const revs = await API.reviewAPI.getByGame(gid);
        for (const r of revs || []) {
          const author = r?.username || r?.userId?.username || "User";
          rows.push({
            ...r,
            _author: author,
            _gameTitle: g.title || "Game",
            _gameId: gid,
          });
        }
      } catch {
        // ignore
      }
    }

    rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return rows;
  }

  function render() {
    const q = (searchEl?.value || "").trim().toLowerCase();
    const view = !q
      ? allRows
      : allRows.filter((r) => {
          const hay = `${r._gameTitle || ""} ${r._author || ""} ${r.text || ""}`.toLowerCase();
          return hay.includes(q);
        });

    if (emptyBox) emptyBox.hidden = view.length !== 0;
    if (view.length === 0) {
      list.innerHTML = "";
      return;
    }

    list.innerHTML = view
      .map((r) => {
        const stars = r.rating ? `${r.rating}★` : "—";
        const dt = r.createdAt ? new Date(r.createdAt).toLocaleString() : "";
        return `
          <div class="item">
            <div class="item-title">${esc(r._gameTitle)} <span class="muted">• ${esc(r._author)} • ${esc(stars)}</span></div>
            ${r.text ? `<div class="item-sub">${esc(r.text)}</div>` : `<div class="item-sub muted">(no text)</div>`}
            <div class="item-sub">${esc(dt)}</div>
            <div class="actions" style="margin-top:8px">
              <button class="btn ghost" type="button" data-open="${esc(r._gameId)}">Open game</button>
              <button class="btn ghost" type="button" data-del="${esc(r._id || r.id)}">Delete</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  async function loadAndRender({ forceReload = false } = {}) {
    if (forceReload) {
      // no persistent cache, but keep signature
    }
    allRows = await loadRows();
    render();
  }

  await loadAndRender({ forceReload: true });
}

async function boot() {
  // Enhance date inputs with year selector
  enhanceDateYearSelect(document);
  // Dark, theme-matched dropdowns (replaces native white menus)
  enhanceCustomSelects(document);

  setAuthedNavUI();
  initAuthModal();

  const page = detectPageKey();
  const { loggedIn, isAdmin } = getSession();

  // Route guards
  if (page.startsWith("admin-") || page === "admin-index" || page === "admin-add-game" || page === "admin-edit-game" || page === "admin-calendar" || page === "admin-reviews") {
    if (!requireAdmin()) return;
  }
  if (page.startsWith("user-") || page === "user-index" || page === "user-favorites" || page === "user-my-reviews" || page === "user-calendar") {
    if (!requireLoggedIn()) return;
    if (isAdmin) {
      // Admin wandering into user pages? Fine, but redirect to admin dashboard for sanity.
      navTo("admin/index.html");
      return;
    }
  }

  // Page initializers
  switch (page) {
    case "root-index":
      navTo("shared/index.html");
      return;

    case "shared-index":
      await initSharedIndex();
      return;

    case "shared-catalog":
      await initCatalogPage({ mode: loggedIn ? (isAdmin ? "admin" : "user") : "guest" });
      return;

    case "shared-game-detail":
      await initSharedGameDetail();
      return;

    case "user-index":
      await initCatalogPage({ mode: "user" });
      return;

    case "user-favorites":
      await initUserFavorites();
      return;

    case "user-my-reviews":
      await initUserMyReviews();
      return;

    case "user-calendar":
      await initCalendarPage();
      return;

    case "admin-index":
      await initAdminIndex();
      return;

    case "admin-add-game":
      await initAdminAddGame();
      return;

    case "admin-edit-game":
      await initAdminEditGame();
      return;

    case "admin-calendar":
      await initCalendarPage();
      return;

    case "admin-reviews":
      await initAdminReviews();
      return;

    default:
      // do nothing
      return;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  boot().catch((err) => {
    console.error(err);
    showToast(err?.message || "Something broke in main.js.");
  });
});