// frontend/components/ReviewForm.js
// Handles: showing/hiding review composer + rendering reviews list + edit/delete callbacks.
// This component does NOT hardcode API calls; it accepts callbacks (so it works for user/admin pages).

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function pickUsername(r) {
  return r?.username || r?.user?.username || r?.userId?.username || "User";
}

function pickUserId(r) {
  return r?.userId?._id || r?.userId || r?.user?._id || r?.user || null;
}

function normalizeRating(rating) {
  const n = Number(rating);
  return Number.isFinite(n) ? n : null;
}

function renderStars(n) {
  if (n == null) return `<span class="muted">No rating</span>`;
  const full = "★".repeat(Math.max(0, Math.min(5, n)));
  const empty = "☆".repeat(Math.max(0, 5 - Math.max(0, Math.min(5, n))));
  return `<span class="stars">${full}${empty}</span>`;
}

/**
 * Renders a list of reviews into a container.
 */
export function renderReviewList(container, reviews, {
  currentUserId = null,
  isAdmin = false,
  onEdit,   // (review) => Promise<void> | void
  onDelete  // (review) => Promise<void> | void
} = {}) {
  if (!container) throw new Error("renderReviewList: container required");
  container.innerHTML = "";

  const arr = [...(reviews || [])];

  if (!arr.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = `
      <div class="empty-title">No reviews yet</div>
      <div class="muted">Be the first to leave feedback.</div>
    `;
    container.appendChild(empty);
    return;
  }

  for (const r of arr) {
    const item = document.createElement("div");
    item.className = "review";

    const author = pickUsername(r);
    const rating = normalizeRating(r?.rating);
    const text = r?.text || "";
    const date = r?.datePosted || r?.createdAt || "";

    const ownerId = pickUserId(r);
    const isOwner = currentUserId && ownerId && String(currentUserId) === String(ownerId);

    item.innerHTML = `
      <div class="review-head">
        <div class="review-author">${esc(author)}</div>
        <div class="review-meta">
          ${renderStars(rating)}
          <span class="muted">${esc(fmtDateTime(date))}</span>
        </div>
      </div>
      <div class="review-body">${text ? esc(text) : `<span class="muted">Text-only review not provided.</span>`}</div>
      <div class="review-actions"></div>
    `;

    const actions = item.querySelector(".review-actions");

    if (isAdmin || isOwner) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn ghost";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => onEdit?.(r));
      actions.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn ghost";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => onDelete?.(r));
      actions.appendChild(delBtn);
    }

    container.appendChild(item);
  }
}

/**
 * Initializes the review composer + list section on pages/shared/game-detail.html
 * Expects these IDs if present:
 * - reviewComposer, reviewLocked, ratingSel, reviewText, postReview, reviewList
 */
export function initReviewSection({
  root = document,
  gameId,
  currentUser = null,  // { _id, userType }
  loadReviews,         // async (gameId) => reviews[]
  createReview,        // async ({gameId, text, rating}) => any
  updateReview,        // async (reviewId, {text, rating}) => any
  deleteReview,        // async (reviewId) => any
  onAfterChange        // optional: () => void
} = {}) {
  const $ = (sel) => root.querySelector(sel);

  const els = {
    composer: $("#reviewComposer"),
    locked: $("#reviewLocked"),
    ratingSel: $("#ratingSel"),
    text: $("#reviewText"),
    postBtn: $("#postReview"),
    list: $("#reviewList")
  };

  if (!els.list) {
    return { refresh: async () => [] };
  }

  const isLoggedIn = Boolean(currentUser);
  const isAdmin = currentUser?.userType === "Admin";
  const currentUserId = currentUser?._id || currentUser?.id || null;

  function setComposerVisible(visible) {
    if (els.composer) els.composer.style.display = visible ? "block" : "none";
    if (els.locked) els.locked.style.display = visible ? "none" : "block";
  }

  setComposerVisible(isLoggedIn);

  async function refresh() {
    const reviews = typeof loadReviews === "function" ? await loadReviews(gameId) : [];
    renderReviewList(els.list, reviews, {
      currentUserId,
      isAdmin,
      onEdit: async (r) => {
        // Minimal edit UX: prompt-based (reliable, fast)
        const newText = prompt("Edit review text (leave empty to keep):", r?.text ?? "");
        if (newText === null) return;

        const curRating = r?.rating ?? "";
        const newRatingStr = prompt("Edit rating 1-5 (leave empty for none):", String(curRating));
        if (newRatingStr === null) return;

        const payload = {
          text: newText,
          rating: newRatingStr === "" ? null : Number(newRatingStr)
        };
        await updateReview?.(r?._id || r?.id, payload);
        await refresh();
        onAfterChange?.();
      },
      onDelete: async (r) => {
        const ok = confirm("Delete this review?");
        if (!ok) return;
        await deleteReview?.(r?._id || r?.id);
        await refresh();
        onAfterChange?.();
      }
    });
    return reviews;
  }

  els.postBtn?.addEventListener("click", async () => {
    if (!isLoggedIn) return;

    const ratingVal = els.ratingSel?.value ?? "";
    const rating = ratingVal === "" ? null : Number(ratingVal);
    const text = (els.text?.value ?? "").trim();

    // allow text-only or rating-only, but not both empty
    if (!text && (rating == null || Number.isNaN(rating))) {
      alert("Please enter a text review and/or a rating.");
      return;
    }

    await createReview?.({ gameId, text, rating });

    if (els.text) els.text.value = "";
    if (els.ratingSel) els.ratingSel.value = "";

    await refresh();
    onAfterChange?.();
  });

  // initial load
  refresh();

  return { refresh };
}
