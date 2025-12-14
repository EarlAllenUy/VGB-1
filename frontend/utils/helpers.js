// frontend/utils/helpers.js
// Generic helper functions: date formatting, messages/toasts, star rendering, DOM helpers.

export const FALLBACK_IMG = "../../assets/images/VGB_Logo.png";

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function $$(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

export function formatDate(isoOrDate, opts) {
  if (!isoOrDate) return "—";
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return String(isoOrDate);
  return d.toLocaleDateString(undefined, opts || { year: "numeric", month: "short", day: "2-digit" });
}

export function formatDateTime(isoOrDate) {
  if (!isoOrDate) return "—";
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return String(isoOrDate);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

export function normalizeId(obj) {
  return obj?._id || obj?.id || null;
}

export function starString(rating) {
  if (rating == null || rating === "") return "—";
  const n = clamp(rating, 0, 5);
  const full = "★".repeat(Math.floor(n));
  const empty = "☆".repeat(5 - Math.floor(n));
  return `${full}${empty}`;
}

/**
 * UI messaging:
 * - If #toast exists, use it.
 * - Otherwise fall back to alert().
 */
export function showMessage(message, type = "info", timeoutMs = 2500) {
  const toast = document.getElementById("toast");
  if (!toast) {
    alert(message);
    return;
  }

  toast.textContent = message;
  toast.dataset.type = type;
  toast.hidden = false;

  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => {
    toast.hidden = true;
  }, timeoutMs);
}

/**
 * Attach fallback image behavior to an <img>.
 */
export function attachImageFallback(imgEl, fallback = FALLBACK_IMG) {
  if (!imgEl) return;
  imgEl.addEventListener("error", () => {
    if (imgEl.src !== fallback) imgEl.src = fallback;
  });
}

/**
 * Safe JSON fetch helper if you ever need it outside services/api.js.
 */
export async function readJsonOrText(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}
