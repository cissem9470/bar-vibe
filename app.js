(function () {
  const app = document.getElementById("app");
  const toastEl = document.getElementById("toast");
  const store = window.VibeStore;
  let data = null;
  let loadError = null;
  let homeState = { filter: "All", sort: "best", q: "", music: "" };
  let draft = null;

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const barById = (id) => window.BARS.find((b) => b.id === id);
  const moodEmoji = (m) => (window.MOODS.find((x) => x.id === m) || {}).emoji || "";
  const musicEmoji = (m) => (window.MUSIC.find((x) => x.id === m) || {}).emoji || "🎶";

  // ---------- location check: you can only rate a bar you're at ----------
  const cfg = window.BAR_VIBE_CONFIG || {};
  const NEAR_M = cfg.NEAR_METERS || 150;
  const NEAR_MS = (cfg.NEAR_WINDOW_MIN || 5) * 60 * 1000;
  const nearAt = {}; // barId -> last time this phone was near it (backup if storage is off)
  let geo = { barId: null, status: "idle", dist: null };

  function distM(lat1, lng1, lat2, lng2) {
    const R = 6371000, r = Math.PI / 180;
    const a = Math.sin((lat2 - lat1) * r / 2) ** 2 +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lng2 - lng1) * r / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function lastNear(id) {
    let t = nearAt[id] || 0;
    try { t = Math.max(t, Number(localStorage.getItem("bv-near-" + id)) || 0); } catch (e) {}
    return t;
  }
  const recentlyNear = (id) => Date.now() - lastNear(id) < NEAR_MS;
  // Remember every bar this position is close to, so leaving still lets you rate for a few minutes.
  function markNear(pos) {
    const c = pos.coords, slack = Math.min(c.accuracy || 0, 100), now = Date.now();
    window.BARS.forEach((b) => {
      if (b.lat == null) return;
      if (distM(c.latitude, c.longitude, b.lat, b.lng) - slack <= NEAR_M) {
        nearAt[b.id] = now;
        try { localStorage.setItem("bv-near-" + b.id, String(now)); } catch (e) {}
      }
    });
  }
  function howFar(m) {
    const mi = m / 1609.34;
    return mi < 0.2 ? Math.round(m * 3.281 / 50) * 50 + " ft" : mi.toFixed(1) + " miles";
  }
  function checkLocation(id) {
    if (!navigator.geolocation) { geo = { barId: id, status: "error", dist: null }; render(true); return; }
    geo = { barId: id, status: "checking", dist: null };
    render(true);
    navigator.geolocation.getCurrentPosition((pos) => {
      markNear(pos);
      const b = barById(id);
      const d = b && b.lat != null ? distM(pos.coords.latitude, pos.coords.longitude, b.lat, b.lng) : null;
      geo = { barId: id, status: recentlyNear(id) ? "near" : "far", dist: d };
      if (location.hash === "#/rate/" + id) render(true);
    }, (err) => {
      geo = { barId: id, status: err && err.code === 1 ? "denied" : "error", dist: null };
      if (location.hash === "#/rate/" + id) render(true);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }
  // If location is already allowed, note quietly which bars you're near while the app is open.
  function quietLocate() {
    if (!navigator.geolocation || !navigator.permissions || !navigator.permissions.query) return;
    navigator.permissions.query({ name: "geolocation" }).then((p) => {
      if (p.state === "granted") navigator.geolocation.getCurrentPosition(markNear, function () {}, { maximumAge: 60000, timeout: 15000 });
    }).catch(function () {});
  }
  function locationGate(bar) {
    const id = bar.id;
    if (geo.barId !== id || geo.status === "idle" || geo.status === "near") setTimeout(() => checkLocation(id), 0);
    const back = '<a class="back" href="#/bar/' + esc(id) + '">← ' + esc(bar.name) + "</a>";
    const again = '<button class="btn" data-action="locate" data-bar="' + esc(id) + '">Check again</button>';
    let body;
    if (geo.barId === id && geo.status === "far") {
      body = "<p>You look " + (geo.dist != null ? "about " + howFar(geo.dist) + " from " : "too far from ") + esc(bar.name) + ".</p>" +
        '<p class="muted">Ratings only come from people at the bar, or who were there in the last ' + Math.round(NEAR_MS / 60000) + " minutes.</p>" + again;
    } else if (geo.barId === id && geo.status === "denied") {
      body = "<p>Bar Vibe needs your location to check you're at " + esc(bar.name) + ".</p>" +
        '<p class="muted">Turn on location for Bar Vibe in your phone\'s settings, then try again. It\'s only used to check you\'re at the bar.</p>' + again;
    } else if (geo.barId === id && geo.status === "error") {
      body = "<p>Couldn't find your location.</p><p class=\"muted\">Make sure location is on, then try again.</p>" + again;
    } else {
      body = "<p>Checking you're at " + esc(bar.name) + "…</p>" +
        '<p class="muted">Ratings only come from people at the bar, so your phone may ask to share your location.</p>';
    }
    return back + '<section class="empty">' + body + "</section>";
  }

  function ago(iso) {
    const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (min < 1) return "just now";
    if (min < 60) return min + " min ago";
    const h = Math.floor(min / 60);
    return h + (h === 1 ? " hr ago" : " hrs ago");
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  // Recent ratings count more: a 45-minute-old rating counts about a third as much.
  function summarize(slot) {
    const rs = (slot && slot.ratings) || [];
    if (!rs.length) return { count: 0 };
    let w = 0, crowd = 0, sound = 0, worthYes = 0, worthW = 0;
    const moods = {};
    const music = {};
    let musicW = 0;
    rs.forEach((r) => {
      const ageMin = (Date.now() - Date.parse(r.created_at)) / 60000;
      const k = Math.exp(-ageMin / 45);
      w += k;
      crowd += r.crowd * k;
      sound += r.sound * k;
      worthW += k;
      if (r.worth) worthYes += k;
      moods[r.mood] = (moods[r.mood] || 0) + k;
      if (r.music) { music[r.music] = (music[r.music] || 0) + k; musicW += k; }
    });
    const musicList = Object.keys(music)
      .map((m) => ({ music: m, share: music[m] / musicW }))
      .sort((a, b) => b.share - a.share);
    const moodList = Object.keys(moods)
      .map((m) => ({ mood: m, share: moods[m] / w }))
      .sort((a, b) => b.share - a.share);
    const s = {
      count: rs.length,
      crowd: crowd / w,
      sound: sound / w,
      worth: worthW ? worthYes / worthW : 0,
      moods: moodList,
      topMood: moodList[0] && moodList[0].mood,
      music: musicList,
      topMusic: musicList[0] && musicList[0].music,
      last: rs[0].created_at,
      sensor: slot.sensor
    };
    s.headline = headline(s);
    s.heat = heat(s);
    return s;
  }

  function headline(s) {
    // Uses the same rounding as the meters so the words and the bars agree.
    const c = Math.round(s.crowd), n = Math.round(s.sound);
    if (s.topMood === "Dead" || c <= 1) return "Pretty dead right now";
    if (c >= 5 && n >= 4) return "Packed and loud";
    if (c >= 5) return "Packed, but you can talk";
    if (c === 4 && n >= 4) return "Busy with a real buzz";
    if (c === 4) return "Busy and easygoing";
    if (n >= 4) return "Not crowded, music up";
    if (c === 3) return "Steady and relaxed";
    return "Quiet and easy";
  }

  function heat(s) {
    const score = (s.crowd + s.sound) / 2;
    if (score >= 3.9) return "hot";
    if (score >= 2.8) return "warm";
    return "cool";
  }

  function meter(value, label, kind) {
    const v = Math.round(value || 0);
    let dots = "";
    for (let i = 1; i <= 5; i++) dots += '<span class="pip' + (i <= v ? " on" : "") + '"></span>';
    return '<div class="meter ' + kind + '"><div class="meter-head"><span>' + esc(label) + '</span><strong>' +
      esc((kind === "crowd" ? window.CROWD_LABELS : window.SOUND_LABELS)[v] || "") +
      '</strong></div><div class="pips" aria-hidden="true">' + dots + "</div></div>";
  }

  function modeBanner() {
    if (store.LIVE) return "";
    return '<div class="banner">Test mode: ratings you add stay on this phone until live ratings are switched on.</div>';
  }

  // ---------- views ----------
  function viewHome() {
    if (loadError) {
      return '<section class="empty"><p>Couldn\'t load the vibes just now.</p><p class="muted">' + esc(loadError) +
        '</p><button class="btn" data-action="reload">Try again</button></section>';
    }
    const filters = ["All", "Chill", "Lively", "Dance", "Date night", "Sports"];
    let bars = window.BARS.map((b) => ({ bar: b, s: summarize(data[b.id]) }));
    const q = homeState.q.trim().toLowerCase();
    if (q) bars = bars.filter((x) => (x.bar.name + " " + x.bar.area + " " + x.bar.kind).toLowerCase().includes(q));
    if (homeState.filter !== "All") {
      bars = bars.filter((x) => x.s.count && x.s.moods.some((m) => m.mood === homeState.filter && m.share >= 0.2));
    }
    if (homeState.music) {
      bars = bars.filter((x) => x.s.count && x.s.music && x.s.music.some((m) => m.music === homeState.music && m.share >= 0.2));
    }
    const sorters = {
      best: (a, b) => (b.s.worth || 0) * Math.log(1 + (b.s.count || 0)) - (a.s.worth || 0) * Math.log(1 + (a.s.count || 0)),
      busiest: (a, b) => (b.s.crowd || 0) - (a.s.crowd || 0),
      quietest: (a, b) => (a.s.sound || 9) - (b.s.sound || 9)
    };
    bars.sort(sorters[homeState.sort]);

    const chips = filters.map((f) =>
      '<button class="chip' + (f === homeState.filter ? " active" : "") + '" aria-pressed="' + (f === homeState.filter) + '" data-filter="' + esc(f) + '">' +
      (f === "All" ? "" : moodEmoji(f) + " ") + esc(f) + "</button>").join("");

    const cards = bars.map(({ bar, s }) => {
      if (!s.count) {
        return '<a class="card" href="#/bar/' + esc(bar.id) + '"><div class="card-top"><span class="avatar">' + bar.emoji +
          '</span><div><h3>' + esc(bar.name) + '</h3><p class="muted">' + esc(bar.area) + " · " + esc(bar.kind) +
          '</p></div></div><p class="headline">No ratings yet tonight</p><p class="muted small">Be the first to say how it is.</p></a>';
      }
      return '<a class="card heat-' + s.heat + '" href="#/bar/' + esc(bar.id) + '">' +
        '<div class="card-top"><span class="avatar">' + bar.emoji + '</span><div><h3>' + esc(bar.name) + '</h3><p class="muted">' +
        esc(bar.area) + " · " + esc(bar.kind) + '</p></div><span class="heat-dot" title="' + s.heat + '"></span></div>' +
        '<p class="headline">' + esc(s.headline) + "</p>" +
        '<div class="meters">' + meter(s.crowd, "Crowd", "crowd") + meter(s.sound, "Sound", "sound") + "</div>" +
        '<div class="card-foot"><span class="mood-chip">' + moodEmoji(s.topMood) + " " + esc(s.topMood) + "</span>" +
        (s.topMusic ? '<span class="mood-chip">' + musicEmoji(s.topMusic) + " " + esc(s.topMusic) + "</span>" : "") +
        '<span class="worth">' + Math.round(s.worth * 100) + "% say go now</span></div>" +
        '<p class="muted small">' + s.count + (s.count === 1 ? " rating" : " ratings") + " · updated " + ago(s.last) + "</p></a>";
    }).join("");

    return modeBanner() +
      '<section class="hero"><h1>What\'s the vibe tonight?</h1><p class="muted">Live crowd, music and mood from people who are there right now.</p></section>' +
      '<div class="controls"><input class="search" type="search" placeholder="Search bars or neighborhoods" value="' + esc(homeState.q) +
      '" data-input="q" aria-label="Search bars"><select class="sort" data-input="sort" aria-label="Sort bars">' +
      '<option value="best"' + (homeState.sort === "best" ? " selected" : "") + ">Best right now</option>" +
      '<option value="busiest"' + (homeState.sort === "busiest" ? " selected" : "") + ">Busiest</option>" +
      '<option value="quietest"' + (homeState.sort === "quietest" ? " selected" : "") + ">Quietest</option></select>" +
      '<select class="sort" data-input="music" aria-label="Filter by music"><option value="">Any music</option>' +
      window.MUSIC.map((m) => '<option value="' + esc(m.id) + '"' + (homeState.music === m.id ? " selected" : "") + ">" + m.emoji + " " + esc(m.id) + "</option>").join("") +
      "</select></div>" +
      '<div class="chips" role="group" aria-label="Filter by mood">' + chips + "</div>" +
      (cards ? '<div class="grid">' + cards + "</div>" : '<section class="empty"><p>No bars match that right now.</p></section>');
  }

  function viewBar(id) {
    const bar = barById(id);
    if (!bar) return '<section class="empty"><p>That bar isn\'t on the list.</p><a class="btn" href="#/">See all bars</a></section>';
    const s = summarize(data[id]);
    const sensor = data[id] && data[id].sensor;

    const vibe = s.count
      ? '<div class="vibe-panel heat-' + s.heat + '"><p class="eyebrow">Right now</p><h2>' + esc(s.headline) + "</h2>" +
        '<p class="worth big">' + Math.round(s.worth * 100) + '% of people there say come now</p>' +
        '<div class="meters">' + meter(s.crowd, "Crowd", "crowd") + meter(s.sound, "Sound", "sound") + "</div></div>"
      : '<div class="vibe-panel"><p class="eyebrow">Right now</p><h2>No ratings yet tonight</h2><p class="muted">If you\'re there, you\'ll be the first.</p></div>';

    const sensorBlock = sensor
      ? '<div class="panel sensor"><div><p class="eyebrow">In-bar sound sensor' + (sensor.demo ? " (demo)" : "") + '</p><p class="db"><strong>' +
        esc(sensor.db) + "</strong> dB</p></div><p class=\"muted small\">" + esc(dbWords(sensor.db)) + " · " + ago(sensor.created_at) + "</p></div>"
      : "";

    const moods = s.count
      ? '<div class="panel"><p class="eyebrow">Mood</p>' + s.moods.slice(0, 4).map((m) =>
          '<div class="bar-row"><span>' + moodEmoji(m.mood) + " " + esc(m.mood) + '</span><div class="track"><div class="fill" style="width:' +
          Math.round(m.share * 100) + '%"></div></div><span class="pct">' + Math.round(m.share * 100) + "%</span></div>").join("") + "</div>"
      : "";

    const musicPanel = s.count && s.music.length
      ? '<div class="panel"><p class="eyebrow">What\'s playing</p>' + s.music.slice(0, 4).map((m) =>
          '<div class="bar-row"><span>' + musicEmoji(m.music) + " " + esc(m.music) + '</span><div class="track"><div class="fill" style="width:' +
          Math.round(m.share * 100) + '%"></div></div><span class="pct">' + Math.round(m.share * 100) + "%</span></div>").join("") + "</div>"
      : "";

    const recent = s.count
      ? '<div class="panel"><p class="eyebrow">Latest from inside</p><ul class="feed">' +
        data[id].ratings.slice(0, 8).map((r) =>
          "<li><span>" + moodEmoji(r.mood) + " " + esc(window.CROWD_LABELS[r.crowd]) + ", " + esc(window.SOUND_LABELS[r.sound].toLowerCase()) +
          (r.music ? " · " + esc(r.music) : "") + (r.worth ? " · says come" : " · says skip") + '</span><span class="muted small">' + ago(r.created_at) + "</span></li>").join("") +
        "</ul></div>"
      : "";

    return modeBanner() +
      '<a class="back" href="#/">← All bars</a>' +
      '<section class="bar-head"><span class="avatar lg">' + bar.emoji + '</span><div><h1>' + esc(bar.name) + '</h1><p class="muted">' +
      esc(bar.area) + " · " + esc(bar.kind) + (bar.hours ? " · " + esc(bar.hours) : "") + "</p></div></section>" +
      '<p class="blurb">' + esc(bar.blurb) + "</p>" +
      vibe + sensorBlock + musicPanel + moods + recent +
      '<div class="sticky-cta"><a class="btn primary wide" href="#/rate/' + esc(bar.id) + '">I\'m here: rate the vibe</a></div>';
  }

  function dbWords(db) {
    if (db >= 90) return "Club loud";
    if (db >= 82) return "Loud, raise your voice";
    if (db >= 74) return "Lively chatter";
    if (db >= 66) return "Normal conversation";
    return "Quiet";
  }

  function viewRate(id) {
    const bar = barById(id);
    if (!bar) return viewBar(id);
    const since = Date.now() - store.lastRatedAt(id);
    if (since < store.COOLDOWN_MS) {
      const wait = Math.ceil((store.COOLDOWN_MS - since) / 60000);
      return '<a class="back" href="#/bar/' + esc(id) + '">← ' + esc(bar.name) + '</a><section class="empty"><p>Thanks, you rated ' +
        esc(bar.name) + " a few minutes ago.</p><p class=\"muted\">You can rate it again in " + wait + " min.</p><a class=\"btn\" href=\"#/bar/" +
        esc(id) + '">Back to the bar</a></section>';
    }
    if (bar.lat != null && !recentlyNear(id)) return locationGate(bar);
    if (!draft || draft.bar_id !== id) draft = { bar_id: id, crowd: 0, sound: 0, mood: "", music: "", worth: null };

    const scale = (field, labels) => {
      let out = '<div class="scale" role="radiogroup">';
      for (let i = 1; i <= 5; i++) {
        out += '<button type="button" role="radio" aria-checked="' + (draft[field] === i) + '" class="scale-btn' +
          (draft[field] === i ? " active" : "") + '" data-set="' + field + '" data-value="' + i + '"><span class="n">' + i +
          '</span><span class="l">' + esc(labels[i]) + "</span></button>";
      }
      return out + "</div>";
    };
    const moods = window.MOODS.map((m) =>
      '<button type="button" aria-pressed="' + (draft.mood === m.id) + '" class="chip' + (draft.mood === m.id ? " active" : "") + '" data-set="mood" data-value="' + esc(m.id) + '">' +
      m.emoji + " " + esc(m.id) + "</button>").join("");
    const musicChips = window.MUSIC.map((m) =>
      '<button type="button" aria-pressed="' + (draft.music === m.id) + '" class="chip' + (draft.music === m.id ? " active" : "") + '" data-set="music" data-value="' + esc(m.id) + '">' +
      m.emoji + " " + esc(m.id) + "</button>").join("");
    const ready = draft.crowd && draft.sound && draft.mood && draft.worth !== null;

    return '<a class="back" href="#/bar/' + esc(id) + '">← ' + esc(bar.name) + "</a>" +
      '<section class="rate"><h1>How\'s ' + esc(bar.name) + " right now?</h1><p class=\"muted\">A few taps. Takes ten seconds.</p>" +
      '<div class="q"><h3>How crowded is it?</h3>' + scale("crowd", window.CROWD_LABELS) + "</div>" +
      '<div class="q"><h3>How loud is it?</h3>' + scale("sound", window.SOUND_LABELS) + "</div>" +
      '<div class="q"><h3>What\'s the mood?</h3><div class="chips wrap">' + moods + "</div></div>" +
      '<div class="q"><h3>What\'s playing? <span class="muted small">(skip if you can\'t tell)</span></h3><div class="chips wrap">' + musicChips + "</div></div>" +
      '<div class="q"><h3>Would you tell a friend to come now?</h3><div class="yesno">' +
      '<button type="button" aria-pressed="' + (draft.worth === true) + '" class="chip big' + (draft.worth === true ? " active" : "") + '" data-set="worth" data-value="yes">👍 Yes, come</button>' +
      '<button type="button" aria-pressed="' + (draft.worth === false) + '" class="chip big' + (draft.worth === false ? " active" : "") + '" data-set="worth" data-value="no">👎 Skip it</button></div></div>' +
      '<button class="btn primary wide" data-action="submit"' + (ready ? "" : " disabled") + ">Share the vibe</button>" +
      (store.LIVE ? "" : '<p class="muted small center">Test mode: your rating shows on this phone only.</p>') + "</section>";
  }

  function viewAbout() {
    return '<a class="back" href="#/">← All bars</a>' +
      '<section class="about"><h1>Bar Vibe for bars</h1>' +
      '<p class="lead">People decide where to go out from their couch. Bar Vibe shows them what your room feels like right now, so the right crowd walks in.</p>' +
      '<div class="panel"><h3>How it works</h3><ol>' +
      "<li><strong>Live ratings.</strong> Guests already inside tap in the crowd, the sound and the mood in ten seconds. The phone checks they\'re really at the bar, so ratings can\'t come from someone across town.</li>" +
      "<li><strong>Sound sensor.</strong> A small listening device measures how loud the room is. It reads volume only and never records conversations.</li>" +
      "<li><strong>One clear answer.</strong> People nearby see “Busy with a real buzz” and how many say come now.</li></ol></div>" +
      '<div class="panel"><h3>What your bar gets</h3><ul>' +
      "<li>Your busy nights show up as busy, which draws more people in.</li>" +
      "<li>Quiet nights become a selling point for people who want to talk.</li>" +
      "<li>A simple view of when your room fills up, hour by hour.</li></ul></div>" +
      '<div class="panel"><h3>The pilot</h3><p>We\'re starting with one or two bars. It\'s free during the pilot: a table card with a QR code for guests, and an optional sound sensor.</p></div>' +
      "</section>";
  }

  // ---------- routing and events ----------
  function route() {
    const hash = location.hash.replace(/^#\/?/, "");
    const parts = hash.split("/");
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active",
      (parts[0] === "about" && a.dataset.nav === "about") || (parts[0] !== "about" && a.dataset.nav === "home")));
    if (parts[0] === "about") return viewAbout();
    if (!data && !loadError) return '<div class="loading">Checking the vibes…</div>';
    if (parts[0] === "bar" && parts[1]) return viewBar(parts[1]);
    if (parts[0] === "rate" && parts[1]) return viewRate(parts[1]);
    return viewHome();
  }

  function render(keepScroll) {
    const y = window.scrollY;
    const active = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.input : null;
    app.innerHTML = route();
    if (keepScroll) window.scrollTo(0, y);
    if (active) {
      const el = app.querySelector('[data-input="' + active + '"]');
      if (el) { el.focus(); if (el.setSelectionRange && el.type === "search") el.setSelectionRange(el.value.length, el.value.length); }
    }
  }

  async function refresh() {
    quietLocate();
    const firstLoad = !data && !loadError;
    try {
      data = await store.loadAll();
      loadError = null;
    } catch (e) {
      loadError = e.message || String(e);
    }
    // Don't redraw the rate form under someone's thumb, except to replace the loading screen.
    const onRate = location.hash.indexOf("#/rate/") === 0;
    if (!onRate || firstLoad) render(true);
  }

  app.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.filter) { homeState.filter = t.dataset.filter; render(true); return; }
    if (t.dataset.set) {
      const f = t.dataset.set, v = t.dataset.value;
      if (f === "music") draft.music = draft.music === v ? "" : v; // tap again to clear
      else draft[f] = f === "worth" ? v === "yes" : (f === "mood" ? v : Number(v));
      render(true);
      return;
    }
    if (t.dataset.action === "reload") { await refresh(); return; }
    if (t.dataset.action === "locate") { checkLocation(t.dataset.bar); return; }
    if (t.dataset.action === "submit" && draft) {
      if (!recentlyNear(draft.bar_id)) { geo = { barId: null, status: "idle", dist: null }; render(true); return; }
      t.disabled = true;
      t.textContent = "Sharing…";
      try {
        await store.addRating(draft);
        const id = draft.bar_id;
        draft = null;
        toast("Thanks! Your vibe check is in.");
        data = await store.loadAll();
        location.hash = "#/bar/" + id;
      } catch (err) {
        toast(err.message || "Couldn't share that. Try again.");
        t.disabled = false;
        t.textContent = "Share the vibe";
      }
    }
  });

  app.addEventListener("input", (e) => {
    const k = e.target.dataset.input;
    if (!k) return;
    homeState[k] = e.target.value;
    render(true);
  });

  window.addEventListener("hashchange", () => { geo = { barId: null, status: "idle", dist: null }; render(false); window.scrollTo(0, 0); });

  render(false);
  refresh();
  setInterval(refresh, 60000);
})();
