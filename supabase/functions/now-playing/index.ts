// Bar Vibe "now playing" sensor endpoint.
// A paired phone sends a short clip (and a loudness reading). The clip goes to
// AudD for song matching and is never stored. Only the match is saved.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_CLIP = 2_000_000; // bytes
const MIN_GAP_SECONDS = 40;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "bad form" }, 400); }

  const code = String(form.get("code") || "").trim().toUpperCase();
  if (!/^[0-9A-F]{10}$/.test(code)) return json({ error: "bad code" }, 401);

  const pub = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: checked, error: checkErr } = await pub.rpc("sensor_checkin", { p_code: code });
  if (checkErr) return json({ error: "check failed" }, 500);
  if (!checked) return json({ error: "unknown code" }, 401);
  if (checked === "too_soon") return json({ error: "too soon", retry_in: MIN_GAP_SECONDS }, 429);
  const bar = checked as string;
  const out: Record<string, unknown> = { bar };

  // Loudness reading, if the phone sent one.
  const dbVal = Math.round(Number(form.get("db")));
  if (Number.isFinite(dbVal) && dbVal >= 20 && dbVal <= 130) {
    const { error: dbErr } = await pub.from("sensor_readings").insert({ bar_id: bar, db: dbVal });
    if (dbErr) console.error("sensor_readings insert", dbErr.message);
    out.db = dbVal;
    out.db_saved = !dbErr;
  }

  // Song match, only when the AudD token has been set as a function secret.
  const token = Deno.env.get("AUDD_API_TOKEN");
  const clip = form.get("clip");
  if (!token) {
    out.song = null;
    out.note = "song lookups are off";
  } else if (clip instanceof File && clip.size > 0 && clip.size <= MAX_CLIP) {
    const f = new FormData();
    f.append("api_token", token);
    f.append("file", clip, clip.name || "clip.webm");
    try {
      const r = await fetch("https://api.audd.io/", { method: "POST", body: f, signal: AbortSignal.timeout(20000) });
      const j = await r.json();
      if (j.status === "success" && j.result && j.result.title) {
        const title = String(j.result.title).slice(0, 200);
        const artist = j.result.artist ? String(j.result.artist).slice(0, 200) : null;
        // Skip a duplicate row when the same song is still playing.
        const { data: last } = await pub.from("now_playing").select("title,artist,created_at")
          .eq("bar_id", bar).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const same = last && last.title === title && last.artist === artist &&
          Date.now() - new Date(last.created_at).getTime() < 15 * 60 * 1000;
        let songErr: { message: string } | null = null;
        if (!same) ({ error: songErr } = await pub.from("now_playing").insert({ bar_id: bar, title, artist }));
        if (songErr) console.error("now_playing insert", songErr.message);
        out.song = { title, artist };
        out.song_saved = !songErr;
      } else if (j.status === "error") {
        out.song = null;
        out.note = "lookup error";
      } else {
        out.song = null;
        out.note = "no match";
      }
    } catch {
      out.song = null;
      out.note = "lookup failed";
    }
  } else {
    out.song = null;
    out.note = "no clip";
  }
  return json(out);
});
