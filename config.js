// Bar Vibe settings.
//
// With both values empty, the app runs in DEMO mode: sample bars and sample
// ratings, and any rating you add is kept only on your own phone.
//
// To make ratings LIVE (everyone sees everyone's ratings), create a free
// Supabase project, run supabase-setup.sql in its SQL editor, then paste the
// project URL and the "publishable" key (or the older "anon public" key) below. The anon key is meant to be
// public; the table rules in supabase-setup.sql only allow adding and reading
// ratings.
window.BAR_VIBE_CONFIG = {
  SUPABASE_URL: "https://pfvfwjuoswbiegqdjpmr.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_3Q3INFFC1VtpPFuhU5mP3g_-2MzphSe",

  // How far back ratings count toward "right now", in minutes.
  LIVE_WINDOW_MIN: 120,

  // A phone can rate the same bar again after this many minutes.
  RATE_COOLDOWN_MIN: 20
};
