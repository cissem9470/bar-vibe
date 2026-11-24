# Bar Vibe

See a bar's live vibe before you go: how crowded it is, how loud it is, the mood, and whether the people inside say it's worth coming now.

**Live site:** https://cissem9470.github.io/bar-vibe/

It's a plain website (HTML, CSS and JavaScript, no server), hosted free on GitHub Pages. On a phone, use "Add to Home Screen" and it opens like an app.

## What's in it

- **Bars list**: every bar with its vibe right now, crowd and sound meters, top mood and "% say go now". Search, mood and music filters, and sort by best, busiest or quietest.
- **Bar page**: the full read on one bar, the in-bar sound sensor level, mood breakdown and the latest ratings from inside.
- **Rate the vibe**: a few taps (crowd, sound, mood, what music is playing, would you tell a friend to come). One rating per phone per bar every 20 minutes.
- **For bars**: a short pitch page to show a bar owner for the pilot.

Ratings count for 2 hours, and newer ones count more.

## Demo mode vs live mode

Right now it lists 13 real bars around Grove Street in downtown Jersey City. Until live ratings are switched on, a rating you add stays on your own phone.

To go **live** (everyone sees everyone's ratings), it needs a free database:

1. Sign up at Supabase with "Continue with GitHub" and create a free project.
2. In its SQL editor, run `supabase-setup.sql` from this repo.
3. Copy the project URL and the "publishable" key (or the older "anon public" key) into `config.js`.

The sound sensor is a phone running `sensor.html` (see below). It never holds a secret key: it sends a pairing code to the `now-playing` edge function, which writes to `sensor_readings` and `now_playing`.

## "Now playing" sensor phone

One old Android phone, plugged in near a bar's speakers, can tell the app what song is playing and how loud it is.

1. In the dashboard (admin), under **Sensor phones**, pick the bar and tap **Make a sensor code**.
2. On the phone, open `sensor.html` in Chrome, type the code, tap **Start listening** and allow the microphone. Keep the page open and the phone charging.
3. Every 1, 2 or 5 minutes it records 8 seconds, measures loudness, and sends the clip to the `now-playing` Supabase edge function. The function saves the loudness, sends the clip to AudD to name the song, and saves only the title and artist. Clips aren't stored.

Song names stay off until an AudD API token is added as an edge function secret named `AUDD_API_TOKEN` (Supabase dashboard → Edge Functions → Secrets). Until then the phone still sends loudness. AudD gives a few hundred free lookups, then a paid plan; one phone checking every 2 minutes uses about 30 lookups an hour.

Only put a sensor in with the bar's written okay. The app's About page tells guests what it does.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page shell |
| `app.js` | Screens and interactions |
| `store.js` | Loads and saves ratings (demo or Supabase) |
| `data.js` | The bars and rating choices |
| `config.js` | Live-mode settings |
| `styles.css` | The look |
| `supabase-setup.sql` | Database setup for live mode |
| `sensor.html`, `sensor.js` | Sensor mode for the in-bar phone |
| `supabase/functions/now-playing/` | Edge function: checks the sensor code, saves loudness, looks up the song |
| `dashboard.html`, `dashboard.js`, `dashboard.css` | Bar owner and admin dashboard |

## Rating only at the bar

To rate, the phone shares its location once. A rating goes through only if the phone is within 150 m of the bar (`NEAR_METERS` in config.js), or was in the last 5 minutes (`NEAR_WINDOW_MIN`). Phone location indoors is rough, so this can't tell apart bars next door to each other, and someone determined can fake their location. Each bar's `lat` and `lng` are in data.js.

## Android pilot app

`android/` is a small Android app that opens the live site full screen, so changes to the site reach it without a new download. GitHub Actions (`.github/workflows/android.yml`) builds it on every change to `android/` and puts `bar-vibe.apk` on the "android" release:

https://github.com/cissem9470/bar-vibe/releases/latest/download/bar-vibe.apk

Testers open that link on an Android phone, allow installs from their browser when asked, and install. Builds are signed with a test key, so a new build installs only after the old one is uninstalled.

## Bar owner dashboard

`dashboard.html` is a separate sign-in page. There is no password: you type your email and get a sign-in link.

- **Bar owners** see only their own bar: ratings per day, busiest hours, weekdays, mood and music mix, and the latest ratings.
- **Admins** see every bar, can add or hide bars, and link an owner's email to a bar.

The database enforces this, not the page. Rating history is only readable by the bar's linked owner and admins; the public app only sees the last 3 hours. Which phone sent a rating is never readable from the site. Admins are added only in the Supabase SQL editor (see the end of `supabase-setup.sql`).

Setup in the Supabase dashboard, once:

1. **Authentication → URL Configuration:** set Site URL to `https://cissem9470.github.io/bar-vibe/dashboard.html` and add it under Redirect URLs.
2. **Authentication → Emails → SMTP Settings:** Supabase's built-in email only reaches members of your Supabase team. Before owners can sign in, connect an email sender (for example a free Resend or Brevo account).
