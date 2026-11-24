// Bar Vibe sensor mode. Runs on one phone that stays at a bar near the speakers.
// Every few minutes it records a few seconds, measures how loud it is, and sends
// the clip to the Bar Vibe song lookup. Clips are matched and thrown away.
(function () {
  "use strict";
  const cfg = window.BAR_VIBE_CONFIG || {};
  const FN = cfg.SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1/now-playing";
  const KEY = "barvibe.sensor.v1";
  const CLIP_SECONDS = 8;
  const $ = (s) => document.querySelector(s);
  const root = $("#sensor");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  let settings = Object.assign({ code: "", every: 2, offset: 100, bar: "" }, load());

  let running = false, stream = null, ctx = null, analyser = null, timer = null, wake = null;
  let checks = 0, lastSong = null, lastDb = null, lastAt = null, status = "Stopped";
  const logLines = [];
  function log(msg) {
    const t = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    logLines.unshift(t + "  " + msg);
    logLines.length = Math.min(logLines.length, 40);
    render();
  }

  let barNames = {};
  function loadBars() {
    const url = cfg.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/bars?select=id,name&apikey=" + encodeURIComponent(cfg.SUPABASE_ANON_KEY);
    fetch(url).then((r) => r.json()).then((rows) => {
      (rows || []).forEach((b) => { barNames[b.id] = b.name; });
      render();
    }).catch(() => {});
  }

  function render() {
    if (!settings.code) {
      root.innerHTML =
        '<section class="panel"><h2>Set up this phone as a sensor</h2>' +
        "<p>Put this phone near the bar's speakers, plugged in. It listens for a few seconds every couple of minutes to tell the app what song is playing and how loud it is.</p>" +
        '<form id="pair"><label class="field">Sensor code<input name="code" autocomplete="off" autocapitalize="characters" placeholder="10 letters and numbers" required></label>' +
        '<button class="btn" type="submit">Save</button></form>' +
        '<p class="muted small">The code comes from the Bar Vibe dashboard (admin) and ties this phone to one bar.</p></section>';
      return;
    }
    const barName = barNames[settings.bar] || settings.bar || "Not checked yet";
    root.innerHTML =
      '<section class="panel"><p class="eyebrow">This phone is the sensor for</p><h2>' + esc(barName) + "</h2>" +
      '<p class="' + (running ? "on" : "off") + '"><strong>' + esc(status) + "</strong></p>" +
      '<div class="row"><div><p class="eyebrow">Now playing</p><p class="song">' +
      (lastSong ? esc(lastSong.title) + (lastSong.artist ? " · " + esc(lastSong.artist) : "") : "—") + "</p></div>" +
      '<div><p class="eyebrow">Loudness</p><p class="big">' + (lastDb ? esc(lastDb) + " dB" : "—") + "</p></div></div>" +
      '<p class="muted small">Checks sent: ' + checks + (lastAt ? " · last at " + esc(lastAt) : "") + "</p>" +
      (running
        ? '<button class="btn" id="stop" type="button">Stop</button>'
        : '<button class="btn" id="start" type="button">Start listening</button>') +
      "</section>" +
      '<section class="panel"><h3>Settings</h3><form id="opts" class="row">' +
      '<label class="field">Check every<select name="every">' +
      [1, 2, 5].map((m) => '<option value="' + m + '"' + (settings.every == m ? " selected" : "") + ">" + m + " min</option>").join("") +
      "</select></label>" +
      '<label class="field">Loudness adjust<input name="offset" type="number" min="60" max="140" step="1" value="' + esc(settings.offset) + '"></label>' +
      "</form>" +
      '<p class="muted small">Loudness adjust: if a sound meter app reads higher than this page, raise it by the difference.</p>' +
      '<p><button class="link-btn" id="unpair" type="button">Use a different code</button></p></section>' +
      '<section class="panel"><h3>Activity</h3><div class="log">' +
      (logLines.length ? logLines.map((l) => "<p>" + esc(l) + "</p>").join("") : '<p class="muted">Nothing yet.</p>') +
      "</div></section>" +
      '<p class="muted small center">Keep this page open and the phone plugged in. Clips are only used to match the song and are not kept.</p>';
  }

  // Loudness: average level over the clip, as a rough room dB figure.
  function sampleLevel() {
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  function pickType() {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (const t of types) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
    return "";
  }

  function recordClip() {
    return new Promise((resolve, reject) => {
      const type = pickType();
      let rec;
      try { rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined); } catch (e) { reject(e); return; }
      const parts = [];
      const levels = [];
      const meter = setInterval(() => levels.push(sampleLevel()), 200);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
      rec.onerror = (e) => { clearInterval(meter); reject(e.error || e); };
      rec.onstop = () => {
        clearInterval(meter);
        const rms = levels.length ? Math.sqrt(levels.reduce((a, v) => a + v * v, 0) / levels.length) : 0;
        const dbfs = rms > 0 ? 20 * Math.log10(rms) : -100;
        const db = Math.round(Math.max(20, Math.min(130, dbfs + Number(settings.offset || 100))));
        resolve({ blob: new Blob(parts, { type: rec.mimeType || type || "audio/webm" }), db: db });
      };
      rec.start();
      setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, CLIP_SECONDS * 1000);
    });
  }

  async function checkOnce() {
    if (!running) return;
    status = "Listening…"; render();
    try {
      if (ctx && ctx.state === "suspended") await ctx.resume();
      const clip = await recordClip();
      status = "Sending…"; render();
      const ext = /mp4/.test(clip.blob.type) ? "m4a" : /ogg/.test(clip.blob.type) ? "ogg" : "webm";
      const form = new FormData();
      form.append("code", settings.code);
      form.append("db", String(clip.db));
      form.append("clip", clip.blob, "clip." + ext);
      const r = await fetch(FN, { method: "POST", body: form, signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { status = "That sensor code isn't working. Check it in the dashboard."; stop(); log("Code refused"); return; }
      if (!r.ok) { log(j.error === "too soon" ? "Skipped: too soon after the last check" : "Server said no (" + r.status + ")"); }
      else {
        checks++;
        lastAt = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        if (j.bar && j.bar !== settings.bar) { settings.bar = j.bar; save(settings); }
        if (j.db) lastDb = j.db;
        if (j.song) { lastSong = j.song; log("Heard: " + j.song.title + (j.song.artist ? " · " + j.song.artist : "") + " · " + (j.db || "?") + " dB"); }
        else log((j.note === "song lookups are off" ? "Loudness saved (song lookups are off)" : j.note === "no match" ? "No song match" : "Saved") + " · " + (j.db || "?") + " dB");
      }
      status = "On: next check in " + settings.every + " min";
    } catch (e) {
      status = "On: last check failed, trying again";
      log("Check failed: " + (e && e.message ? e.message : "network"));
    }
    render();
    if (running) timer = setTimeout(checkOnce, Math.max(45, settings.every * 60 - CLIP_SECONDS) * 1000);
  }

  async function keepAwake() {
    try { if ("wakeLock" in navigator && running) wake = await navigator.wakeLock.request("screen"); } catch (e) {}
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && running) keepAwake(); });

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      status = "Microphone not allowed. Allow it in the browser settings and try again.";
      render(); return;
    }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser);
    running = true;
    await keepAwake();
    log("Started");
    checkOnce();
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (ctx) ctx.close().catch(() => {});
    if (wake) wake.release().catch(() => {});
    stream = ctx = analyser = wake = null;
    if (status.indexOf("code") < 0) status = "Stopped";
    render();
  }

  root.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "pair") {
      const code = String(new FormData(e.target).get("code") || "").replace(/\s+/g, "").toUpperCase();
      if (!/^[0-9A-F]{10}$/.test(code)) { alert("That code should be 10 letters and numbers."); return; }
      settings.code = code; settings.bar = ""; save(settings); render();
    }
  });
  root.addEventListener("change", (e) => {
    if (e.target.form && e.target.form.id === "opts") {
      const f = new FormData(e.target.form);
      settings.every = Number(f.get("every")) || 2;
      settings.offset = Number(f.get("offset")) || 100;
      save(settings);
    }
  });
  root.addEventListener("click", (e) => {
    if (e.target.id === "start") start();
    if (e.target.id === "stop") { status = "Stopped"; stop(); }
    if (e.target.id === "unpair") { stop(); settings.code = ""; settings.bar = ""; save(settings); render(); }
  });

  if (!window.isSecureContext || !navigator.mediaDevices) {
    root.innerHTML = '<section class="panel"><p>This page needs a secure (https) connection and a browser with microphone access, like Chrome on Android.</p></section>';
    return;
  }
  loadBars();
  render();
})();
