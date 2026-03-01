export interface Track {
  id: number
  title: string
  artist: string
  album?: string
  year?: number
  duration?: number
  audioQuality?: string
  coverUrl?: string | null
}

export type Mood = "chill" | "energetic" | "focus" | "melancholic" | "upbeat"

export const ALL_GENRES = [
  "Alternative",
  "Ambient",
  "Blues",
  "Classical",
  "Country",
  "Dance",
  "Electronic",
  "Folk",
  "Funk",
  "Gospel",
  "Hip Hop",
  "House",
  "Indie",
  "Jazz",
  "Latin",
  "Lo-fi",
  "Metal",
  "New Age",
  "Pop",
  "Punk",
  "R&B",
  "Reggae",
  "Rock",
  "Soul",
  "Techno",
  "World",
] as const

export type Genre = (typeof ALL_GENRES)[number]

export interface MoodConfig {
  id: Mood
  label: string
  emoji: string
  description: string
  gradient: string
  keywords: string[]
  bpmRange: [number, number]
}

export const MOODS: MoodConfig[] = [
  {
    id: "chill",
    label: "Chill",
    emoji: "🌙",
    description: "Relaxed & smooth",
    gradient: "from-blue-950 via-indigo-900 to-purple-950",
    keywords: ["chill", "relax", "ambient", "smooth", "mellow"],
    bpmRange: [60, 90],
  },
  {
    id: "energetic",
    label: "Energetic",
    emoji: "⚡",
    description: "High energy & intense",
    gradient: "from-orange-950 via-red-900 to-rose-950",
    keywords: ["energetic", "power", "intense", "driving", "hype"],
    bpmRange: [120, 160],
  },
  {
    id: "focus",
    label: "Focus",
    emoji: "🎯",
    description: "Deep concentration",
    gradient: "from-emerald-950 via-teal-900 to-cyan-950",
    keywords: ["focus", "instrumental", "minimal", "study", "concentration"],
    bpmRange: [90, 115],
  },
  {
    id: "melancholic",
    label: "Melancholic",
    emoji: "🌧️",
    description: "Emotional & reflective",
    gradient: "from-slate-950 via-gray-900 to-zinc-950",
    keywords: ["melancholy", "sad", "emotional", "dark", "reflective"],
    bpmRange: [55, 80],
  },
  {
    id: "upbeat",
    label: "Upbeat",
    emoji: "☀️",
    description: "Happy & positive",
    gradient: "from-yellow-950 via-amber-900 to-orange-950",
    keywords: ["upbeat", "happy", "feel good", "positive", "joyful"],
    bpmRange: [100, 130],
  },
]

export const GENRE_DISCOGS_MAP: Record<
  string,
  { genre?: string; style?: string }
> = {
  Alternative: { genre: "Rock", style: "Alternative Rock" },
  Ambient: { genre: "Electronic", style: "Ambient" },
  Blues: { genre: "Blues" },
  Classical: { genre: "Classical" },
  Country: { genre: "Folk, World, & Country", style: "Country" },
  Dance: { genre: "Electronic", style: "House" },
  Electronic: { genre: "Electronic" },
  Folk: { genre: "Folk, World, & Country", style: "Folk" },
  Funk: { genre: "Funk / Soul", style: "Funk" },
  Gospel: { genre: "Funk / Soul", style: "Gospel" },
  "Hip Hop": { genre: "Hip Hop" },
  House: { genre: "Electronic", style: "House" },
  Indie: { genre: "Rock", style: "Indie Rock" },
  Jazz: { genre: "Jazz" },
  Latin: { genre: "Latin" },
  "Lo-fi": { genre: "Electronic", style: "Lo-Fi" },
  Metal: { genre: "Rock", style: "Heavy Metal" },
  "New Age": { genre: "Electronic", style: "New Age" },
  Pop: { genre: "Pop" },
  Punk: { genre: "Rock", style: "Punk" },
  "R&B": { genre: "Funk / Soul", style: "Rhythm & Blues" },
  Reggae: { genre: "Reggae" },
  Rock: { genre: "Rock" },
  Soul: { genre: "Funk / Soul", style: "Soul" },
  Techno: { genre: "Electronic", style: "Techno" },
  World: { genre: "Folk, World, & Country" },
}
