import { NextRequest, NextResponse } from "next/server"
import { getArtistsByDiscogParams, getArtistsByGenreAndMood } from "@/lib/discogs"
import { searchArtist } from "@/lib/monochrome"
import { ALL_GENRES } from "@/lib/types"
import type { Track, Mood } from "@/lib/types"

const GROQ_KEY = process.env.GROQ_API_KEY

// Discogs genre taxonomy values
const DISCOGS_GENRES = [
  "Jazz", "Electronic", "Hip Hop", "Rock", "Funk / Soul",
  "Classical", "Blues", "Folk, World, & Country", "Pop", "Reggae", "Latin",
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const STOCK_ARTIST_PATTERNS = [
  /chill(?: out| lounge| music| zone| vibes| hop)?/i,
  /lounge(?: music| bar| café)?/i,
  /relaxing(?: music)?/i,
  /study(?: music| time| music group)?/i,
  /yoga(?: music)?/i,
  /spa(?: music)?/i,
  /meditation(?: music)?/i,
  /sleep(?: music)?/i,
  /background(?: music)?/i,
  /workout(?: music)?/i,
  /smooth jazz (?:club|radio|collective)/i,
  /jazz (?:club|bar|lounge|academy)/i,
  /all stars?$/i,
  /bgm/i,
  /exam study/i,
  /instrumental music/i,
]

function isStockArtist(name: string): boolean {
  return STOCK_ARTIST_PATTERNS.some((re) => re.test(name))
}

function filterByArtistMatch(tracks: Track[], seedArtist: string): Track[] {
  const seed = seedArtist.toLowerCase().trim()
  const words = seed.split(/\s+/).filter((w) => w.length >= 4)
  return tracks.filter((t) => {
    const a = t.artist.toLowerCase()
    return words.length === 0 || words.some((w) => a.includes(w))
  })
}

interface GroqResult {
  artists: string[]
  deep_cuts: string[]
  discogs: {
    genre?: string
    style?: string
    country?: string
    year_start?: string
    year_end?: string
  }
  fallback_genres: string[]
  mood: Mood
}

async function queryGroq(userQuery: string): Promise<GroqResult> {
  const prompt = `You are a music expert and Discogs database specialist.

The user wants to hear: "${userQuery}"

Extract music parameters and respond with a JSON object ONLY (no markdown):

{
  "artists": ["Artist 1", ...],
  "deep_cuts": ["Obscure Artist 1", ...],
  "discogs": {
    "genre": "...",
    "style": "...",
    "country": "...",
    "year_start": "YYYY",
    "year_end": "YYYY"
  },
  "fallback_genres": ["Genre1"],
  "mood": "chill"
}

Rules:
- "artists": 8-10 well-known/landmark artists matching the request (the obvious names a fan would cite)
- "deep_cuts": 8-10 underground, rare, or cult artists from the same scene — NOT in "artists", NOT famous, genuinely obscure gems that only hardcore fans know. Think: session musicians who led their own projects, regional artists, one-album wonders, forgotten labels.
- "discogs.genre": one of: ${DISCOGS_GENRES.join(", ")}
- "discogs.style": specific Discogs subgenre (e.g. "Modal", "Bossa Nova", "Detroit Techno", "Dub")
- "discogs.country": Discogs country name (e.g. "Italy", "France", "US", "UK", "Germany") — omit if not mentioned
- "discogs.year_start"/"year_end": decade start/end — omit if not mentioned
- "fallback_genres": from: ${(ALL_GENRES as readonly string[]).join(", ")}
- "mood": one of: chill, energetic, focus, melancholic, upbeat

Examples:
- "jazz italiano anni 70" → {"artists":["Enrico Rava","Franco D'Andrea","Giorgio Gaslini","Area","Pepi Lemer"],"deep_cuts":["Gaetano Liguori","Giancarlo Schiaffini","Bruno Tommaso","Gruppo Romano Free Jazz","Lino Patruno","Eje Thelin","Mario Schiano","Antonello Salis"],"discogs":{"genre":"Jazz","style":"Modal","country":"Italy","year_start":"1970","year_end":"1979"},"fallback_genres":["Jazz"],"mood":"chill"}
- "techno berlinese anni 90" → {"artists":["Basic Channel","Maurizio","Monolake","Robert Hood"],"deep_cuts":["Porter Ricks","Substance","Vainqueur","Scion","Enforcement","Cyrus","Jodey Kendrick","Dj Rolando"],"discogs":{"genre":"Electronic","style":"Minimal Techno","country":"Germany","year_start":"1990","year_end":"1999"},"fallback_genres":["Techno","Electronic"],"mood":"energetic"}`

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 900,
      response_format: { type: "json_object" },
    }),
  })

  if (!res.ok) throw new Error(`Groq ${res.status}`)

  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ""
  const parsed = JSON.parse(text) as Partial<GroqResult>

  const validMoods: Mood[] = ["chill", "energetic", "focus", "melancholic", "upbeat"]
  const mood = validMoods.includes(parsed.mood as Mood) ? (parsed.mood as Mood) : "chill"

  const allGenres = ALL_GENRES as readonly string[]
  const fallback_genres = (parsed.fallback_genres ?? []).filter((g) => allGenres.includes(g))
  const filterArtists = (arr: unknown[]) =>
    arr.filter((a): a is string => typeof a === "string" && a.length > 1 && !isStockArtist(a))

  const artists = filterArtists(parsed.artists ?? [])
  const deep_cuts = filterArtists(parsed.deep_cuts ?? [])
    .filter((a) => !artists.includes(a)) // no overlap

  return {
    artists,
    deep_cuts,
    discogs: parsed.discogs ?? {},
    fallback_genres: fallback_genres.length > 0 ? fallback_genres : [...allGenres],
    mood,
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim()
  if (!q) return NextResponse.json([])

  const seenParam = req.nextUrl.searchParams.get("seen") || ""
  const seenIds = new Set<number>(
    seenParam ? seenParam.split(",").map(Number).filter(Boolean) : []
  )

  let groqArtists: string[] = []
  let groqDeepCuts: string[] = []
  let discogsParams: GroqResult["discogs"] = {}
  let fallbackGenres: string[] = [...ALL_GENRES]
  let mood: Mood = "chill"

  if (GROQ_KEY) {
    try {
      const result = await queryGroq(q)
      groqArtists = result.artists
      groqDeepCuts = result.deep_cuts
      discogsParams = result.discogs
      fallbackGenres = result.fallback_genres
      mood = result.mood
    } catch {
      // fallback silently
    }
  }

  const tracks: Track[] = []
  const usedIds = new Set<number>()

  function addTracks(items: Track[], seedName: string, limit = 3) {
    const pool = shuffle([...filterByArtistMatch(items, seedName)])
    let added = 0
    for (const t of pool) {
      if (tracks.length >= 30 || added >= limit) break
      if (!t.id || usedIds.has(t.id)) continue
      if (seenIds.has(t.id)) continue
      if (isStockArtist(t.artist)) continue
      usedIds.add(t.id)
      tracks.push(t)
      added++
    }
  }

  // STEP 1: Well-known Groq artists → 2 tracks each (leave room for deep cuts)
  if (groqArtists.length > 0) {
    const searches = await Promise.allSettled(
      groqArtists.slice(0, 10).map((a) => searchArtist(a))
    )
    for (let i = 0; i < searches.length; i++) {
      const r = searches[i]
      if (r.status !== "fulfilled") continue
      addTracks(r.value, groqArtists[i], 2)
    }
  }

  // STEP 2: Deep cuts — obscure/cult artists, up to 3 tracks each
  if (groqDeepCuts.length > 0) {
    const searches = await Promise.allSettled(
      groqDeepCuts.slice(0, 10).map((a) => searchArtist(a))
    )
    for (let i = 0; i < searches.length; i++) {
      const r = searches[i]
      if (r.status !== "fulfilled") continue
      addTracks(r.value, groqDeepCuts[i], 3)
    }
  }

  // STEP 3: Discogs targeted query → fills remaining slots
  if (tracks.length < 20 && Object.keys(discogsParams).length > 0) {
    const discogsArtists = await getArtistsByDiscogParams({
      genre:     discogsParams.genre,
      style:     discogsParams.style,
      country:   discogsParams.country,
      yearStart: discogsParams.year_start,
      yearEnd:   discogsParams.year_end,
    })
    const realArtists = discogsArtists.filter((a) => !isStockArtist(a))
    const searches = await Promise.allSettled(
      realArtists.slice(0, 20).map((a) => searchArtist(a))
    )
    for (let i = 0; i < searches.length; i++) {
      const r = searches[i]
      if (r.status !== "fulfilled") continue
      addTracks(r.value, realArtists[i])
    }
  }

  // STEP 4: Generic fallback if still too few tracks
  if (tracks.length < 15) {
    const fallbackArtists = await getArtistsByGenreAndMood(fallbackGenres, mood)
    const realFallback = fallbackArtists.filter((a) => !isStockArtist(a))
    const searches = await Promise.allSettled(
      realFallback.slice(0, 15).map((a) => searchArtist(a))
    )
    for (let i = 0; i < searches.length; i++) {
      const r = searches[i]
      if (r.status !== "fulfilled") continue
      addTracks(r.value, realFallback[i])
    }
  }

  return NextResponse.json(shuffle(tracks).slice(0, 30))
}
