// ====== CONFIG ======
const STORAGE = { API:'vgb_api', TOKEN:'vgb_token', USER:'vgb_user' };
const FALLBACK_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#24BAE6"/><stop offset="1" stop-color="#4AED80"/>
  </linearGradient></defs>
  <rect width="100%" height="100%" fill="#0b0f14"/>
  <rect x="40" y="40" width="720" height="370" rx="26" fill="url(#g)" opacity="0.15"/>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
    font-family="Inter, Arial" font-size="28" fill="rgba(255,255,255,0.75)">VGB — No Image</text>
</svg>`);

const state = {
  route: 'catalog',
  games: [],
  filtered: [],
  platforms: [],
  genres: [],
  selPlatforms: new Set(),
  selGenres: new Set(),
  user: null,
  token: null,
  favorites: [],
  calMonth: new Date()
};

// ====== HELPERS ======
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

function apiBase(){
  return localStorage.getItem(STORAGE.API) || 'http://localhost:5000';
}
function apiUrl(path){
  return apiBase().replace(/\/$/,'') + path;
}
async function api(path, opts={}){
  const headers = { 'Content-Type':'application/json', ...(opts.headers||{}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(apiUrl(path), { ...opts, headers });
  const txt = await res.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!res.ok) throw new Error((data && data.error) ? data.error : `HTTP ${res.status}`);
  return data;
}
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function fmtDate(d){
  if (!d) return '—';
  const x = new Date(d); if (isNaN(x.getTime())) return '—';
  return x.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
}
function imgUrl(u){
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return apiUrl(u);
  return u;
}

// ====== ROUTING ======
function setRoute(r){
  state.route = r;

  $$('.navbtn').forEach(b=>{
    b.setAttribute('aria-current', b.dataset.route===r ? 'page' : 'false');
  });

  $('#viewCatalog').hidden = r!=='catalog';
  $('#viewCalendar').hidden = r!=='calendar';
  $('#viewFavorites').hidden = r!=='favorites';
  $('#viewAdmin').hidden = r!=='admin';

  const titles = {
    catalog: ['Catalog','Browse games and open details to read reviews.'],
    calendar: ['Release Calendar','Monthly view of releases with cover images.'],
    favorites: ['Favorites','Your saved games.'],
    admin: ['Admin','Manage games and moderate reviews.']
  };
  $('#viewTitle').textContent = titles[r][0];
  $('#viewSub').textContent = titles[r][1];

  if (r==='favorites') loadFavorites().catch(alertErr);
  if (r==='calendar') renderCalendar();
  if (r==='admin') renderAdmin();
}
function alertErr(e){ alert(e?.message || String(e)); }

// ====== AUTH ======
function loadAuth(){
  state.token = localStorage.getItem(STORAGE.TOKEN);
  const u = localStorage.getItem(STORAGE.USER);
  state.user = u ? JSON.parse(u) : null;
  syncAuthUI();
}
function syncAuthUI(){
  const logged = !!(state.user && state.token);
  $('#loginBtn').hidden = logged;
  $('#logoutBtn').hidden = !logged;

  $('#pillName').textContent = logged ? state.user.username : 'Guest';
  $('#pillRole').textContent = logged ? state.user.userType : 'Browsing';

  // Role-based UI:
  $('#navFav').hidden = !(logged && state.user.userType !== 'Admin');
  $('#navAdmin').hidden = !(logged && state.user.userType === 'Admin');

  // Admins are content-only:
  if (logged && state.user.userType==='Admin' && state.route==='favorites') setRoute('admin');
}
function openAuth(){ $('#authModal').showModal(); selectAuthMode('login'); }
function selectAuthMode(mode){
  $$('.tab').forEach(t=>t.classList.toggle('active', t.dataset.mode===mode));
  $('#loginFields').hidden = mode!=='login';
  $('#registerFields').hidden = mode!=='register';
  $('#authTitle').textContent = mode==='login' ? 'Login' : 'Register';
  $('#authErr').hidden = true;
}
async function submitAuth(){
  const mode = $$('.tab').find(t=>t.classList.contains('active')).dataset.mode;
  try{
    if (mode==='login'){
      const email = $('#loginEmail').value.trim();
      const password = $('#loginPass').value;
      const data = await api('/api/auth/login',{ method:'POST', body: JSON.stringify({email,password}) });
      persistLogin(data);
      $('#authModal').close();
    } else {
      const username = $('#regUser').value.trim();
      const email = $('#regEmail').value.trim();
      const password = $('#regPass').value;
      const userType = $('#regType').value;
      const data = await api('/api/auth/register',{ method:'POST', body: JSON.stringify({username,email,password,userType}) });
      persistLogin(data);
      $('#authModal').close();
    }
  }catch(e){
    $('#authErr').hidden = false;
    $('#authErr').textContent = e.message;
  }
}
function persistLogin(data){
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem(STORAGE.TOKEN, state.token);
  localStorage.setItem(STORAGE.USER, JSON.stringify(state.user));
  syncAuthUI();
  setRoute(state.user.userType==='Admin' ? 'admin' : 'catalog');
}

// ====== DATA LOAD ======
async function loadGames(){
  const list = await api('/api/games');
  state.games = Array.isArray(list) ? list : [];
  buildFacets();
  updateStats();
  applyFilters();
}
function buildFacets(){
  const ps = new Set(), gs = new Set();
  state.games.forEach(g => (g.platform||[]).forEach(x=>ps.add(x)));
  state.games.forEach(g => (g.genre||[]).forEach(x=>gs.add(x)));
  state.platforms = [...ps].sort();
  state.genres = [...gs].sort();

  // chips
  const pc = $('#platformChips'); pc.innerHTML = '';
  const gc = $('#genreChips'); gc.innerHTML = '';

  state.platforms.forEach(name=>{
    const b = document.createElement('button');
    b.className='chip'; b.type='button';
    b.textContent=name; b.setAttribute('aria-pressed','false');
    b.onclick=()=>{ toggleSet(state.selPlatforms,name); b.setAttribute('aria-pressed', state.selPlatforms.has(name)); };
    pc.appendChild(b);
  });
  state.genres.forEach(name=>{
    const b = document.createElement('button');
    b.className='chip'; b.type='button';
    b.textContent=name; b.setAttribute('aria-pressed','false');
    b.onclick=()=>{ toggleSet(state.selGenres,name); b.setAttribute('aria-pressed', state.selGenres.has(name)); };
    gc.appendChild(b);
  });
}
function toggleSet(set,v){ set.has(v)?set.delete(v):set.add(v); }
function updateStats(){
  $('#statGames').textContent = state.games.length;
  $('#statUpcoming').textContent = state.games.filter(g=>g.status==='Upcoming').length;
  $('#statReleased').textContent = state.games.filter(g=>g.status==='Released').length;
}

// ====== FILTERING (client-side, no backend changes) ======
function applyFilters(){
  const q = $('#q').value.trim().toLowerCase();
  const status = $('#status').value;
  const minRating = $('#minRating').value ? Number($('#minRating').value) : null;
  const from = $('#dateFrom').value ? new Date($('#dateFrom').value) : null;
  const to = $('#dateTo').value ? new Date($('#dateTo').value) : null;

  let out = [...state.games];

  // title/keywords (title + description)
  if (q){
    out = out.filter(g=>{
      const t=(g.title||'').toLowerCase();
      const d=(g.description||'').toLowerCase();
      return t.includes(q) || d.includes(q);
    });
  }
  if (status) out = out.filter(g=>g.status===status);

  if (state.selPlatforms.size){
    out = out.filter(g => (g.platform||[]).some(p=>state.selPlatforms.has(p)));
  }
  if (state.selGenres.size){
    out = out.filter(g => (g.genre||[]).some(x=>state.selGenres.has(x)));
  }
  if (minRating!==null){
    out = out.filter(g => (g.averageRating||0) >= minRating);
  }
  if (from){
    out = out.filter(g => g.releaseDate && new Date(g.releaseDate) >= from);
  }
  if (to){
    const end = new Date(to); end.setHours(23,59,59,999);
    out = out.filter(g => g.releaseDate && new Date(g.releaseDate) <= end);
  }

  // sort
  const sort = $('#sortBy').value;
  out.sort((a,b)=>{
    if (sort==='titleAsc') return (a.title||'').localeCompare(b.title||'');
    if (sort==='ratingDesc') return (b.averageRating||0) - (a.averageRating||0);
    const da = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
    const db = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
    return sort==='releaseAsc' ? da-db : db-da;
  });

  state.filtered = out;
  renderCatalog();
  if (state.route==='calendar') renderCalendar();
}
function clearFilters(){
  $('#q').value=''; $('#status').value=''; $('#minRating').value='';
  $('#dateFrom').value=''; $('#dateTo').value='';
  state.selPlatforms.clear(); state.selGenres.clear();
  $$('.chip').forEach(c=>c.setAttribute('aria-pressed','false'));
  applyFilters();
}

// ====== CATALOG UI ======
function renderCatalog(){
  const grid = $('#grid'); grid.innerHTML='';
  $('#empty').hidden = state.filtered.length !== 0;

  for (const g of state.filtered){
    const card = document.createElement('article');
    card.className='card';

    const u = imgUrl(g.imageURL) || FALLBACK_IMG;
    const rating = (g.averageRating||0).toFixed(1);
    const total = g.totalRatings||0;

    card.innerHTML = `
      <div class="thumb">
        <span class="badge">${esc(g.status||'—')}</span>
        <img src="${u}" alt="${esc(g.title||'Game')}">
      </div>
      <div class="card-body">
        <div class="card-title">${esc(g.title||'Untitled')}</div>
        <div class="tags">
          ${(g.platform||[]).slice(0,3).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}
          ${(g.genre||[]).slice(0,2).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}
        </div>
        <div class="meta">
          <span>Release: ${fmtDate(g.releaseDate)}</span>
          <span>${rating}★ (${total})</span>
        </div>
      </div>
      <div class="card-foot">
        <button class="btn ghost" data-open="${g._id}">Details</button>
        ${secondaryAction(g._id)}
      </div>
    `;

    const img = $('img', card);
    img.onerror=()=>img.src=FALLBACK_IMG;

    $('[data-open]',card).onclick=()=>openGame(g._id);
    const favBtn = $('[data-fav]',card);
    if (favBtn) favBtn.onclick=()=>toggleFavorite(g._id,true);

    grid.appendChild(card);
  }
}
function secondaryAction(gameId){
  if (!state.user || !state.token) return `<button class="btn primary" data-fav="${gameId}">Login to Favorite</button>`;
  if (state.user.userType==='Admin') return `<button class="btn primary" disabled>Admin</button>`;
  return `<button class="btn primary" data-fav="${gameId}">☆ Favorite</button>`;
}

// ====== GAME DETAILS + REVIEWS ======
async function openGame(gameId){
  try{
    const data = await api(`/api/games/${gameId}`); // your backend returns {game, reviews}
    const game = data.game || data;
    const reviews = data.reviews || [];

    $('#gameTitle').textContent = game.title || 'Game';

    const canUser = !!(state.user && state.token && state.user.userType!=='Admin');
    const myReviewExists = canUser && reviews.some(r=>{
      const rid = (r.userId && r.userId._id) ? r.userId._id : r.userId;
      return rid === state.user.id;
    });

    const cover = imgUrl(game.imageURL) || FALLBACK_IMG;

    $('#gameBody').innerHTML = `
      <div class="gd">
        <div class="left">
          <div class="thumb" style="border-radius:18px;overflow:hidden;border:1px solid var(--line);">
            <img id="hero" src="${cover}" alt="${esc(game.title||'Game')}">
          </div>

          <div class="meta" style="margin-top:10px;">
            <span><b>Status:</b> ${esc(game.status||'—')}</span>
            <span><b>Release:</b> ${fmtDate(game.releaseDate)}</span>
          </div>
          <div class="meta" style="margin-top:6px;">
            <span><b>Rating:</b> ${(game.averageRating||0).toFixed(1)}★ (${game.totalRatings||0})</span>
            <span></span>
          </div>

          <div class="tags" style="margin-top:10px;">
            ${(game.platform||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}
            ${(game.genre||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}
          </div>

          <div class="actions" style="margin-top:12px;">
            ${detailActions(gameId, canUser)}
          </div>
        </div>

        <div class="right">
          <div style="font-weight:900;margin-bottom:6px;">Description</div>
          <div class="muted">${esc(game.description||'No description provided.')}</div>

          <div style="font-weight:900;margin:16px 0 6px;">Reviews</div>
          ${
            !canUser ? `<div class="muted">Login as a registered user to post reviews.</div>`
            : myReviewExists ? `<div class="muted">You already reviewed this game. Use <b>Edit</b> on your review.</div>`
            : reviewComposer()
          }

          <div id="reviewList" class="list" style="margin-top:10px;">
            ${renderReviews(reviews)}
          </div>
        </div>
      </div>
      <style>
        .gd{display:grid;grid-template-columns:320px 1fr;gap:14px}
        @media(max-width:860px){.gd{grid-template-columns:1fr}}
      </style>
    `;

    const hero = $('#hero');
    hero.onerror=()=>hero.src=FALLBACK_IMG;

    const fav = $('#detailFav');
    if (fav) fav.onclick=()=>toggleFavorite(gameId,false);

    const login = $('#detailLogin');
    if (login) login.onclick=openAuth;

    const post = $('#postReview');
    if (post) post.onclick=async (ev)=>{
      ev.preventDefault();
      await postReview(gameId);
      await refreshReviews(gameId);
      await loadGames(); // refresh avg rating in catalog
    };

    wireReviewButtons(gameId);

    $('#gameModal').showModal();
  }catch(e){ alertErr(e); }
}
function detailActions(gameId, canUser){
  if (!state.user || !state.token) return `<button class="btn primary" id="detailLogin">Login / Register</button>`;
  if (!canUser) return `<button class="btn primary" disabled>Admin account</button>`;
  return `<button class="btn primary" id="detailFav">Add to Favorites</button>`;
}
function reviewComposer(){
  return `
    <div class="panel" style="padding:12px;margin-top:10px;">
      <div class="row">
        <label class="field">
          <span>Star rating (1–5)</span>
          <select id="ratingSel">
            <option value="">No rating</option>
            <option value="1">1★</option><option value="2">2★</option><option value="3">3★</option>
            <option value="4">4★</option><option value="5">5★</option>
          </select>
        </label>
        <div class="field">
          <span>&nbsp;</span>
          <button class="btn primary" id="postReview">Post</button>
        </div>
      </div>
      <label class="field">
        <span>Text review (optional)</span>
        <textarea id="reviewText" rows="3"></textarea>
      </label>
      <div class="muted">Text-only or rating-only is allowed.</div>
    </div>
  `;
}
function renderReviews(reviews){
  if (!reviews.length) return `<div class="muted">No reviews yet.</div>`;
  const canUser = !!(state.user && state.token);
  return reviews.map(r=>{
    const who = r.userId?.username || 'User';
    const uid = (r.userId && r.userId._id) ? r.userId._id : r.userId;
    const mine = canUser && state.user && uid === state.user.id;
    const isAdmin = canUser && state.user.userType==='Admin';
    const canModify = isAdmin || mine;

    const rating = (r.rating===null || r.rating===undefined) ? '—' : `${r.rating}★`;
    const when = r.createdAt ? new Date(r.createdAt).toLocaleString() : '';

    return `
      <div class="item" data-review="${r._id}">
        <div>
          <div class="item-title">${esc(who)} <span class="muted" style="font-weight:900;">• ${rating}</span></div>
          <div class="item-sub">${esc(r.text||'')}</div>
          <div class="item-sub">${esc(when)}</div>
        </div>
        ${canModify ? `
          <div class="item-actions">
            ${mine ? `<button class="btn ghost" data-edit="${r._id}">Edit</button>` : ``}
            <button class="btn ghost" style="background:rgba(255,107,107,.15)" data-del="${r._id}">Delete</button>
          </div>` : ``}
      </div>
    `;
  }).join('');
}
function wireReviewButtons(gameId){
  $$('[data-del]').forEach(b=>{
    b.onclick=async (ev)=>{
      ev.preventDefault();
      if (!confirm('Delete this review?')) return;
      await api(`/api/reviews/${b.dataset.del}`,{method:'DELETE'});
      await refreshReviews(gameId);
      await loadGames();
    };
  });
  $$('[data-edit]').forEach(b=>{
    b.onclick=async (ev)=>{
      ev.preventDefault();
      const id = b.dataset.edit;
      const item = $(`[data-review="${id}"]`);
      const oldText = item.querySelector('.item-sub')?.textContent || '';
      const newText = prompt('Edit review text:', oldText);
      if (newText===null) return;
      const newRating = prompt('Edit rating (1-5) or blank:', '');
      const payload = { text: newText };
      if (newRating) payload.rating = Math.max(1, Math.min(5, parseInt(newRating,10)));
      await api(`/api/reviews/${id}`,{method:'PUT', body: JSON.stringify(payload)});
      await refreshReviews(gameId);
      await loadGames();
    };
  });
}
async function refreshReviews(gameId){
  const reviews = await api(`/api/reviews/game/${gameId}`);
  $('#reviewList').innerHTML = renderReviews(reviews);
  wireReviewButtons(gameId);
}
async function postReview(gameId){
  const text = $('#reviewText').value.trim();
  const ratingVal = $('#ratingSel').value;
  const payload = { gameId };
  if (text) payload.text = text;
  if (ratingVal) payload.rating = Number(ratingVal);
  if (!payload.text && payload.rating===undefined) throw new Error('Provide text or rating.');
  await api('/api/reviews',{method:'POST', body: JSON.stringify(payload)});
  $('#reviewText').value=''; $('#ratingSel').value='';
}

// ====== FAVORITES ======
async function toggleFavorite(gameId, showAlert){
  if (!state.user || !state.token) return openAuth();
  if (state.user.userType==='Admin') return;

  try{
    await api('/api/favorites',{method:'POST', body: JSON.stringify({gameId})});
  }catch(e){
    if (/already/i.test(e.message)) await api(`/api/favorites/${gameId}`,{method:'DELETE'});
    else throw e;
  }
  if (state.route==='favorites') await loadFavorites();
  if (showAlert) alert('Favorites updated.');
}
async function loadFavorites(){
  if (!state.user || !state.token || state.user.userType==='Admin') return;
  state.favorites = await api('/api/favorites');
  renderFavorites();
}
function renderFavorites(){
  const grid = $('#favGrid'); grid.innerHTML='';
  $('#favEmpty').hidden = (state.favorites||[]).length !== 0;

  for (const f of state.favorites){
    const g = f.gameId; if (!g) continue;
    const u = imgUrl(g.imageURL) || FALLBACK_IMG;

    const card = document.createElement('article');
    card.className='card';
    card.innerHTML=`
      <div class="thumb"><span class="badge">${esc(g.status||'—')}</span><img src="${u}" alt="${esc(g.title||'Game')}"></div>
      <div class="card-body">
        <div class="card-title">${esc(g.title||'Untitled')}</div>
        <div class="meta"><span>${fmtDate(g.releaseDate)}</span><span>${(g.averageRating||0).toFixed(1)}★</span></div>
      </div>
      <div class="card-foot">
        <button class="btn ghost" data-open="${g._id}">Details</button>
        <button class="btn ghost" style="background:rgba(255,107,107,.15)" data-unfav="${g._id}">Remove</button>
      </div>
    `;
    $('img',card).onerror=(ev)=>ev.target.src=FALLBACK_IMG;
    $('[data-open]',card).onclick=()=>openGame(g._id);
    $('[data-unfav]',card).onclick=async ()=>{ await api(`/api/favorites/${g._id}`,{method:'DELETE'}); await loadFavorites(); };
    grid.appendChild(card);
  }
}

// ====== CALENDAR ======
function setCalMonth(d){ state.calMonth = new Date(d.getFullYear(), d.getMonth(), 1); renderCalendar(); }
function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

function renderCalendar(){
  const cal = $('#calendar'); cal.innerHTML='';

  const m = state.calMonth.getMonth();
  const y = state.calMonth.getFullYear();
  $('#calTitle').textContent = state.calMonth.toLocaleDateString(undefined,{month:'long',year:'numeric'});

  // header
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d=>{
    const h=document.createElement('div');
    h.className='cal-dow'; h.textContent=d;
    cal.appendChild(h);
  });

  const first = new Date(y,m,1);
  const startDow = first.getDay();
  const days = new Date(y,m+1,0).getDate();

  // map games by date
  const by = new Map();
  const source = state.filtered.length ? state.filtered : state.games;
  source.forEach(g=>{
    if (!g.releaseDate) return;
    const dt=new Date(g.releaseDate);
    if (isNaN(dt.getTime())) return;
    const key=dt.toISOString().slice(0,10);
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(g);
  });

  for (let i=0;i<startDow;i++){
    const blank=document.createElement('div');
    blank.className='cal-cell'; blank.style.opacity='0.45';
    cal.appendChild(blank);
  }

  for (let day=1; day<=days; day++){
    const dt=new Date(y,m,day);
    const key=dt.toISOString().slice(0,10);
    const items=by.get(key)||[];

    const cell=document.createElement('div');
    cell.className='cal-cell';
    cell.innerHTML=`
      <div class="cal-day">
        <span>${day}</span>
        ${sameDay(dt,new Date()) ? `<span class="tag" style="padding:4px 8px;">Today</span>`:''}
      </div>
      <div class="cal-items">
        ${items.slice(0,8).map(g=>{
          const u=imgUrl(g.imageURL)||FALLBACK_IMG;
          return `<div class="cal-item" title="${esc(g.title||'Game')}" data-open="${g._id}">
                    <img src="${u}" alt="${esc(g.title||'Game')}">
                  </div>`;
        }).join('')}
        ${items.length>8 ? `<span class="muted" style="font-size:12px;">+${items.length-8}</span>`:''}
      </div>
    `;
    $$('img',cell).forEach(im=>im.onerror=()=>im.src=FALLBACK_IMG);
    $$('[data-open]',cell).forEach(b=>b.onclick=()=>openGame(b.dataset.open));
    cal.appendChild(cell);
  }
}

// ====== ADMIN ======
function renderAdmin(){
  if (!state.user || !state.token || state.user.userType!=='Admin'){
    $('#viewAdmin').innerHTML = `<div class="panel"><b>Admin only.</b> Login using an admin account.</div>`;
    return;
  }
  renderAdminGames();
}
function renderAdminGames(){
  const list = $('#adminGames'); list.innerHTML='';
  const sorted = [...state.games].sort((a,b)=>(a.title||'').localeCompare(b.title||''));
  for (const g of sorted){
    const row=document.createElement('div');
    row.className='item';
    row.innerHTML=`
      <div>
        <div class="item-title">${esc(g.title||'Untitled')}</div>
        <div class="item-sub">${esc(g.status||'—')} • ${fmtDate(g.releaseDate)}</div>
      </div>
      <div class="item-actions">
        <button class="btn ghost" data-edit="${g._id}">Edit</button>
        <button class="btn ghost" style="background:rgba(255,107,107,.15)" data-del="${g._id}">Delete</button>
      </div>
    `;
    $('[data-edit]',row).onclick=()=>fillGameForm(g);
    $('[data-del]',row).onclick=async ()=>{
      if (!confirm('Delete this game? (Reviews will also be removed by backend logic.)')) return;
      await api(`/api/games/${g._id}`,{method:'DELETE'});
      await loadGames();
    };
    list.appendChild(row);
  }
}
function fillGameForm(g){
  $('#gameId').value = g._id;
  $('#gTitle').value = g.title||'';
  $('#gStatus').value = g.status||'Upcoming';
  $('#gDesc').value = g.description||'';
  $('#gRelease').value = g.releaseDate ? new Date(g.releaseDate).toISOString().slice(0,10) : '';
  $('#gImage').value = g.imageURL||'';
  $('#gPlatform').value = Array.isArray(g.platform) ? g.platform.join(', ') : (g.platform||'');
  $('#gGenre').value = Array.isArray(g.genre) ? g.genre.join(', ') : (g.genre||'');
}
function resetGameForm(){
  $('#gameId').value=''; $('#gTitle').value=''; $('#gStatus').value='Upcoming';
  $('#gDesc').value=''; $('#gRelease').value=''; $('#gImage').value='';
  $('#gPlatform').value=''; $('#gGenre').value='';
}
async function saveGame(ev){
  ev.preventDefault();
  const id = $('#gameId').value.trim();
  const payload = {
    title: $('#gTitle').value.trim(),
    status: $('#gStatus').value,
    description: $('#gDesc').value.trim(),
    releaseDate: $('#gRelease').value ? new Date($('#gRelease').value).toISOString() : null,
    imageURL: $('#gImage').value.trim(),
    platform: $('#gPlatform').value.trim(), // backend accepts comma-separated
    genre: $('#gGenre').value.trim()
  };
  if (id) await api(`/api/games/${id}`,{method:'PUT', body: JSON.stringify(payload)});
  else await api('/api/games',{method:'POST', body: JSON.stringify(payload)});
  resetGameForm();
  await loadGames();
}

async function loadAllReviewsAdmin(){
  const wrap = $('#adminReviews');
  wrap.innerHTML = `<div class="muted">Loading…</div>`;
  const all = [];

  for (const g of state.games){
    try{
      const rs = await api(`/api/reviews/game/${g._id}`);
      rs.forEach(r=>all.push({ ...r, __gameTitle: g.title||'Untitled' }));
    }catch{}
  }
  all.sort((a,b)=> (new Date(b.createdAt||0)) - (new Date(a.createdAt||0)));

  if (!all.length){ wrap.innerHTML = `<div class="muted">No reviews found.</div>`; return; }

  wrap.innerHTML='';
  all.forEach(r=>{
    const who = r.userId?.username || 'User';
    const rating = (r.rating===null || r.rating===undefined) ? '—' : `${r.rating}★`;
    const when = r.createdAt ? new Date(r.createdAt).toLocaleString() : '';

    const row=document.createElement('div');
    row.className='item';
    row.innerHTML=`
      <div>
        <div class="item-title">${esc(r.__gameTitle)} <span class="muted" style="font-weight:900;">• ${esc(who)} • ${rating}</span></div>
        <div class="item-sub">${esc(r.text||'')}</div>
        <div class="item-sub">${esc(when)}</div>
      </div>
      <div class="item-actions">
        <button class="btn ghost" style="background:rgba(255,107,107,.15)" data-del="${r._id}">Delete</button>
      </div>
    `;
    $('[data-del]',row).onclick=async ()=>{
      if (!confirm('Delete this review?')) return;
      await api(`/api/reviews/${r._id}`,{method:'DELETE'});
      await loadGames();
      await loadAllReviewsAdmin();
    };
    wrap.appendChild(row);
  });
}

// ====== SETTINGS ======
function openSettings(){
  $('#apiBaseInput').value = apiBase();
  $('#settingsModal').showModal();
}
function saveSettings(){
  const v = $('#apiBaseInput').value.trim();
  if (!v) return;
  localStorage.setItem(STORAGE.API, v);
  loadGames().catch(alertErr);
}

// ====== EVENTS + BOOT ======
function wire(){
  // nav
  $$('.navbtn').forEach(b=>b.onclick=()=>setRoute(b.dataset.route));

  // filters
  $('#applyBtn').onclick=applyFilters;
  $('#clearBtn').onclick=clearFilters;
  $('#sortBy').onchange=applyFilters;
  $('#q').oninput=applyFilters;

  $('#refreshBtn').onclick=()=>loadGames().catch(alertErr);

  // auth
  $('#loginBtn').onclick=openAuth;
  $('#logoutBtn').onclick=()=>{
    state.user=null; state.token=null;
    localStorage.removeItem(STORAGE.TOKEN);
    localStorage.removeItem(STORAGE.USER);
    syncAuthUI();
    setRoute('catalog');
  };
  $$('.tab').forEach(t=>t.onclick=()=>selectAuthMode(t.dataset.mode));
  $('#authGo').onclick=(ev)=>{ ev.preventDefault(); submitAuth(); };

  // settings
  $('#settingsBtn').onclick=openSettings;
  $('#saveSettingsBtn').onclick=(ev)=>{ ev.preventDefault(); saveSettings(); $('#settingsModal').close(); };

  // calendar
  $('#calPrev').onclick=()=>setCalMonth(new Date(state.calMonth.getFullYear(), state.calMonth.getMonth()-1, 1));
  $('#calNext').onclick=()=>setCalMonth(new Date(state.calMonth.getFullYear(), state.calMonth.getMonth()+1, 1));
  $('#calToday').onclick=()=>setCalMonth(new Date());

  // admin
  $('#gameForm').onsubmit=saveGame;
  $('#resetGameBtn').onclick=resetGameForm;
  $('#loadAllReviewsBtn').onclick=()=>loadAllReviewsAdmin().catch(alertErr);
}

async function boot(){
  wire();
  loadAuth();
  await loadGames();
  setRoute('catalog');

  // “real-time-ish”: refresh list every 60s
  setInterval(()=>loadGames().catch(()=>{}), 60_000);
}
boot().catch(alertErr);
