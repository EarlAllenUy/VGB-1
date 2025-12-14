// frontend/utils/imageHandler.js
// Image preview + URL validation for "paste image address" workflow.
// No base64 conversion by default (per your preference).

import { FALLBACK_IMG, attachImageFallback } from "./helpers.js";

/**
 * Very light URL check:
 * - accepts http(s) URLs
 * - accepts relative paths (e.g., /images/cover.png or ./assets/x.png)
 */
export function isLikelyImageUrl(url) {
  if (!url) return false;
  const u = String(url).trim();
  if (!u) return false;

  // allow relative paths
  if (u.startsWith("/") || u.startsWith("./") || u.startsWith("../")) return true;

  // allow absolute URLs
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Wire an <input> (image URL field) to a preview <img>.
 * @param {{
 *   inputEl: HTMLInputElement,
 *   previewImgEl: HTMLImageElement,
 *   fallbackSrc?: string,
 *   debounceMs?: number
 * }} args
 */
export function bindImageUrlPreview({
  inputEl,
  previewImgEl,
  fallbackSrc = FALLBACK_IMG,
  debounceMs = 250
}) {
  if (!inputEl || !previewImgEl) return;

  attachImageFallback(previewImgEl, fallbackSrc);

  let t = null;

  const update = () => {
    const url = String(inputEl.value || "").trim();

    if (!url) {
      previewImgEl.src = fallbackSrc;
      inputEl.dataset.validImageUrl = "false";
      return;
    }

    if (!isLikelyImageUrl(url)) {
      previewImgEl.src = fallbackSrc;
      inputEl.dataset.validImageUrl = "false";
      return;
    }

    // Optimistically show it; onerror will handle fallback
    previewImgEl.src = url;
    inputEl.dataset.validImageUrl = "true";
  };

  const debounced = () => {
    clearTimeout(t);
    t = setTimeout(update, debounceMs);
  };

  inputEl.addEventListener("input", debounced);
  inputEl.addEventListener("change", update);

  // initial
  update();

  return { refresh: update };
}

/**
 * Optional: enforce that the admin doesn't submit invalid image URLs.
 * Use inside submit handler: if (!validateImageUrlInput(inputEl)) return;
 */
export function validateImageUrlInput(inputEl, { allowEmpty = false } = {}) {
  if (!inputEl) return true;
  const url = String(inputEl.value || "").trim();
  if (!url) return allowEmpty;

  return isLikelyImageUrl(url);
}

/* -----------------------------------------------------------
   OPTIONAL (NOT USED): base64 conversion stub
   Kept here only as a future escape hatch.
   ----------------------------------------------------------- */
export async function fileToBase64(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}
