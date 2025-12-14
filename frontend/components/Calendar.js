// frontend/components/Calendar.js
// Monthly release calendar used by /pages/*/calendar.html.

const FALLBACK_IMG = "../../assets/images/VGB_Logo.png";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function safeDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ymdUTC(d) {
  // Normalize to YYYY-MM-DD in a stable way across timezones.
  // Works well for ISO dates like "2025-12-14".
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function monthTitle(year, monthIndex) {
  const fmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
  return fmt.format(new Date(year, monthIndex, 1));
}

function weekdayLabels() {
  // Sunday-first (matches Date.getDay())
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  const base = new Date(2025, 0, 5); // Sunday
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)));
}

function pickGameId(g) {
  return g?._id || g?.id || g?.gameId || null;
}

function pickImg(g) {
  return g?.imageURL || g?.imageUrl || g?.cover || "";
}

/**
 * Initialize a monthly calendar.
 *
 * @param {{
 *  container: HTMLElement,
 *  getGames: ()=>Promise<any[]>,
 *  onGameClick?: (game:any)=>void,
 *  titleEl?: HTMLElement|null,
 *  prevBtn?: HTMLElement|null,
 *  nextBtn?: HTMLElement|null,
 *  todayBtn?: HTMLElement|null,
 *  maxThumbsPerDay?: number,
 * }} args
 */
export function initCalendar({
  container,
  getGames,
  onGameClick,
  titleEl = null,
  prevBtn = null,
  nextBtn = null,
  todayBtn = null,
  maxThumbsPerDay = 3,
} = {}) {
  if (!container) throw new Error("Calendar.initCalendar: container is required");
  if (typeof getGames !== "function") throw new Error("Calendar.initCalendar: getGames must be a function");

  // --- State ---
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  let gamesCache = null;

  const labels = weekdayLabels();

  async function ensureGames() {
    if (gamesCache) return gamesCache;
    const games = await getGames();
    gamesCache = Array.isArray(games) ? games : [];
    return gamesCache;
  }

  function buildMonthMap(games) {
    // dateKey => games[]
    const map = new Map();
    for (const g of games || []) {
      const d = safeDate(g?.releaseDate);
      if (!d) continue;
      const key = ymdUTC(d);
      const arr = map.get(key) || [];
      arr.push(g);
      map.set(key, arr);
    }
    return map;
  }


  // Month/Year picker (clickable title)
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  let pickerEl = null;
  let pickerOpen = false;

  function closePicker() {
    if (!pickerEl) return;
    pickerEl.classList.remove("open");
    pickerOpen = false;
  }
  function openPicker() {
    if (!pickerEl) return;
    // sync values
    const mSel = pickerEl.querySelector("select[name=month]");
    const ySel = pickerEl.querySelector("select[name=year]");
    if (mSel) mSel.value = String(viewMonth);
    if (ySel) ySel.value = String(viewYear);
    pickerEl.classList.add("open");
    pickerOpen = true;
  }
  function togglePicker() {
    if (pickerOpen) closePicker();
    else openPicker();
  }

  function ensurePicker() {
    if (!titleEl) return;
    if (pickerEl) return;

    const head = titleEl.parentElement;
    if (!head) return;

    // Make title focusable/clickable
    titleEl.setAttribute("tabindex", "0");
    titleEl.setAttribute("role", "button");
    titleEl.setAttribute("aria-label", "Choose month and year");

    pickerEl = document.createElement("div");
    pickerEl.className = "cal-picker";
    const nowY = new Date().getFullYear();
    const years = [];
    for (let y = nowY - 20; y <= nowY + 20; y++) years.push(y);

    pickerEl.innerHTML = `
      <div class="row">
        <label class="field">
          <span>Month</span>
          <select name="month">
            ${months.map((m, i) => `<option value="${i}">${m}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span>Year</span>
          <select name="year">
            ${years.map((y) => `<option value="${y}">${y}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="actions">
        <button class="btn ghost" type="button" data-act="cancel">Cancel</button>
        <button class="btn" type="button" data-act="go">Go</button>
      </div>
    `;

    head.appendChild(pickerEl);

    const go = pickerEl.querySelector('[data-act="go"]');
    const cancel = pickerEl.querySelector('[data-act="cancel"]');
    const mSel = pickerEl.querySelector('select[name="month"]');
    const ySel = pickerEl.querySelector('select[name="year"]');

    const apply = () => {
      const m = Number(mSel?.value ?? viewMonth);
      const y = Number(ySel?.value ?? viewYear);
      viewMonth = Number.isFinite(m) ? m : viewMonth;
      viewYear = Number.isFinite(y) ? y : viewYear;
      closePicker();
      refresh().catch(console.error);
    };

    go?.addEventListener("click", apply);
    cancel?.addEventListener("click", closePicker);

    titleEl.addEventListener("click", (e) => {
      e.preventDefault();
      togglePicker();
    });
    titleEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        togglePicker();
      }
      if (e.key === "Escape") closePicker();
    });

    document.addEventListener(
      "click",
      (e) => {
        if (!pickerOpen) return;
        const t = e.target;
        if (pickerEl && (pickerEl.contains(t) || titleEl.contains(t))) return;
        closePicker();
      },
      true
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePicker();
    });

    // initial sync
    openPicker();
    closePicker();
  }

  function setTitle() {
    if (titleEl) titleEl.textContent = monthTitle(viewYear, viewMonth);
  }

  function renderCalendar(games) {
    container.innerHTML = "";
    setTitle();

    const monthMap = buildMonthMap(games);

    // Weekdays header
    const wdRow = document.createElement("div");
    wdRow.className = "cal-weekdays";
    for (const lab of labels) {
      const wd = document.createElement("div");
      wd.className = "cal-wd";
      wd.textContent = lab;
      wdRow.appendChild(wd);
    }
    container.appendChild(wdRow);

    // Grid
    const grid = document.createElement("div");
    grid.className = "cal-grid";

    const first = new Date(viewYear, viewMonth, 1);
    const startOffset = first.getDay(); // 0..6 Sunday-first
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    // Leading blanks
    for (let i = 0; i < startOffset; i++) {
      const blank = document.createElement("div");
      blank.className = "cal-cell";
      blank.style.opacity = "0.35";
      blank.innerHTML = `<div class="cal-daynum">&nbsp;</div>`;
      grid.appendChild(blank);
    }

    // Days
    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement("div");
      cell.className = "cal-cell";

      const cellDate = new Date(viewYear, viewMonth, day);
      const key = ymdUTC(cellDate);
      const items = monthMap.get(key) || [];

      const dayNum = document.createElement("div");
      dayNum.className = "cal-daynum";
      dayNum.innerHTML = `
        <span>${day}</span>
        <span>${items.length ? `<span class="cal-dot" aria-hidden="true"></span>` : ""}</span>
      `;
      cell.appendChild(dayNum);

      const thumbs = document.createElement("div");
      thumbs.className = "cal-items";

      const shown = items.slice(0, maxThumbsPerDay);
      for (const g of shown) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cal-item";
        btn.title = g?.title || "Open";
        btn.setAttribute("aria-label", g?.title || "Game");

        const img = document.createElement("img");
        img.alt = g?.title || "Game";
        img.src = pickImg(g) || FALLBACK_IMG;
        img.addEventListener("error", () => {
          if (img.src !== FALLBACK_IMG) img.src = FALLBACK_IMG;
        });
        btn.appendChild(img);

        btn.addEventListener("click", () => onGameClick?.(g));
        thumbs.appendChild(btn);
      }
      cell.appendChild(thumbs);

      if (items.length > maxThumbsPerDay) {
        const more = document.createElement("div");
        more.className = "cal-more";
        more.textContent = `+${items.length - maxThumbsPerDay} more`;
        cell.appendChild(more);
      }

      grid.appendChild(cell);
    }

    container.appendChild(grid);
  }

  async function refresh({ forceReload = false } = {}) {
    if (forceReload) gamesCache = null;
    const games = await ensureGames();
    renderCalendar(games);
  }

  function stepMonth(delta) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
    refresh().catch(console.error);
  }

  // Wire controls
  prevBtn?.addEventListener("click", () => stepMonth(-1));
  nextBtn?.addEventListener("click", () => stepMonth(1));
  todayBtn?.addEventListener("click", () => {
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    refresh().catch(console.error);
  });

  // initial
  ensurePicker();
  refresh().catch((e) => {
    console.error(e);
    container.innerHTML = `<div class="muted">Failed to load calendar.</div>`;
  });

  return {
    refresh,
    setMonth: (year, monthIndex) => {
      viewYear = year;
      viewMonth = monthIndex;
      return refresh();
    },
  };
}
