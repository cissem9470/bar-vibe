# Bar Vibe

See a bar's live vibe before you go: how crowded it is, how loud it is, the mood, and whether the people inside say it's worth coming now.

**Live site:** https://cissem9470.github.io/bar-vibe/

It's a plain website (HTML, CSS and JavaScript, no server), hosted free on GitHub Pages. On a phone, use "Add to Home Screen" and it opens like an app.

## What's in it

- **Bars list**: every bar with its vibe right now, crowd and sound meters, top mood and "% say go now". Search, mood filters, and sort by best, busiest or quietest.
- **Bar page**: the full read on one bar, the in-bar sound sensor level, mood breakdown and the latest ratings from inside.
- **Rate the vibe**: four taps (crowd, sound, mood, would you tell a friend to come). One rating per phone per bar every 20 minutes.
- **For bars**: a short pitch page to show a bar owner for the pilot.

Ratings count for 2 hours, and newer ones count more.

## Demo mode vs live mode

Right now it runs in **demo mode**: the bars are made up, the ratings are generated samples that change through the evening, and your own ratings stay on your phone.

To go **live** (everyone sees everyone's ratings), it needs a free database:

1. Create a free project at Supabase.
2. In its SQL editor, run `supabase-setup.sql` from this repo.
3. Copy the project URL and the "anon public" key into `config.js`.
4. Replace the demo bars in `data.js` with the real pilot bars.

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
