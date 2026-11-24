// Real bars in downtown Jersey City, around Grove Street.
// These get no sample ratings: a bar only shows a vibe once real people rate it.
// A bar with a "profile" field is a made-up demo bar and gets generated sample ratings.
window.BARS = [
  { id: "hudson-hall", name: "Hudson Hall", area: "364 Marin Blvd", lat: 40.7212851, lng: -74.0408437, kind: "Beer hall and sports bar", emoji: "🍺",
    blurb: "Big beer hall with craft brews, smoked meats and the game on." },
  { id: "legends-fc", name: "Legends FC", area: "130 Newark Ave", lat: 40.7202783, lng: -74.0431771, kind: "Sports and cocktail bar", emoji: "⚽",
    blurb: "Sports and cocktail bar with a giant LED screen behind the bar and DJs." },
  { id: "boots-and-bones", name: "Boots & Bones", area: "116 Newark Ave", lat: 40.7200335, lng: -74.0426348, kind: "Western bar and BBQ", emoji: "🤠",
    blurb: "Wild West BBQ spot with line dancing, and a club floor downstairs." },
  { id: "under-the-boot", name: "Under The Boot", area: "116 Newark Ave", lat: 40.7200335, lng: -74.0426348, kind: "Speakeasy lounge", emoji: "🪩",
    blurb: "DJ-driven lounge under Boots & Bones, Friday and Saturday nights." },
  { id: "south-house", name: "South House", area: "149 Newark Ave", lat: 40.720503, lng: -74.0442017, kind: "Southern bar and restaurant", emoji: "🍗",
    blurb: "Huge, lively room with Southern food and a basement game room." },
  { id: "the-ashford", name: "The Ashford", area: "145 Newark Ave", lat: 40.7204381, lng: -74.0441076, kind: "Bar and rooftop", emoji: "🌆",
    blurb: "High ceilings, a rooftop, and a late crowd on weekends." },
  { id: "porta", name: "Porta", area: "135 Newark Ave", lat: 40.7202212, lng: -74.0437028, kind: "Pizza bar and rooftop", emoji: "🍕",
    blurb: "Pizza downstairs, rooftop bar and dance floor on weekend nights." },
  { id: "grove-station", name: "The Grove Station", area: "116 Newark Ave", lat: 40.7200039, lng: -74.0425885, kind: "Gastropub", emoji: "🚉",
    blurb: "Coffee by day, gastropub and speakeasy by night." },
  { id: "the-archer", name: "The Archer", area: "176 Newark Ave", lat: 40.7213212, lng: -74.0452384, kind: "Cocktail bar", emoji: "🏹",
    blurb: "Dark wood, good cocktails and duck poutine." },
  { id: "oharas", name: "O'Hara's Bar & Grill", area: "172 1st St", lat: 40.7216698, lng: -74.0408067, kind: "Irish pub", emoji: "☘️",
    blurb: "Big Irish pub for sports, trivia and late-night food." },
  { id: "lucky-7", name: "Lucky 7 Tavern", area: "322 2nd St", lat: 40.7229439, lng: -74.0473585, kind: "Neighborhood bar", emoji: "🎰",
    blurb: "Dim, whiskey-heavy local with a jukebox and BBQ bites." },
  { id: "keyhole", name: "The Keyhole Bar", area: "242 Bay St", lat: 40.72124, lng: -74.044524, kind: "Dive bar", emoji: "🗝️",
    blurb: "Cash-only dive with karaoke, games and cheap drinks." },
  { id: "dullboy", name: "dullboy", area: "364 Grove St", lat: 40.7213918, lng: -74.0425412, kind: "Cocktail bar", emoji: "🍸",
    blurb: "Small cocktail bar a short walk from Grove Street." }
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

// What's playing. Optional when rating.
window.MUSIC = [
  { id: "House", emoji: "🏠" },
  { id: "Techno / Rave", emoji: "⚡" },
  { id: "Hip hop / Rap", emoji: "🎤" },
  { id: "R&B", emoji: "💜" },
  { id: "Afrobeats", emoji: "🥁" },
  { id: "Latin / Reggaeton", emoji: "💃" },
  { id: "Pop / Top 40", emoji: "📻" },
  { id: "Rock", emoji: "🎸" },
  { id: "Live band", emoji: "🎷" },
  { id: "Jukebox / Mix", emoji: "🎶" }
];

window.CROWD_LABELS = ["", "Empty", "Quiet", "Steady", "Busy", "Packed"];
window.SOUND_LABELS = ["", "Silent", "Easy to talk", "Background music", "Loud", "Can't hear yourself"];
