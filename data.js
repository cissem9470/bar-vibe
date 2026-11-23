// Demo bars. These are made up, so the demo never misstates a real bar's vibe.
// For a pilot, replace this list with the one or two real bars taking part
// (and, in live mode, the same ids go in the ratings table).
window.BARS = [
  {
    id: "copper-fox",
    name: "The Copper Fox",
    area: "Jersey City",
    kind: "Cocktail lounge",
    emoji: "🦊",
    hours: "5 PM to 2 AM",
    blurb: "Low lights, vinyl on the weekends, bartenders who remember your order.",
    profile: { crowd: 3.2, sound: 2.6, moods: ["Date night", "Chill", "Lively"], worth: 0.85, sensorDb: 72 }
  },
  {
    id: "dockside",
    name: "Dockside Tap",
    area: "Hoboken",
    kind: "Sports bar",
    emoji: "🏈",
    hours: "11 AM to 2 AM",
    blurb: "Forty screens, wings, and a crowd that lives and dies with the game.",
    profile: { crowd: 4.4, sound: 4.3, moods: ["Sports", "Packed", "Lively"], worth: 0.7, sensorDb: 86 }
  },
  {
    id: "neon-garden",
    name: "Neon Garden",
    area: "Lower East Side",
    kind: "Dance bar",
    emoji: "🪩",
    hours: "8 PM to 4 AM",
    blurb: "DJ from 10, small dance floor, gets going late.",
    profile: { crowd: 4.0, sound: 4.7, moods: ["Dance", "Packed", "Lively"], worth: 0.78, sensorDb: 94 }
  },
  {
    id: "quiet-owl",
    name: "The Quiet Owl",
    area: "Astoria",
    kind: "Wine bar",
    emoji: "🦉",
    hours: "4 PM to midnight",
    blurb: "Natural wine, board games, and room to actually talk.",
    profile: { crowd: 1.9, sound: 1.6, moods: ["Chill", "Date night"], worth: 0.9, sensorDb: 61 }
  },
  {
    id: "bodega-social",
    name: "Bodega Social",
    area: "Bushwick",
    kind: "Neighborhood dive",
    emoji: "🍻",
    hours: "3 PM to 4 AM",
    blurb: "Cheap beer, a jukebox with opinions, and a back patio.",
    profile: { crowd: 3.5, sound: 3.6, moods: ["Lively", "Chill", "Sports"], worth: 0.8, sensorDb: 79 }
  },
  {
    id: "harbor-rooftop",
    name: "Harbor Rooftop",
    area: "Weehawken",
    kind: "Rooftop bar",
    emoji: "🌇",
    hours: "4 PM to 1 AM",
    blurb: "Skyline view, sunset crowd, line at the door on Fridays.",
    profile: { crowd: 3.8, sound: 3.0, moods: ["Date night", "Lively", "Packed"], worth: 0.74, sensorDb: 76 }
  }
];

// The choices a person can pick when rating the vibe.
window.MOODS = [
  { id: "Chill", emoji: "😌" },
  { id: "Lively", emoji: "🎉" },
  { id: "Packed", emoji: "🫠" },
  { id: "Dance", emoji: "💃" },
  { id: "Date night", emoji: "🥂" },
  { id: "Sports", emoji: "📺" },
  { id: "Dead", emoji: "🦗" }
];

window.CROWD_LABELS = ["", "Empty", "Quiet", "Steady", "Busy", "Packed"];
window.SOUND_LABELS = ["", "Silent", "Easy to talk", "Background music", "Loud", "Can't hear yourself"];
