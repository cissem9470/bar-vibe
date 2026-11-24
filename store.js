// Where ratings come from and go to.
// Demo mode: generated sample ratings plus your own, kept in this browser.
// Live mode: a free Supabase table, read and written over its REST API.
(function () {
  const cfg = window.BAR_VIBE_CONFIG || {};
  const LIVE = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const WINDOW_MS = (cfg.LIVE_WINDOW_MIN || 120) * 60 * 1000;
  const LOCAL_KEY = "barvibe.myRatings.v1";
  const DEVICE_KEY = "barvibe.device.v1";

  function safeGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  function deviceId() {
    let id = safeGet(DEVICE_KEY, null);
    if (!id) {
      id = "d-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      safeSet(DEVICE_KEY, id);
    }
    return id;
  }

  // ---------- demo data ----------
  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Bars are busier late in the evening: 0.45 at 3 PM, 1.0 around 11 PM.
  function nightFactor(date) {
    const h = date.getHours() + date.getMinutes() / 60;
    const shifted = (h + 24 - 4) % 24; // 4 AM = 0
    if (shifted < 10) return 0.35;     // 4 AM to 2 PM: mostly closed or dead
    return 0.45 + 0.55 * Math.sin(Math.PI * clamp((shifted - 10) / 14, 0, 1));
  }

  function demoRatingsFor(bar, now) {
    const bucket = Math.floor(now / (10 * 60 * 1000)); // changes every 10 minutes
    const r = rng(hashString(bar.id + ":" + bucket));
    const night = nightFactor(new Date(now));
    const p = bar.profile;
    const count = Math.round(3 + r() * 9 * night);
    const out = [];
    for (let i = 0; i < count; i++) {
      const ageMin = Math.pow(r(), 1.4) * (WINDOW_MS / 60000);
      const crowdBase = 1 + (p.crowd - 1) * (0.55 + 0.45 * night);
      const soundBase = 1 + (p.sound - 1) * (0.6 + 0.4 * night);
      out.push({
        bar_id: bar.id,
        crowd: clamp(Math.round(crowdBase + (r() - 0.5) * 1.6), 1, 5),
        sound: clamp(Math.round(soundBase + (r() - 0.5) * 1.4), 1, 5),
        mood: night < 0.5 && r() < 0.35 ? "Chill" : p.moods[Math.floor(Math.pow(r(), 1.6) * p.moods.length)],
        worth: r() < p.worth,
        created_at: new Date(now - ageMin * 60000).toISOString(),
        demo: true
      });
    }
    return out;
  }

  function demoSensor(bar, now) {
    const minute = Math.floor(now / 60000);
    const r = rng(hashString(bar.id + ":s:" + minute));
    const night = nightFactor(new Date(now));
    const db = Math.round(bar.profile.sensorDb - 14 * (1 - night) + (r() - 0.5) * 6);
    return { bar_id: bar.id, db: db, created_at: new Date(now).toISOString(), demo: true };
  }

  // ---------- live (Supabase REST) ----------
  function headers(extra) {
    const h = { apikey: cfg.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    // Older "anon" keys are JWTs and also go in Authorization; newer "publishable" keys don't.
    if (/^eyJ/.test(cfg.SUPABASE_ANON_KEY)) h.Authorization = "Bearer " + cfg.SUPABASE_ANON_KEY;
    return Object.assign(h, extra || {});
  }
  const base = () => cfg.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/";
  // Reads send the key in the address and no extra headers, so the browser makes one
  // plain request instead of asking permission first. Every request gives up after 12 seconds.
  const keyParam = () => "&apikey=" + encodeURIComponent(cfg.SUPABASE_ANON_KEY);
  function fetchWithTimeout(url, opts) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 12000) : null;
    return fetch(url, Object.assign({}, opts || {}, ctrl ? { signal: ctrl.signal } : {}))
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  async function liveRatings(since) {
    const url = base() + "ratings?select=bar_id,crowd,sound,mood,music,worth,created_at" +
      "&created_at=gte." + encodeURIComponent(since) + "&order=created_at.desc&limit=2000" + keyParam();
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error("Could not load ratings (" + res.status + ")");
    return res.json();
  }
  async function liveSensors() {
    const since = new Date(Date.now() - 15 * 60000).toISOString();
    const url = base() + "sensor_readings?select=bar_id,db,created_at" +
      "&created_at=gte." + encodeURIComponent(since) + "&order=created_at.desc&limit=500" + keyParam();
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) return [];
      return res.json();
    } catch (e) {
      return [];
    }
  }

  // ---------- public API ----------
  const myRatings = () => safeGet(LOCAL_KEY, []);

  // Bars come from the database when it is switched on, so new bars show up without a site
  // update. If that fails, the list in data.js is used.
  async function liveBars() {
    try {
      const url = base() + "bars?select=id,name,area,kind,emoji,blurb,lat,lng" +
        "&active=is.true&order=sort.asc,name.asc" + keyParam();
      const res = await fetchWithTimeout(url);
      if (!res.ok) return;
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) return;
      const fallback = {};
      (window.BARS || []).forEach(function (b) { fallback[b.id] = b; });
      window.BARS = rows.map(function (r) {
        const b = Object.assign({}, fallback[r.id] || {}, r);
        if (r.lat == null) { delete b.lat; delete b.lng; }
        return b;
      });
    } catch (e) {}
  }

  async function loadAll() {
    const now = Date.now();
    const since = new Date(now - WINDOW_MS).toISOString();
    let ratings = [];
    let sensors = [];
    if (LIVE) {
      const results = await Promise.all([liveRatings(since), liveSensors(), liveBars()]);
      ratings = results[0];
      sensors = results[1];
    } else {
      window.BARS.forEach(function (bar) {
        if (!bar.profile) return; // real bars never get made-up ratings
        ratings = ratings.concat(demoRatingsFor(bar, now));
        sensors.push(demoSensor(bar, now));
      });
      ratings = ratings.concat(myRatings().filter(function (x) { return x.created_at >= since; }));
    }
    const byBar = {};
    window.BARS.forEach(function (b) { byBar[b.id] = { ratings: [], sensor: null }; });
    ratings.forEach(function (x) { if (byBar[x.bar_id]) byBar[x.bar_id].ratings.push(x); });
    sensors.forEach(function (s) {
      const slot = byBar[s.bar_id];
      if (slot && (!slot.sensor || s.created_at > slot.sensor.created_at)) slot.sensor = s;
    });
    Object.keys(byBar).forEach(function (id) {
      byBar[id].ratings.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
    });
    return byBar;
  }

  function lastRatedAt(barId) {
    const mine = myRatings().filter(function (x) { return x.bar_id === barId; });
    if (!mine.length) return 0;
    return Math.max.apply(null, mine.map(function (x) { return Date.parse(x.created_at); }));
  }

  async function addRating(rating) {
    const row = {
      bar_id: rating.bar_id,
      crowd: rating.crowd,
      sound: rating.sound,
      mood: rating.mood,
      worth: rating.worth,
      created_at: new Date().toISOString()
    };
    if (rating.music) row.music = rating.music;
    if (LIVE) {
      const res = await fetchWithTimeout(base() + "ratings", {
        method: "POST",
        headers: headers({ Prefer: "return=minimal" }),
        body: JSON.stringify(Object.assign({ device_id: deviceId() }, row))
      });
      if (!res.ok) throw new Error("Could not save your rating (" + res.status + ")");
    }
    // Kept locally in both modes: in demo it is the data, in live it powers the cooldown.
    const list = myRatings();
    list.push(row);
    safeSet(LOCAL_KEY, list.slice(-200));
    return row;
  }

  window.VibeStore = {
    LIVE: LIVE,
    WINDOW_MS: WINDOW_MS,
    COOLDOWN_MS: (cfg.RATE_COOLDOWN_MIN || 20) * 60 * 1000,
    loadAll: loadAll,
    addRating: addRating,
    lastRatedAt: lastRatedAt
  };
})();
