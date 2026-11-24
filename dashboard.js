// Bar Vibe dashboard. Bar owners sign in with an emailed link and see their own bar's history.
// Admins see every bar, add bars and link owners. The database rules decide who sees what;
// this page only asks for data and shows whatever the database lets it have.
(function () {
  const cfg = window.BAR_VIBE_CONFIG || {};
  const URL_BASE = (cfg.SUPABASE_URL || "").replace(/\/+$/, "");
  const KEY = cfg.SUPABASE_ANON_KEY || "";
  const SESSION_KEY = "barvibe.dash.session.v1";
  const el = document.getElementById("dash");
  const toastEl = document.getElementById("toast");

  const CROWD = window.CROWD_LABELS || ["", "Empty", "Quiet", "Steady", "Busy", "Packed"];
  const SOUND = window.SOUND_LABELS || ["", "Silent", "Easy to talk", "Background music", "Loud", "Can't hear yourself"];
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  let session = null;   // { access_token, refresh_token, expires_at, email }
  let state = { sent: false, sentTo: "", error: "", isAdmin: false, bars: [], owners: [], barId: "", range: 30, ratings: null, loading: false };

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove("show"), 3000);
  }
  const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  function hourLabel(h) {
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + " " + ampm;
  }

  function saveSession(s) {
    session = s;
    try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }
  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; }
  }

  async function call(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ apikey: KEY, "Content-Type": "application/json" }, opts.headers || {});
    if (opts.auth !== false && session) headers.Authorization = "Bearer " + session.access_token;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(URL_BASE + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, signal: ctrl.signal });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
      if (!res.ok) {
        const msg = (data && (data.msg || data.message || data.error_description || data.error)) || ("Error " + res.status);
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- sign-in ----------
  function redirectUrl() { return location.origin + location.pathname; }

  async function sendLink(email) {
    await call("/auth/v1/otp?redirect_to=" + encodeURIComponent(redirectUrl()), {
      method: "POST", auth: false, body: { email: email, create_user: true }
    });
  }

  // The emailed link comes back to this page with the session in the address after "#".
  function takeSessionFromUrl() {
    if (!location.hash || location.hash.length < 2) return null;
    const p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", location.pathname + location.search);
    if (p.get("error") || p.get("error_description")) {
      const code = p.get("error_code") || "";
      state.error = code === "otp_expired" ? "That sign-in link has expired or was already used. Send yourself a new one."
        : (p.get("error_description") || "That sign-in link didn't work. Send yourself a new one.").replace(/\+/g, " ");
      return null;
    }
    if (!p.get("access_token")) return null;
    return {
      access_token: p.get("access_token"),
      refresh_token: p.get("refresh_token"),
      expires_at: p.get("expires_at") ? Number(p.get("expires_at")) * 1000 : Date.now() + Number(p.get("expires_in") || 3600) * 1000,
      email: ""
    };
  }

  async function freshSession() {
    if (!session) return null;
    if (Date.now() < session.expires_at - 60000) return session;
    try {
      const r = await call("/auth/v1/token?grant_type=refresh_token", { method: "POST", auth: false, body: { refresh_token: session.refresh_token } });
      saveSession({ access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + (r.expires_in || 3600) * 1000, email: (r.user && r.user.email) || session.email });
      return session;
    } catch (e) {
      saveSession(null);
      return null;
    }
  }

  async function signOut() {
    try { if (session) await call("/auth/v1/logout", { method: "POST" }); } catch (e) {}
    saveSession(null);
    state = { sent: false, sentTo: "", error: "", isAdmin: false, bars: [], owners: [], barId: "", range: 30, ratings: null, loading: false };
    render();
  }

  // ---------- data ----------
  async function loadAccess() {
    const me = await call("/auth/v1/user");
    session.email = (me && me.email) || "";
    saveSession(session);
    const admins = await call("/rest/v1/admins?select=email");
    state.isAdmin = Array.isArray(admins) && admins.length > 0;
    const allBars = await call("/rest/v1/bars?select=*&order=sort.asc,name.asc");
    if (state.isAdmin) {
      state.bars = allBars;
      state.owners = await call("/rest/v1/bar_owners?select=bar_id,email&order=bar_id.asc,email.asc");
    } else {
      const mine = await call("/rest/v1/bar_owners?select=bar_id,email");
      const ids = new Set(mine.map((o) => o.bar_id));
      state.bars = allBars.filter((b) => ids.has(b.id));
      state.owners = mine;
    }
    if (!state.bars.some((b) => b.id === state.barId)) state.barId = state.bars.length ? state.bars[0].id : "";
  }

  async function loadRatings() {
    if (!state.barId) { state.ratings = []; return; }
    const since = new Date(Date.now() - state.range * 86400000).toISOString();
    state.ratings = await call("/rest/v1/ratings?select=crowd,sound,mood,music,worth,created_at&bar_id=eq." +
      encodeURIComponent(state.barId) + "&created_at=gte." + encodeURIComponent(since) + "&order=created_at.desc&limit=10000");
  }

  async function refreshAll() {
    state.loading = true;
    render();
    try {
      if (!(await freshSession())) { render(); return; }
      await loadAccess();
      await loadRatings();
    } catch (e) {
      if (e.status === 401) { saveSession(null); state.error = "Your sign-in ran out. Send yourself a new link."; }
      else toast(e.message || "Something went wrong. Try again.");
    }
    state.loading = false;
    render();
  }

  // ---------- views ----------
  function viewSignIn() {
    if (state.sent) {
      return '<section class="panel dash-signin"><h1>Check your email</h1>' +
        "<p>We sent a sign-in link to <strong>" + esc(state.sentTo) + "</strong>. Open it on this phone or computer to get into your dashboard.</p>" +
        '<p class="muted small">The email comes from Supabase Auth. If it isn\'t there in a minute, look in spam.</p>' +
        '<button class="btn" data-action="restart">Use a different email</button></section>';
    }
    return '<section class="panel dash-signin"><h1>Bar dashboard</h1>' +
      "<p>See how your bar's nights go: crowd, loudness, busiest hours, mood and music, from people who were there.</p>" +
      (state.error ? '<p class="dash-error">' + esc(state.error) + "</p>" : "") +
      '<form data-form="signin"><label class="field"><span>Your email</span>' +
      '<input type="email" name="email" required autocomplete="email" inputmode="email" placeholder="you@yourbar.com"></label>' +
      '<button class="btn primary wide" type="submit">Email me a sign-in link</button></form>' +
      '<p class="muted small">No password. Bar Vibe links your email to your bar, so you only see your own bar.</p></section>';
  }

  function tiles(rs) {
    const worth = rs.filter((r) => r.worth).length;
    const c = avg(rs.map((r) => r.crowd)), s = avg(rs.map((r) => r.sound));
    const tile = (big, label) => '<div class="tile"><div class="tile-big">' + big + '</div><div class="muted small">' + label + "</div></div>";
    return '<div class="tiles">' +
      tile(rs.length, "ratings") +
      tile(rs.length ? CROWD[Math.round(c)] : "–", "usual crowd" + (rs.length ? " (" + c.toFixed(1) + " of 5)" : "")) +
      tile(rs.length ? SOUND[Math.round(s)] : "–", "usual sound" + (rs.length ? " (" + s.toFixed(1) + " of 5)" : "")) +
      tile(rs.length ? pct(worth, rs.length) + "%" : "–", "would tell a friend to come") + "</div>";
  }

  function perDay(rs) {
    const days = state.range;
    const counts = new Array(days).fill(0);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    rs.forEach((r) => {
      const d = new Date(r.created_at); d.setHours(0, 0, 0, 0);
      const i = days - 1 - Math.round((start - d) / 86400000);
      if (i >= 0 && i < days) counts[i]++;
    });
    const max = Math.max(1, ...counts);
    const cols = counts.map((n, i) => {
      const d = new Date(start - (days - 1 - i) * 86400000);
      const label = (d.getMonth() + 1) + "/" + d.getDate();
      return '<div class="col" title="' + esc(label + ": " + n + " ratings") + '"><div class="col-fill" style="height:' + Math.round((100 * n) / max) + '%"></div></div>';
    }).join("");
    const first = new Date(start - (days - 1) * 86400000);
    return '<div class="panel"><h3>Ratings per day</h3><div class="cols">' + cols + '</div><div class="cols-axis muted small"><span>' +
      (first.getMonth() + 1) + "/" + first.getDate() + "</span><span>Today</span></div></div>";
  }

  function busiestHours(rs) {
    const by = {};
    rs.forEach((r) => { const h = new Date(r.created_at).getHours(); (by[h] = by[h] || []).push(r.crowd); });
    const hours = Object.keys(by).map(Number);
    if (!hours.length) return "";
    // Show the night in order, from 8 AM through 7 AM.
    hours.sort((a, b) => ((a + 16) % 24) - ((b + 16) % 24));
    const rows = hours.map((h) => {
      const a = avg(by[h]);
      return '<div class="bar-row"><span>' + hourLabel(h) + '</span><div class="track"><div class="fill" style="width:' + Math.round((a / 5) * 100) +
        '%"></div></div><span class="pct">' + CROWD[Math.round(a)] + "</span></div>";
    }).join("");
    return '<div class="panel"><h3>Busiest hours</h3><p class="muted small">How crowded people said it was, by hour.</p>' + rows + "</div>";
  }

  function byWeekday(rs) {
    const by = {};
    rs.forEach((r) => { const d = new Date(r.created_at).getDay(); (by[d] = by[d] || []).push(r.crowd); });
    if (!Object.keys(by).length) return "";
    const rows = [1, 2, 3, 4, 5, 6, 0].filter((d) => by[d]).map((d) => {
      const a = avg(by[d]);
      return '<div class="bar-row"><span>' + DAYS[d] + ' <span class="muted small">(' + by[d].length + ')</span></span><div class="track"><div class="fill" style="width:' +
        Math.round((a / 5) * 100) + '%"></div></div><span class="pct">' + CROWD[Math.round(a)] + "</span></div>";
    }).join("");
    return '<div class="panel"><h3>By day of the week</h3>' + rows + "</div>";
  }

  function mix(rs, field, title, list) {
    const counts = {};
    let total = 0;
    rs.forEach((r) => { if (r[field]) { counts[r[field]] = (counts[r[field]] || 0) + 1; total++; } });
    if (!total) return '<div class="panel"><h3>' + title + '</h3><p class="muted small">No answers yet.</p></div>';
    const emoji = (v) => ((list || []).find((x) => x.id === v) || {}).emoji || "";
    const rows = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).map((k) =>
      '<div class="bar-row"><span>' + emoji(k) + " " + esc(k) + '</span><div class="track"><div class="fill" style="width:' + pct(counts[k], total) +
      '%"></div></div><span class="pct">' + pct(counts[k], total) + "%</span></div>").join("");
    return '<div class="panel"><h3>' + title + "</h3>" + rows + "</div>";
  }

  function recent(rs) {
    if (!rs.length) return "";
    const items = rs.slice(0, 15).map((r) => {
      const d = new Date(r.created_at);
      const when = DAYS[d.getDay()] + " " + (d.getMonth() + 1) + "/" + d.getDate() + ", " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return "<li><span>" + esc(CROWD[r.crowd]) + ", " + esc(SOUND[r.sound]).toLowerCase() + ", " + esc(r.mood) + (r.music ? ", " + esc(r.music) : "") +
        (r.worth ? " 👍" : " 👎") + '</span><span class="muted small">' + esc(when) + "</span></li>";
    }).join("");
    return '<div class="panel"><h3>Latest ratings</h3><ul class="dash-feed">' + items + "</ul></div>";
  }

  function adminPanel() {
    const barOptions = state.bars.map((b) => '<option value="' + esc(b.id) + '">' + esc(b.name) + "</option>").join("");
    const ownerRows = state.bars.map((b) => {
      const os = state.owners.filter((o) => o.bar_id === b.id);
      return '<li><div><strong>' + esc(b.name) + "</strong>" + (b.active ? "" : ' <span class="muted small">(hidden)</span>') +
        '<div class="muted small">' + (os.length ? os.map((o) => esc(o.email) + ' <button class="link-btn" data-action="unlink" data-bar="' + esc(b.id) +
          '" data-email="' + esc(o.email) + '">remove</button>').join(" · ") : "No owner linked") + "</div></div>" +
        '<button class="btn small-btn" data-action="toggle" data-bar="' + esc(b.id) + '" data-active="' + (b.active ? "1" : "0") + '">' + (b.active ? "Hide" : "Show") + "</button></li>";
    }).join("");
    return '<section class="admin"><h2>Admin</h2>' +
      '<div class="panel"><h3>Link an owner to a bar</h3><form data-form="link" class="form-grid">' +
      '<label class="field"><span>Bar</span><select name="bar">' + barOptions + "</select></label>" +
      '<label class="field"><span>Owner\'s email</span><input type="email" name="email" required placeholder="owner@theirbar.com"></label>' +
      '<button class="btn primary" type="submit">Link owner</button></form>' +
      '<p class="muted small">They sign in here with that email and see only that bar.</p></div>' +
      '<div class="panel"><h3>Bars and owners</h3><ul class="owner-list">' + ownerRows + "</ul></div>" +
      '<div class="panel"><h3>Add a bar</h3><form data-form="addbar" class="form-grid">' +
      '<label class="field"><span>Name</span><input name="name" required maxlength="80" placeholder="The Archer"></label>' +
      '<label class="field"><span>Address</span><input name="area" maxlength="120" placeholder="176 Newark Ave"></label>' +
      '<label class="field"><span>Kind of bar</span><input name="kind" maxlength="60" placeholder="Cocktail bar"></label>' +
      '<label class="field"><span>Emoji</span><input name="emoji" maxlength="8" placeholder="🍸"></label>' +
      '<label class="field wide-field"><span>One line about it</span><input name="blurb" maxlength="300" placeholder="Dark wood, good cocktails."></label>' +
      '<label class="field wide-field"><span>Location (latitude, longitude)</span><input name="latlng" placeholder="40.7213, -74.0452"></label>' +
      '<button class="btn primary" type="submit">Add bar</button></form>' +
      '<p class="muted small">For the location, right-click the bar in Google Maps and tap the numbers to copy them. Without it, anyone anywhere can rate the bar.</p></div>' +
      "</section>";
  }

  function viewDashboard() {
    const head = '<div class="dash-head"><div><h1>Dashboard</h1><p class="muted small">Signed in as ' + esc(session.email || "…") +
      (state.isAdmin ? " · admin" : "") + '</p></div><button class="btn" data-action="signout">Sign out</button></div>';
    if (state.loading && !state.ratings) return head + '<p class="loading">Loading your bar…</p>';
    if (!state.bars.length) {
      return head + '<section class="panel"><p>Your email isn\'t linked to a bar yet.</p><p class="muted">Ask Bar Vibe to link ' +
        esc(session.email) + " to your bar, then come back here.</p></section>" + (state.isAdmin ? adminPanel() : "");
    }
    const bar = state.bars.find((b) => b.id === state.barId) || state.bars[0];
    const rs = state.ratings || [];
    const picker = state.bars.length > 1
      ? '<select class="sort" data-input="bar" aria-label="Bar">' + state.bars.map((b) => '<option value="' + esc(b.id) + '"' + (b.id === bar.id ? " selected" : "") + ">" + esc(b.name) + "</option>").join("") + "</select>"
      : '<h2 class="dash-bar-name">' + esc(bar.emoji || "") + " " + esc(bar.name) + "</h2>";
    const range = '<select class="sort" data-input="range" aria-label="Time range">' + [7, 30, 90].map((d) =>
      '<option value="' + d + '"' + (d === state.range ? " selected" : "") + ">Last " + d + " days</option>").join("") + "</select>";
    const body = rs.length
      ? tiles(rs) + perDay(rs) + '<div class="dash-two">' + busiestHours(rs) + byWeekday(rs) + "</div>" +
        '<div class="dash-two">' + mix(rs, "mood", "Mood", window.MOODS) + mix(rs, "music", "What's playing", window.MUSIC) + "</div>" + recent(rs)
      : '<section class="panel"><p>No ratings for ' + esc(bar.name) + " in the last " + state.range + " days yet.</p>" +
        '<p class="muted">Put the QR code on your tables and ratings show up here as guests send them.</p></section>';
    return head + '<div class="controls">' + picker + range + "</div>" + body + (state.isAdmin ? adminPanel() : "");
  }

  function render() {
    el.innerHTML = session ? viewDashboard() : viewSignIn();
  }

  // ---------- events ----------
  el.addEventListener("submit", async (e) => {
    const form = e.target.closest("form");
    if (!form) return;
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    const f = new FormData(form);
    const again = () => { if (btn) btn.disabled = false; };
    if (btn) btn.disabled = true;
    try {
      if (form.dataset.form === "signin") {
        const email = String(f.get("email") || "").trim().toLowerCase();
        await sendLink(email);
        state.sent = true; state.sentTo = email; state.error = "";
        render();
      } else if (form.dataset.form === "link") {
        const email = String(f.get("email") || "").trim().toLowerCase();
        await call("/rest/v1/bar_owners", { method: "POST", headers: { Prefer: "return=minimal" }, body: { bar_id: f.get("bar"), email: email } });
        toast("Linked " + email);
        await refreshAll();
      } else if (form.dataset.form === "addbar") {
        const name = String(f.get("name") || "").trim();
        const row = { id: slug(name), name: name, area: f.get("area") || null, kind: f.get("kind") || null, emoji: f.get("emoji") || null, blurb: f.get("blurb") || null, sort: 100 };
        const ll = String(f.get("latlng") || "").split(/[ ,]+/).filter(Boolean).map(Number);
        if (ll.length === 2 && ll.every(isFinite)) { row.lat = ll[0]; row.lng = ll[1]; }
        else if (String(f.get("latlng") || "").trim()) throw new Error("The location should be two numbers, like 40.7213, -74.0452.");
        if (row.id.length < 2) throw new Error("Give the bar a name.");
        await call("/rest/v1/bars", { method: "POST", headers: { Prefer: "return=minimal" }, body: row });
        toast(name + " is on Bar Vibe now");
        await refreshAll();
      }
    } catch (err) {
      const m = err.message || "";
      if (/not authorized/i.test(m)) toast("That email can't get sign-in links yet. Ask Bar Vibe to turn on email for it.");
      else if (/duplicate|already exists|23505/i.test(m)) toast("That's already there.");
      else if (/rate limit/i.test(m)) toast("Too many emails just now. Try again in a little while.");
      else toast(m || "Something went wrong. Try again.");
      again();
    }
  });

  el.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t || !t.dataset.action) return;
    const a = t.dataset.action;
    try {
      if (a === "signout") return signOut();
      if (a === "restart") { state.sent = false; render(); return; }
      if (a === "unlink") {
        if (!confirm("Remove " + t.dataset.email + " from this bar?")) return;
        await call("/rest/v1/bar_owners?bar_id=eq." + encodeURIComponent(t.dataset.bar) + "&email=eq." + encodeURIComponent(t.dataset.email), { method: "DELETE" });
        toast("Removed");
        return refreshAll();
      }
      if (a === "toggle") {
        await call("/rest/v1/bars?id=eq." + encodeURIComponent(t.dataset.bar), { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { active: t.dataset.active !== "1" } });
        return refreshAll();
      }
    } catch (err) {
      toast(err.message || "Something went wrong. Try again.");
    }
  });

  el.addEventListener("change", async (e) => {
    const k = e.target.dataset.input;
    if (k === "bar") { state.barId = e.target.value; state.ratings = null; await refreshAll(); }
    if (k === "range") { state.range = Number(e.target.value); state.ratings = null; await refreshAll(); }
  });

  // ---------- start ----------
  if (!URL_BASE || !KEY) { el.innerHTML = '<section class="panel"><p>The dashboard needs live ratings switched on first.</p></section>'; return; }
  const fromUrl = takeSessionFromUrl();
  if (fromUrl) saveSession(fromUrl); else session = loadSession();
  if (session) refreshAll(); else render();
})();
