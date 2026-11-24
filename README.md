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

The sound sensor posts decibel readings to the `sensor_readings` table with the project's service key, which must stay on the sensor and never go in this repo.

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

## Rating only at the bar

To rate, the phone shares its location once. A rating goes through only if the phone is within 150 m of the bar (`NEAR_METERS` in config.js), or was in the last 5 minutes (`NEAR_WINDOW_MIN`). Phone location indoors is rough, so this can't tell apart bars next door to each other, and someone determined can fake their location. Each bar's `lat` and `lng` are in data.js.

## Android pilot app

`android/` is a small Android app that opens the live site full screen, so changes to the site reach it without a new download. GitHub Actions (`.github/workflows/android.yml`) builds it on every change to `android/` and puts `bar-vibe.apk` on the "android" release:

https://github.com/cissem9470/bar-vibe/releases/latest/download/bar-vibe.apk

Testers open that link on an Android phone, allow installs from their browser when asked, and install. Builds are signed with a test key, so a new build installs only after the old one is uninstalled.
