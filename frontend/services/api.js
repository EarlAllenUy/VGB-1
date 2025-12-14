// frontend/services/api.js
// All fetch calls to /api/games, /api/reviews, /api/favorites

const DEFAULT_API_BASE = "http://localhost:5000"; // backend default port
const LS_API_BASE_KEY = "vgb_api_base"; // optional override (nice for deployment)
const LS_TOKEN_KEYS = ["token", "vgb_token"];     // supports guide + your old keys
const LS_USER_KEYS  = ["user", "vgb_user"];

export function getApiBase() {
  const fromLS = localStorage.getItem(LS_API_BASE_KEY);
  return (fromLS || DEFAULT_API_BASE).replace(/\/$/, "");
}

// --- Runtime base auto-detection (Frontend-only fix)
// If the stored/default base is unreachable (common when using 127.0.0.1 vs localhost),
// we try a few sensible candidates and cache the first one that responds.
let _resolvedBase = null;
let _resolving = null;

async function probe(base) {
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/`, {
      method: "GET",
      // Avoid any custom headers so we don't trigger unnecessary preflights.
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function resolveApiBase() {
  if (_resolvedBase) return _resolvedBase;
  if (_resolving) return _resolving;

  _resolving = (async () => {
    const candidates = [];

    // 1) localStorage override (if any)
    const fromLS = localStorage.getItem(LS_API_BASE_KEY);
    if (fromLS) candidates.push(String(fromLS));

    // 2) default
    candidates.push(DEFAULT_API_BASE);

    // 3) match current hostname (useful when page is served from 127.0.0.1)
    const host = window.location?.hostname;
    if (host && host !== "localhost") candidates.push(`http://${host}:5000`);

    // 4) explicit common loopback hosts
    candidates.push("http://127.0.0.1:5000");
    candidates.push("http://localhost:5000");

    // De-duplicate and normalize
    const uniq = Array.from(new Set(candidates.map((c) => String(c).replace(/\/$/, ""))));
    for (const c of uniq) {
      if (await probe(c)) {
        _resolvedBase = c;
        // Persist if it differs from LS value so future loads work immediately
        if (localStorage.getItem(LS_API_BASE_KEY) !== c) {
          localStorage.setItem(LS_API_BASE_KEY, c);
        }
        return _resolvedBase;
      }
    }

    // Nothing reachable: keep using configured base but provide a clear message upstream.
    _resolvedBase = getApiBase();
    return _resolvedBase;
  })();

  return _resolving;
}

export function setApiBase(url) {
  if (!url) localStorage.removeItem(LS_API_BASE_KEY);
  else localStorage.setItem(LS_API_BASE_KEY, String(url).replace(/\/$/, ""));
}

export function getToken() {
  for (const k of LS_TOKEN_KEYS) {
    const v = localStorage.getItem(k);
    if (v) return v;
  }
  return null;
}

export function getStoredUser() {
  for (const k of LS_USER_KEYS) {
    const raw = localStorage.getItem(k);
    if (!raw) continue;
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

function safeJsonParse(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function buildQuery(query = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    // If an array is passed, take the first value (backend expects a single platform/genre)
    const val = Array.isArray(v) ? (v[0] ?? "") : v;
    if (val !== "") params.set(k, String(val));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/**
 * Fetch wrapper that adds JSON headers and (optionally) Authorization Bearer token.
 * Mirrors the guide pattern. :contentReference[oaicite:3]{index=3}
 */
export async function authFetch(endpoint, options = {}) {
  const base = await resolveApiBase();
  const url = `${base}${endpoint}`;
  const token = getToken();

  const method = String(options.method || "GET").toUpperCase();
  const hasBody = options.body !== undefined && options.body !== null;

  // IMPORTANT: Do NOT set Content-Type on GET/DELETE without a body.
  // Doing so triggers CORS preflight and can cause "Failed to fetch" if the server is down.
  const headers = { ...(options.headers || {}) };
  if (hasBody && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (e) {
    // Network/CORS/offline errors all surface as TypeError("Failed to fetch").
    // Provide a more helpful message.
    const hint = `API not reachable at ${base}. Make sure backend is running (port 5000).`;
    throw new Error(hint);
  }

  const text = await res.text();
  const data = safeJsonParse(text);

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && (data.error || data.message)) ||
      (typeof data === "string" && data) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}


export const gameAPI = {
  getAll: (query = {}) => authFetch(`/api/games${buildQuery(query)}`), // :contentReference[oaicite:4]{index=4}
  getById: (id) => authFetch(`/api/games/${id}`),
  create: (data) => authFetch("/api/games", { method: "POST", body: JSON.stringify(data) }),
  update: (id, data) => authFetch(`/api/games/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id) => authFetch(`/api/games/${id}`, { method: "DELETE" }),
};

export const reviewAPI = {
  create: (data) => authFetch("/api/reviews", { method: "POST", body: JSON.stringify(data) }), // :contentReference[oaicite:5]{index=5}
  getByGame: (gameId) => authFetch(`/api/reviews/game/${gameId}`),
  update: (id, data) => authFetch(`/api/reviews/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id) => authFetch(`/api/reviews/${id}`, { method: "DELETE" }),
};

export const favoriteAPI = {
  add: (gameId) =>
    authFetch("/api/favorites", { method: "POST", body: JSON.stringify({ gameId }) }), // :contentReference[oaicite:6]{index=6}
  getAll: () => authFetch("/api/favorites"),
  remove: (gameId) => authFetch(`/api/favorites/${gameId}`, { method: "DELETE" }),
};
